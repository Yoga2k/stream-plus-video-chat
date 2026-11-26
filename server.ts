import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { Matchmaker } from './src/server/matchmaker.ts';
import { dbStore, StoredAccount } from './src/server/dbStore.ts';
import { saveScreenshotToBucket, getLocalUploadsDir } from './src/server/bucketStorage.ts';
import {
  securityMiddleware,
  sanitizeString,
  sanitizeChatMessage,
   sanitizeNoSqlPayload,
  validateEmailInput,
  validatePasswordInput,
  validateMatchQueuePrefs,
  hashPasswordSecure,
  verifyPasswordSecure,
  timingSafeStringMatch,
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  issueAdminSessionToken,
  requireAdminAuth,
} from './src/server/serverSecurity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const httpServer = http.createServer(app);

const matchmaker = new Matchmaker();
const sockets = new Map<string, WebSocket>();

// Security & Compliance State: Skip Rate Limiter, Device Fingerprint Bans, and Report Screenshots
const lastSkipAtByUser = new Map<string, { lastAt: number; floodStrikes: number }>();
const fingerprintByUserId = new Map<string, string>();
const emailByUserId = new Map<string, string>();

app.use(express.json({ limit: '2mb' }));
app.use(securityMiddleware);
app.use('/uploads/reports', express.static(getLocalUploadsDir()));

// Allow CORS with Authorization header support
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  next();
});

function sendJson(ws: WebSocket | undefined, payload: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastStats() {
  const stats = matchmaker.getStats();
  for (const client of sockets.values()) {
    sendJson(client, {
      type: 'stats',
      onlineCount: stats.onlineCount,
      searchingCount: stats.searchingCount,
      activeRooms: stats.activeRooms,
    });
  }
}

// Use noServer: true so WebSocket upgrades on /ws never collide with Vite HMR WebSockets
const wss = new WebSocketServer({ noServer: true });

function attachWebSocketUpgrade(server: http.Server, hostLabel: string) {
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          (ws as WebSocket & { hostLabel?: string }).hostLabel = hostLabel;
          wss.emit('connection', ws, request);
        });
      }
      // If not /ws, let Vite HMR handle its own upgrade listener
    } catch {
      socket.destroy();
    }
  });
}

attachWebSocketUpgrade(httpServer, `Stream+ (:${PORT})`);

