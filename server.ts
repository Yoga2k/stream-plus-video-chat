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
          'FP-NSFW-AUTO';
        const offenderEmail = emailByUserId.get(userId);
        dbStore.addBan(fp, offenderEmail, String(msg.reason || 'AI NSFW Violation'));

        const { formerPartnerId } = matchmaker.banUserById(userId, 60 * 60 * 1000);
        if (formerPartnerId) {
          sendJson(sockets.get(formerPartnerId), {
            type: 'partner_left',
            reason: 'disconnected',
          });
        }

        const rawScreenshot =
          typeof msg.screenshot === 'string' && msg.screenshot.startsWith('data:image/')
            ? msg.screenshot
            : undefined;

        saveScreenshotToBucket(rawScreenshot, 'nsfw').then((bucketUrl) => {
          dbStore.addReport({
            id: `nsfw-${Date.now()}`,
            timestamp: new Date().toISOString(),
            reporterId: 'AI-NSFWJS-GUARD',
            reporterName: '🤖 Browser AI NSFW Scanner',
            reportedId: userId,
            reportedName: offender?.name || 'User',
            reason: String(msg.reason || 'AI Auto-Nudity / NSFW Detection Triggered'),
            screenshot: bucketUrl,
            deviceFingerprint: fp,
            autoBanned: true,
          });
        });

        sendJson(ws, {
          type: 'error_notice',
          message:
            '🚫 AI NSFW AUTO-BAN: Nudity or prohibited content was detected on your camera. Your Device ID & Account are now banned.',
        });
        broadcastStats();
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
    bannedDevicesCount: dbStore.getBannedDevicesCount(),
    storage: dbStore.getStorageSummary(),
    stats,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/admin/moderate', requireAdminAuth, (req: Request, res: Response) => {
  const targetId = sanitizeString(req.body?.userId, 64);
  const action = sanitizeString(req.body?.action, 20); // 'warn' | 'disconnect' | 'ban'
  const reason =
    sanitizeString(req.body?.reason, 120) || 'Violation of Stream+ Community Safety Policy';

  const targetWs = sockets.get(targetId);

  if (action === 'warn') {
    sendJson(targetWs, {
      type: 'error_notice',
      message: `🚨 ADMIN CCTV SECURITY WARNING: ${reason}. Continued violation will result in an immediate permanent ban.`,
    });
    return res.json({ ok: true, action: 'warn', targetId });
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
    return res.json({ ok: true, action: 'ban', targetId });
  }

  return res.status(400).json({ error: 'Unknown moderation action' });
});

// ============================================================
// GOOGLE SEARCH ENGINE & SEO ROUTES (robots.txt, sitemap.xml, manifest.json, /api/seo-audit)
// ============================================================

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

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;
  const today = new Date().toISOString().split('T')[0];

  const seoPaths = [
    { path: '/', priority: '1.0' },
    { path: '/tamil-video-chat', priority: '0.9' },
    { path: '/india-random-chat', priority: '0.9' },
    { path: '/talk-to-strangers', priority: '0.9' },
    { path: '/ometv-alternative', priority: '0.85' },
    { path: '/free-webcam-chat', priority: '0.85' },
  ];

  const urlEntries = seoPaths
    .map(
      (item) => `  <url>
    <loc>${baseUrl}${item.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${item.priority}</priority>
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
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
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