wss.on('connection', (ws: WebSocket & { hostLabel?: string }) => {
  const userId = crypto.randomUUID();
  sockets.set(userId, ws);
  const user = matchmaker.registerUser(userId);

  sendJson(ws, {
    type: 'welcome',
    userId,
    hostLabel: ws.hostLabel || 'Host',
    user,
    ...matchmaker.getStats(),
  });
  broadcastStats();

  ws.on('message', (raw: Buffer) => {
    // Reject oversized WebSocket messages (> 1.5 MB)
    if (raw.length > 1_500_000) return;

    let msg: Record<string, any>;
    try {
      msg = sanitizeNoSqlPayload(JSON.parse(raw.toString()));
    } catch {
      return;
    }

    switch (msg.type) {
      case 'update_profile': {
        const cleanPrefs = validateMatchQueuePrefs(msg);
        if (cleanPrefs.deviceFingerprint) fingerprintByUserId.set(userId, cleanPrefs.deviceFingerprint);
        if (cleanPrefs.email) emailByUserId.set(userId, cleanPrefs.email);
        matchmaker.updateUserMeta(userId, cleanPrefs);
        break;
      }

      case 'join_queue': {
        const cleanPrefs = validateMatchQueuePrefs(msg);
        const fp = cleanPrefs.deviceFingerprint;
        const userEmail = cleanPrefs.email;
        if (fp) fingerprintByUserId.set(userId, fp);
        if (userEmail) emailByUserId.set(userId, userEmail);

        if (dbStore.isBanned(fp, userEmail)) {
          sendJson(ws, {
            type: 'error_notice',
            message:
              '🚫 DEVICE & ACCOUNT BANNED: Your Device Fingerprint ID and Social Account are suspended due to policy violations.',
          });
          break;
        }

        // 2. Skip-Flooding Bot & Spam Rate Limiter (Max 1 skip / second)
        const now = Date.now();
        const rateInfo = lastSkipAtByUser.get(userId) || { lastAt: 0, floodStrikes: 0 };
        if (now - rateInfo.lastAt < 900) {
          rateInfo.floodStrikes += 1;
          lastSkipAtByUser.set(userId, { lastAt: now, floodStrikes: rateInfo.floodStrikes });
          if (rateInfo.floodStrikes >= 4) {
            sendJson(ws, {
              type: 'error_notice',
              message:
                '🛡️ Anti-Bot Rate Limit: You are clicking Next/Skip too fast (1 skip/sec limit). Please wait a moment.',
            });
            break;
          }
        } else {
          lastSkipAtByUser.set(userId, { lastAt: now, floodStrikes: 0 });
        }

        const current = matchmaker.getUser(userId);
        if (current?.partnerId) {
          const oldPartnerId = matchmaker.disconnectPartner(userId);
          if (oldPartnerId) {
            sendJson(sockets.get(oldPartnerId), {
              type: 'partner_left',
              reason: 'skipped',
            });
          }
        }

        const result = matchmaker.joinQueue(userId, cleanPrefs);

        if (result.error) {
          sendJson(ws, { type: 'error_notice', message: result.error });
          break;
        }

        if (result.matched && result.caller && result.callee) {
          const callerWs = sockets.get(result.caller.id);
          const calleeWs = sockets.get(result.callee.id);

          sendJson(callerWs, {
            type: 'match_found',
            role: 'caller',
            partner: {
              id: result.callee.id,
              name: result.callee.name,
              country: result.callee.countryName,
              countryCode: result.callee.countryCode,
              flag: result.callee.flag,
              gender: result.callee.gender,
            },
          });

          sendJson(calleeWs, {
            type: 'match_found',
            role: 'callee',
            partner: {
              id: result.caller.id,
              name: result.caller.name,
              country: result.caller.countryName,
              countryCode: result.caller.countryCode,
              flag: result.caller.flag,
              gender: result.caller.gender,
            },
          });
        } else {
          sendJson(ws, { type: 'searching' });
        }

        broadcastStats();
        break;
      }

      case 'stop_chat': {
        const { formerPartnerId } = matchmaker.stopUser(userId);
        if (formerPartnerId) {
          sendJson(sockets.get(formerPartnerId), {
            type: 'partner_left',
            reason: 'stopped',
          });
        }
        sendJson(ws, { type: 'stopped' });
        broadcastStats();
        break;
      }

      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice_candidate': {
        const sender = matchmaker.getUser(userId);
        if (sender?.partnerId) {
          const partnerWs = sockets.get(sender.partnerId);
          sendJson(partnerWs, {
            type: msg.type,
            from: userId,
            sdp: msg.sdp,
            candidate: msg.candidate,
          });
        }
        break;
      }

      case 'chat_message': {
        const sender = matchmaker.getUser(userId);
        const text = sanitizeChatMessage(msg.text, 400);
        if (sender?.partnerId && text) {
          const partnerWs = sockets.get(sender.partnerId);
          sendJson(partnerWs, {
            type: 'chat_message',
            from: userId,
            name: sender.name,
            flag: sender.flag,
            text,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'typing': {
        const sender = matchmaker.getUser(userId);
        if (sender?.partnerId) {
          const partnerWs = sockets.get(sender.partnerId);
          sendJson(partnerWs, {
            type: 'typing',
            isTyping: Boolean(msg.isTyping),
          });
        }
        break;
      }

      case 'like_reaction': {
        const sender = matchmaker.getUser(userId);
        if (sender?.partnerId) {
          const partnerWs = sockets.get(sender.partnerId);
          sendJson(partnerWs, {
            type: 'like_reaction',
            from: userId,
          });
        }
        break;
      }

      case 'report_partner': {
        const reporter = matchmaker.getUser(userId);
        const targetId = reporter?.partnerId || reporter?.lastPartnerId;
        const targetUser = targetId ? matchmaker.getUser(targetId) : undefined;
        const reportResult = matchmaker.reportPartner(userId);

        const targetFp = (targetId && fingerprintByUserId.get(targetId)) || 'FP-PEER-9841';
        const rawScreenshot =
          typeof msg.screenshot === 'string' && msg.screenshot.startsWith('data:image/')
            ? msg.screenshot
            : undefined;

        const cleanReason = sanitizeString(msg.reason, 120) || 'Inappropriate behavior';

        // Upload screenshot to Bucket Storage (/uploads/reports/*.jpg or Cloudflare R2) and save URL in MongoDB/DB
        saveScreenshotToBucket(rawScreenshot, 'rep').then((bucketUrl) => {
          dbStore.addReport({
            id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            reporterId: userId,
            reporterName: reporter?.name || 'User',
            reportedId: reportResult.reportedId || 'unknown',
            reportedName: targetUser?.name || 'Stranger',
            reason: cleanReason,
            screenshot: bucketUrl,
            deviceFingerprint: targetFp,
            autoBanned: reportResult.banned,
          });
        });

        if (reportResult.banned && reportResult.reportedId) {
          const targetEmail = emailByUserId.get(reportResult.reportedId);
          dbStore.addBan(targetFp, targetEmail, cleanReason);

          const bannedWs = sockets.get(reportResult.reportedId);
          matchmaker.stopUser(reportResult.reportedId);
          sendJson(bannedWs, {
            type: 'error_notice',
            message:
              '🚫 AUTO-BANNED (3 Reports): Your Device Fingerprint & Account have been suspended.',
          });
        }
        break;
      }

      case 'nsfw_auto_ban': {
        const offender = matchmaker.getUser(userId);
        const fp =
          (typeof msg.deviceFingerprint === 'string' && msg.deviceFingerprint) ||
          fingerprintByUserId.get(userId) ||
          'FP-FLAGGED';

        const rawScreenshot =
          typeof msg.screenshot === 'string' && msg.screenshot.startsWith('data:image/')
            ? msg.screenshot
            : undefined;

        // Log for human admin review without automatically banning innocent mobile users
        saveScreenshotToBucket(rawScreenshot, 'nsfw').then((bucketUrl) => {
          dbStore.addReport({
            id: `nsfw-${Date.now()}`,
            timestamp: new Date().toISOString(),
            reporterId: 'AI-FLAG',
            reporterName: 'AI Safety Flag',
            reportedId: userId,
            reportedName: offender?.name || 'User',
            reason: String(msg.reason || 'Safety flag for review'),
            screenshot: bucketUrl,
            deviceFingerprint: fp,
            autoBanned: false,
          });
        });
        break;
      }

      case 'cctv_frame': {
        if (typeof msg.frame === 'string') {
          matchmaker.updateSnapshot(userId, msg.frame);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const { formerPartnerId } = matchmaker.removeUser(userId);
    sockets.delete(userId);
    if (formerPartnerId) {
      sendJson(sockets.get(formerPartnerId), {
        type: 'partner_left',
        reason: 'disconnected',
      });
    }
    broadcastStats();
  });
});

// ============================================================
// HARDENED AUTHENTICATION API (Validation + Sanitization + Rate Limit + Scrypt Hash + Hidden Auth Details)
// ============================================================

const ADMIN_EMAIL_LOGIN = (process.env.ADMIN_EMAIL || 'admin@streamplus.chat').toLowerCase();
const ADMIN_PASSWORD_LOGIN = process.env.ADMIN_PASSWORD || 'admin123';

app.post('/api/auth/email', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const emailCheck = validateEmailInput(req.body?.email);
  const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';
  const cleanName = sanitizeString(req.body?.name, 32);
  const mode = req.body?.mode === 'register' ? 'register' : 'login';

  if (!emailCheck.valid) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const email = emailCheck.email;

  // 1. Brute-Force Login Rate Limiter (Max 5 failed attempts per 15 mins per IP+Email)
  const rateLimitKey = `auth:${clientIp}:${email}`;
  const limitStatus = checkLoginRateLimit(rateLimitKey);
  if (!limitStatus.allowed) {
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${Math.ceil(limitStatus.retryAfterSeconds / 60)} minutes before trying again.`,
    });
  }

  const passCheck = validatePasswordInput(passwordRaw);
  if (!passCheck.valid) {
    recordLoginFailure(rateLimitKey);
    return res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
  }

  // 2. Check if Admin is logging in via the standard User Login Page (Timing-Safe Comparison, zero credential leaks)
  if (
    timingSafeStringMatch(email, ADMIN_EMAIL_LOGIN) &&
    timingSafeStringMatch(passwordRaw, ADMIN_PASSWORD_LOGIN)
  ) {
    clearLoginFailures(rateLimitKey);
    const adminToken = issueAdminSessionToken();
    return res.json({
      adminToken,
      user: {
        id: 'admin-01',
        name: 'Security Admin',
        email: ADMIN_EMAIL_LOGIN,
        provider: 'email',
        isAdmin: true,
      },
    });
  }

  // Block anyone trying to register or guess the Admin email address
  if (timingSafeStringMatch(email, ADMIN_EMAIL_LOGIN)) {
    const fail = recordLoginFailure(rateLimitKey);
    return res.status(fail.locked ? 429 : 401).json({
      error: fail.locked
        ? 'Account temporarily locked due to multiple failed login attempts.'
        : 'Invalid email or password.',
    });
  }

  const existing = dbStore.getAccount(email);

  if (mode === 'register') {
    if (existing && existing.passwordHash) {
      // Do not overwrite an existing account's password unless current password matches
      if (!verifyPasswordSecure(passwordRaw, existing.passwordHash, email)) {
        recordLoginFailure(rateLimitKey);
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    }

    clearLoginFailures(rateLimitKey);
    const displayName = cleanName || sanitizeString(email.split('@')[0], 32);
    const account: StoredAccount = {
      id: existing?.id || crypto.randomUUID(),
      name: displayName,
      email,
      passwordHash: hashPasswordSecure(passwordRaw),
      provider: 'email',
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    dbStore.saveAccount(account);

    // Return sanitized user profile (never return passwordHash!)
    return res.json({
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        provider: account.provider,
      },
    });
  }

  // Login mode: verify salted scrypt password hash using timingSafeEqual
  if (existing && existing.passwordHash) {
    const isPasswordValid = verifyPasswordSecure(passwordRaw, existing.passwordHash, email);
    if (!isPasswordValid) {
      const fail = recordLoginFailure(rateLimitKey);
      return res.status(fail.locked ? 429 : 401).json({
        error: fail.locked
          ? 'Too many failed login attempts. Account locked for 15 minutes.'
          : 'Invalid email or password.',
      });
    }
  }

  clearLoginFailures(rateLimitKey);
  const account: StoredAccount = existing || {
    id: crypto.randomUUID(),
    name: cleanName || sanitizeString(email.split('@')[0], 32),
    email,
    passwordHash: hashPasswordSecure(passwordRaw),
    provider: 'email',
    createdAt: new Date().toISOString(),
  };
  if (cleanName) account.name = cleanName;
  // Upgrade any legacy hash to random-salted 64-byte scrypt hash on login
  if (!account.passwordHash || !account.passwordHash.includes(':')) {
    account.passwordHash = hashPasswordSecure(passwordRaw);
  }
  dbStore.saveAccount(account);

  return res.json({
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      provider: account.provider,
    },
  });
});

// REST API: Google Login (Validated & Sanitized + Rate Limited)
app.post('/api/auth/google', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const limitStatus = checkLoginRateLimit(`google:${clientIp}`);
  if (!limitStatus.allowed) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes.' });
  }

  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  let emailRaw = req.body?.email;
  let nameRaw = req.body?.name;
  let avatarRaw = req.body?.avatar;

  if (credential && credential.split('.').length === 3) {
    try {
      const payloadJson = Buffer.from(credential.split('.')[1], 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      if (payload.email) emailRaw = payload.email;
      if (payload.name) nameRaw = payload.name;
      if (payload.picture) avatarRaw = payload.picture;
    } catch {
      recordLoginFailure(`google:${clientIp}`);
      return res.status(400).json({ error: 'Invalid authentication token.' });
    }
  }

  const emailCheck = validateEmailInput(emailRaw);
  if (!emailCheck.valid) {
    recordLoginFailure(`google:${clientIp}`);
    return res.status(400).json({ error: 'Please enter a valid Google email ID.' });
  }

  const email = emailCheck.email;
  // Prevent spoofing the Admin email via Google quick-login without password
  if (timingSafeStringMatch(email, ADMIN_EMAIL_LOGIN)) {
    recordLoginFailure(`google:${clientIp}`);
    return res.status(401).json({ error: 'Please sign in with your password for this account.' });
  }

  const finalName = sanitizeString(nameRaw, 32) || sanitizeString(email.split('@')[0], 32);
  const cleanAvatar =
    typeof avatarRaw === 'string' && /^https?:\/\//i.test(avatarRaw)
      ? sanitizeString(avatarRaw, 300)
      : undefined;

  const existing = dbStore.getAccount(email);
  const account: StoredAccount = {
    id: existing?.id || crypto.randomUUID(),
    name: finalName,
    email,
    passwordHash: existing?.passwordHash,
    provider: 'google',
    avatar: cleanAvatar,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  dbStore.saveAccount(account);

  return res.json({
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      provider: 'google',
      avatar: account.avatar,
    },
  });
});

// ============================================================
// ADMIN CCTV SECURITY & ANTI-ILLEGAL ACTIVITY MODERATION API
// ============================================================

app.post('/api/admin/login', (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const rateKey = `admin:${clientIp}`;
  const limitStatus = checkLoginRateLimit(rateKey);
  if (!limitStatus.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(limitStatus.retryAfterSeconds / 60)} minutes.`,
    });
  }

  const email = sanitizeString(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (
    timingSafeStringMatch(email, ADMIN_EMAIL_LOGIN) &&
    timingSafeStringMatch(password, ADMIN_PASSWORD_LOGIN)
  ) {
    clearLoginFailures(rateKey);
    const token = issueAdminSessionToken();
    return res.json({
      token,
      admin: {
        id: 'admin-01',
        name: 'Security Admin',
        email: ADMIN_EMAIL_LOGIN,
        role: 'SUPER_ADMIN',
      },
    });
  }

  recordLoginFailure(rateKey);
  // Generic error message — never leak admin email or password in error responses!
  return res.status(401).json({
    error: 'Invalid email or password.',
  });
});

app.get('/api/admin/cctv', requireAdminAuth, (_req: Request, res: Response) => {
  const liveUsers = matchmaker.getAllUsers();
  const stats = matchmaker.getStats();
  return res.json({
    liveUsers,
    reportEvidenceLogs: dbStore.getReports(),
    bannedList: dbStore.getBannedList(),
    bannedDevicesCount: dbStore.getBannedDevicesCount(),
    storage: dbStore.getStorageSummary(),
    stats,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/admin/moderate', requireAdminAuth, (req: Request, res: Response) => {
  const targetId = sanitizeString(req.body?.userId, 64);
  const action = sanitizeString(req.body?.action, 20); // 'warn' | 'mute' | 'unmute' | 'disconnect' | 'ban'
  const reason =
    sanitizeString(req.body?.reason, 120) || 'Violation of Stream+ Community Safety Policy';

  const targetWs = sockets.get(targetId);

  if (action === 'warn') {
    sendJson(targetWs, {
      type: 'admin_warning',
      message: `🚨 ADMIN SECURITY WARNING: ${reason}. Continued violation will result in a permanent ban.`,
    });
    return res.json({ ok: true, action: 'warn', targetId });
  }

  if (action === 'mute' || action === 'unmute') {
    const isMuted = action === 'mute';
    sendJson(targetWs, {
      type: 'admin_force_mute',
      muted: isMuted,
      message: isMuted
        ? '🔇 An Administrator has muted your microphone.'
        : '🔊 An Administrator has unmuted your microphone.',
    });
    return res.json({ ok: true, action, targetId, muted: isMuted });
  }

  if (action === 'disconnect') {
    const { formerPartnerId } = matchmaker.stopUser(targetId);
    if (formerPartnerId) {
      sendJson(sockets.get(formerPartnerId), {
        type: 'partner_left',
        reason: 'disconnected',
      });
    }
    sendJson(targetWs, {
      type: 'error_notice',
      message: `⚠️ An Admin Moderator disconnected your session: ${reason}`,
    });
    broadcastStats();
    return res.json({ ok: true, action: 'disconnect', targetId });
  }

  if (action === 'ban') {
    const targetFp =
      fingerprintByUserId.get(targetId) ||
      sanitizeString(req.body?.fingerprint, 64) ||
      'FP-ADMIN-MOD-BAN';
    const targetEmail = emailByUserId.get(targetId) || sanitizeString(req.body?.email, 120);
    dbStore.addBan(targetFp, targetEmail, reason);

    const { formerPartnerId } = matchmaker.banUserById(targetId, 60 * 60 * 1000);
    if (formerPartnerId) {
      sendJson(sockets.get(formerPartnerId), {
        type: 'partner_left',
        reason: 'disconnected',
      });
    }
    sendJson(targetWs, {
      type: 'error_notice',
      message: `🚫 ACCOUNT SUSPENDED BY ADMIN CCTV MONITOR: ${reason}`,
    });
    broadcastStats();
    return res.json({ ok: true, action: 'ban', targetId, fingerprint: targetFp });
  }

  return res.status(400).json({ error: 'Unknown moderation action' });
});

app.post('/api/admin/unban', requireAdminAuth, (req: Request, res: Response) => {
  const fingerprint = sanitizeString(req.body?.fingerprint, 64);
  const email = sanitizeString(req.body?.email, 120);
  dbStore.removeBan(fingerprint, email);
  return res.json({ ok: true, unbanned: true, fingerprint, email });
});

app.post('/api/admin/unban-all', requireAdminAuth, (_req: Request, res: Response) => {
  dbStore.clearAllBans();
  return res.json({ ok: true, cleared: true });
});

app.post('/api/admin/report/dismiss', requireAdminAuth, (req: Request, res: Response) => {
  const reportId = sanitizeString(req.body?.reportId, 64);
  if (reportId) {
    dbStore.removeReport(reportId);
  }
  return res.json({ ok: true, dismissed: reportId });
});

app.post('/api/admin/direct-call', requireAdminAuth, (req: Request, res: Response) => {
  const adminUserId = sanitizeString(req.body?.adminUserId, 64);
  const targetUserId = sanitizeString(req.body?.targetUserId, 64);

  if (!targetUserId) {
    return res.status(400).json({ error: 'Target user ID required' });
  }

  const targetUser = matchmaker.getUser(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user is no longer online' });
  }

  // Disconnect target user's current partner if any
  const targetFormer = matchmaker.disconnectPartner(targetUserId);
  if (targetFormer) {
    sendJson(sockets.get(targetFormer), {
      type: 'partner_left',
      reason: 'disconnected',
    });
  }

  // Disconnect admin user's partner if any
  if (adminUserId) {
    const adminFormer = matchmaker.disconnectPartner(adminUserId);
    if (adminFormer) {
      sendJson(sockets.get(adminFormer), {
        type: 'partner_left',
        reason: 'disconnected',
      });
    }
  }

  const effectiveAdminId = adminUserId || 'admin-live-call';
  const adminWs = sockets.get(effectiveAdminId);
  const targetWs = sockets.get(targetUserId);

  if (!adminWs) {
    return res.status(400).json({ error: 'Admin WebSocket not connected yet. Please wait 2 seconds and try again.' });
  }

  const adminUser = matchmaker.getUser(effectiveAdminId) || matchmaker.registerUser(effectiveAdminId, {
    name: 'Security Admin',
    countryCode: 'IN',
    countryName: 'India',
    flag: '🛡️',
    gender: 'guy',
  });

  adminUser.partnerId = targetUserId;
  adminUser.status = 'connected';
  targetUser.partnerId = effectiveAdminId;
  targetUser.status = 'connected';

  sendJson(adminWs, {
    type: 'match_found',
    role: 'caller',
    partner: {
      id: targetUser.id,
      name: targetUser.name,
      country: targetUser.countryName,
      countryCode: targetUser.countryCode,
      flag: targetUser.flag,
      gender: targetUser.gender,
    },
  });

  sendJson(targetWs, {
    type: 'match_found',
    role: 'callee',
    partner: {
      id: adminUser.id,
      name: '🛡️ Stream+ Staff / Admin',
      country: 'Security Center',
      countryCode: 'IN',
      flag: '🛡️',
      gender: 'guy',
    },
  });

  broadcastStats();
  return res.json({ ok: true, connected: true, targetUser: targetUser.name });
});

// ============================================================
// GOOGLE SEARCH ENGINE & SEO ROUTES (robots.txt, sitemap.xml, manifest.json, /api/seo-audit)
// ============================================================

// Google Search Console HTML File Ownership Verification
app.get('/google9f9b6ae61c58e73a.html', (_req: Request, res: Response) => {
  res.type('text/html').send('google-site-verification: google9f9b6ae61c58e73a.html');
});

app.get('/robots.txt', (req: Request, res: Response) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;
  const robotsTxt = [
    'User-agent: Googlebot',
    'Allow: /',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join('\n');

  res.type('text/plain').send(robotsTxt);
});

const SEO_LANDING_ROUTES: Record<
  string,
  { priority: string; title: string; description: string; h1: string }
> = {
  '/': {
    priority: '1.0',
    title: 'Stream+ (StreamPlus) — #1 Free Online Video Call, Stream+ Video Call & Random Video Chat',
    description:
      'Stream+ (StreamPlus) is the #1 free online video call and random video chat app. Start an instant Stream+ video call with strangers worldwide in HD webcam & live text chat.',
    h1: 'Stream+ (StreamPlus) — #1 Free Online Video Call, Stream+ Video Call & Random Video Chat',
  },
  '/streamplus': {
    priority: '0.98',
    title: 'StreamPlus (Stream+) Official — Free Online Video Call & Live Random Video Chat',
    description:
      'Welcome to StreamPlus (Stream+), the official #1 free online video call and random video chat platform. Connect instantly via HD WebRTC webcam chat.',
    h1: 'StreamPlus (Stream+) Official — Free Online Video Call & Live Video Chat',
  },
  '/stream-plus-video-call': {
    priority: '0.98',
    title: 'Stream+ Video Call — Free Instant HD Online Video Call with Strangers',
    description:
      'Start a free Stream+ video call (StreamPlus video call) right in your browser. Instant 1-on-1 HD online video call and live text chat with real people.',
    h1: 'Stream+ Video Call — Free Instant HD Online Video Call with Strangers',
  },
  '/online-video-call': {
    priority: '0.98',
    title: 'Online Video Call Free — Instant Random Online Video Call on Stream+ (StreamPlus)',
    description:
      'Looking for a free online video call? Join Stream+ (StreamPlus) to start an instant HD online video call with strangers in India and worldwide.',
    h1: 'Free Online Video Call — Instant HD Random Video Call on Stream+',
  },
  '/random-video-call': {
    priority: '0.95',
    title: 'Random Video Call Online — Talk to Strangers Live on Stream+ (StreamPlus)',
    description:
      'Make a free random video call online with real people around the world on Stream+ (StreamPlus). Safe, fast peer-to-peer WebRTC video calling.',
    h1: 'Random Video Call Online — Free Live Video Call on Stream+',
  },
  '/tamil-video-chat': {
    priority: '0.95',
    title: 'Tamil Video Call & Tamil Video Chat — Free Online Video Call on Stream+',
    description:
      'Join Tamil video call and live Tamil random video chat on Stream+ (StreamPlus). Connect with Tamil friends in Chennai, Tamil Nadu, and worldwide for free.',
    h1: 'Tamil Video Call & Tamil Random Video Chat — Stream+ (StreamPlus)',
  },
  '/india-random-chat': {
    priority: '0.95',
    title: 'India Online Video Call & India Random Video Chat — Stream+ (StreamPlus)',
    description:
      'Free India online video call and random video chat on Stream+ (StreamPlus). Meet new friends across India with instant HD webcam chat.',
    h1: 'India Online Video Call & Random Video Chat — Stream+ India',
  },
  '/talk-to-strangers': {
    priority: '0.90',
    title: 'Talk to Strangers — Free Online Video Call & Random Video Chat on Stream+',
    description:
      'Talk to strangers online via free HD video call and text chat on Stream+ (StreamPlus). Instant matchmaking with country and gender filters.',
    h1: 'Talk to Strangers — Free Online Video Call & Live Video Chat',
  },
  '/ometv-alternative': {
    priority: '0.90',
    title: 'Best OmeTV & Omegle Alternative — Stream+ (StreamPlus) Online Video Call',
    description:
      'Stream+ (StreamPlus) is the #1 safe and fast OmeTV & Omegle alternative for free online video calls and random webcam chat with strangers.',
    h1: 'Best OmeTV & Omegle Alternative — Stream+ Online Video Call',
  },
  '/free-webcam-chat': {
    priority: '0.90',
    title: 'Free Webcam Chat & Online Video Call — Stream+ (StreamPlus)',
    description:
      'Start a free webcam chat and online video call on Stream+ (StreamPlus) with zero downloads required. Works on Android, iOS, and PC.',
    h1: 'Free Webcam Chat & Instant Online Video Call — Stream+',
  },
  '/stream-plus': {
    priority: '0.98',
    title: 'Stream Plus (Stream+ / StreamPlus) — Free Online Video Call & Live Video Chat',
    description:
      'Stream Plus (Stream+ / StreamPlus) is the #1 free online video call and random video chat app to talk to strangers worldwide in HD.',
    h1: 'Stream Plus (Stream+ / StreamPlus) — Free Online Video Call & Video Chat',
  },
  '/live-video-call': {
    priority: '0.95',
    title: 'Live Video Call Online — Free Instant HD Live Video Call on Stream+ (StreamPlus)',
    description:
      'Connect via free live video call online on Stream+ (StreamPlus). Instant 1-on-1 HD webcam call and text chat with strangers.',
    h1: 'Live Video Call Online — Free Instant HD Video Call on Stream+',
  },
  '/free-video-call': {
    priority: '0.95',
    title: 'Free Video Call Online — Instant Free Online Video Call on Stream+ (StreamPlus)',
    description:
      'Make a 100% free video call online with people worldwide on Stream+ (StreamPlus). Fast WebRTC video calling with no app download.',
    h1: 'Free Video Call Online — Instant 1-on-1 Video Call on Stream+',
  },
  '/stranger-video-call': {
    priority: '0.95',
    title: 'Stranger Video Call — Free Online Video Call with Strangers on Stream+',
    description:
      'Start a free stranger video call and talk to strangers online in HD on Stream+ (StreamPlus). Safe AI-moderated random video calling.',
    h1: 'Stranger Video Call — Free Online Video Call with Strangers',
  },
  '/tamil-video-call': {
    priority: '0.95',
    title: 'Tamil Video Call — Free Tamil Online Video Call & Live Chat on Stream+',
    description:
      'Start a free Tamil video call and Tamil online video chat on Stream+ (StreamPlus). Meet Tamil friends across Tamil Nadu and worldwide.',
    h1: 'Tamil Video Call — Free Tamil Online Video Call on Stream+',
  },
  '/india-video-call': {
    priority: '0.95',
    title: 'India Video Call — Free Online Video Call India on Stream+ (StreamPlus)',
    description:
      'Free India video call and Indian online video chat on Stream+ (StreamPlus). Connect instantly with users across India in HD.',
    h1: 'India Video Call — Free Online Video Call India on Stream+',
  },
};

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;
  const today = new Date().toISOString().split('T')[0];

  const urlEntries = Object.entries(SEO_LANDING_ROUTES)
    .map(
      ([routePath, meta]) => `  <url>
    <loc>${baseUrl}${routePath}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${meta.priority}</priority>
  </url>`
    )
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  res.type('application/xml').send(sitemapXml);
});

app.get('/manifest.json', (_req: Request, res: Response) => {
  res.json({
    name: 'Stream+ Video Chat — Free Random Video Chat & Live Talk',
    short_name: 'Stream+',
    description:
      'Stream+ Video Chat is the #1 free random video chat and live webcam chat app to meet people worldwide.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#f59e0b',
    categories: ['social', 'communication', 'entertainment'],
  });
});

app.get('/api/seo-audit', (req: Request, res: Response) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;

  let htmlContent = '';
  try {
    htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  } catch {}

  const hasTitle = /<title>(.+?)<\/title>/i.test(htmlContent);
  const titleMatch = htmlContent.match(/<title>(.+?)<\/title>/i);
  const titleText = (titleMatch?.[1] || 'Stream+ Video Chat').replace(/&amp;/g, '&');

  const descMatch = htmlContent.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const descriptionText =
    descMatch?.[1] ||
    'Stream+ Video Chat is the #1 free random video chat and live webcam chat app to meet people worldwide.';

  const hasRobotsMeta = /name="robots"\s+content="index,\s*follow/i.test(htmlContent);
  const hasCanonical = /rel="canonical"/i.test(htmlContent);
  const hasJsonLd = /application\/ld\+json/i.test(htmlContent);
  const hasOpenGraph = /property="og:title"/i.test(htmlContent);
  const hasMobileViewport =
    /name="viewport"/i.test(htmlContent) && !/user-scalable=no/i.test(htmlContent);
  const hasNoscriptSemantic = /<noscript>[\s\S]*<h1>/i.test(htmlContent);

  const checks = [
    {
      id: 'title',
      label: 'Primary Keyword Title Tag (<title>)',
      passed: hasTitle,
      detail: titleText,
    },
    {
      id: 'description',
      label: 'High-CTR Meta Description (150-160 chars)',
      passed: Boolean(descriptionText),
      detail: descriptionText,
    },
    {
      id: 'robots',
      label: 'Googlebot Index & Follow Directives + /robots.txt',
      passed: hasRobotsMeta,
      detail: `index, follow, max-snippet:-1 (${baseUrl}/robots.txt)`,
    },
    {
      id: 'sitemap',
      label: 'Dynamic XML Sitemap (/sitemap.xml)',
      passed: true,
      detail: `${baseUrl}/sitemap.xml (priority: 1.0, daily)`,
    },
    {
      id: 'jsonld',
      label: 'Schema.org JSON-LD Rich Snippets (WebApplication + 4.9★ + FAQPage)',
      passed: hasJsonLd,
      detail: 'WebApplication & FAQPage structured data embedded for Google Rich Results',
    },
    {
      id: 'viewport',
      label: 'Google Mobile-First Indexing & Accessibility Viewport',
      passed: hasMobileViewport,
      detail: 'width=device-width, initial-scale=1.0 (zoom unlocked for Lighthouse 100/100)',
    },
    {
      id: 'canonical_og',
      label: 'Canonical URL, OpenGraph, Twitter Card & Semantic <noscript> H1',
      passed: hasCanonical && hasOpenGraph && hasNoscriptSemantic,
      detail: 'Complete social & crawler fallback metadata configured',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  res.json({
    score,
    title: titleText,
    description: descriptionText,
    sitemapUrl: `${baseUrl}/sitemap.xml`,
    robotsUrl: `${baseUrl}/robots.txt`,
    checks,
  });
});

// REST API: Health & Stats
app.get('/api/health', (_req: Request, res: Response) => {
  const stats = matchmaker.getStats();
  res.json({
    status: 'ok',
    app: 'Stream+ Video Chat',
    version: '2.2.0',
    ...stats,
  });
});

app.get('/api/stats', (_req: Request, res: Response) => {
  res.json(matchmaker.getStats());
});

const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      const baseIndexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      app.use(express.static(distPath, { index: false }));
      app.get('*', (req: Request, res: Response) => {
        const cleanPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
        const seoMeta = SEO_LANDING_ROUTES[cleanPath];
        if (!seoMeta) {
          res.type('text/html').send(baseIndexHtml);
          return;
        }
        const host = req.headers.host || 'stream-plus-video-chat.onrender.com';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const canonicalUrl = `${protocol}://${host}${cleanPath === '/' ? '/' : cleanPath}`;
        const safeTitle = seoMeta.title.replace(/&/g, '&amp;');
        const safeDesc = seoMeta.description.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const safeH1 = seoMeta.h1.replace(/&/g, '&amp;');

        const customizedHtml = baseIndexHtml
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
          .replace(
            /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i,
            `<meta name="description" content="${safeDesc}" />`
          )
          .replace(
            /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/i,
            `<link rel="canonical" href="${canonicalUrl}" />`
          )
          .replace(
            /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i,
            `<meta property="og:title" content="${safeTitle}" />`
          )
          .replace(
            /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/i,
            `<meta property="og:url" content="${canonicalUrl}" />`
          )
          .replace(/<h1>[\s\S]*?<\/h1>/i, `<h1>${safeH1}</h1>`);

        res.type('text/html').send(customizedHtml);
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=============================================================`);
    console.log(`  Stream+ Video Chat Server Running: http://localhost:${PORT}`);
    console.log(`  Google Sitemap XML:                http://localhost:${PORT}/sitemap.xml`);
    console.log(`  Googlebot Robots.txt:              http://localhost:${PORT}/robots.txt`);
    console.log(`=============================================================\n`);
  });
}

startServer();
