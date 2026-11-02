import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * OWASP Server-Side Security Module for Stream+ Video Chat:
 * 1. Input Sanitization (XSS + NoSQL Injection + Prototype Pollution prevention)
 * 2. Strict Server-Side Schema Validation
 * 3. Brute-Force Login Rate Limiter (Max 5 failed attempts / 15 mins)
 * 4. Salted Scrypt Password Hashing + Timing-Safe Comparison
 * 5. Opaque Admin Session Token Issuing & Verification (Hides auth details)
 */

// ============================================================
// 1. INPUT SANITIZATION (XSS & NoSQL Injection Protection)
// ============================================================

export function sanitizeString(input: unknown, maxLength: number = 120): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control chars & null bytes
    .replace(/[<>]/g, '') // Strip HTML angle brackets (<script>, <img>, etc.)
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeChatMessage(input: unknown, maxLength: number = 400): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeNoSqlPayload<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeNoSqlPayload(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Block MongoDB operator injection ($gt, $ne, $where) & prototype pollution
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      continue;
    }
    clean[key] = typeof value === 'object' && value !== null ? sanitizeNoSqlPayload(value) : value;
  }
  return clean as T;
}

// ============================================================
// 2. SERVER-SIDE VALIDATION
// ============================================================

const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,120}\.[a-zA-Z]{2,15}$/;
const ALLOWED_GENDERS = new Set(['guy', 'girl', 'couple']);

export function validateEmailInput(emailRaw: unknown): { valid: boolean; email: string } {
  const email = sanitizeString(emailRaw, 120).toLowerCase();
  if (!email || !STRICT_EMAIL_REGEX.test(email)) {
    return { valid: false, email: '' };
  }
  return { valid: true, email };
}

export function validatePasswordInput(passwordRaw: unknown): { valid: boolean; password: string } {
  if (typeof passwordRaw !== 'string' || passwordRaw.length < 6 || passwordRaw.length > 128) {
    return { valid: false, password: '' };
  }
  return { valid: true, password: passwordRaw };
}

export function validateMatchQueuePrefs(raw: Record<string, unknown>) {
  const name = sanitizeString(raw.name, 32) || 'Stranger';
  const emailCheck = validateEmailInput(raw.email);
  const countryCodeRaw = sanitizeString(raw.countryCode, 8).toUpperCase();
  const countryCode = /^[A-Z]{2,3}(-[A-Z0-9]{2,3})?$/.test(countryCodeRaw) ? countryCodeRaw : 'IN';
  const countryName = sanitizeString(raw.countryName, 64) || 'India';
  const flag = sanitizeString(raw.flag, 8) || '🇮🇳';
  const genderRaw = sanitizeString(raw.gender, 10).toLowerCase();
  const gender = (ALLOWED_GENDERS.has(genderRaw) ? genderRaw : 'guy') as 'guy' | 'girl' | 'couple';
  const prefCountryRaw = sanitizeString(raw.preferredCountry, 8).toUpperCase();
  const preferredCountry =
    prefCountryRaw === 'ALL' || /^[A-Z]{2,3}(-[A-Z0-9]{2,3})?$/.test(prefCountryRaw)
      ? prefCountryRaw
      : 'ALL';
  const deviceFingerprint = sanitizeString(raw.deviceFingerprint, 32);

  return {
    name,
    email: emailCheck.valid ? emailCheck.email : '',
    countryCode,
    countryName,
    flag,
    gender,
    preferredCountry,
    deviceFingerprint,
  };
}

// ============================================================
// 3. CRYPTOGRAPHIC PASSWORD HASHING (Random 16-Byte Salt + Scrypt + Timing-Safe Compare)
// ============================================================

export function hashPasswordSecure(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPasswordSecure(
  password: string,
  storedHash: string,
  legacyEmailSalt?: string
): boolean {
  try {
    if (!storedHash) return false;

    // Modern format: "<16-byte-hex-salt>:<64-byte-hex-hash>"
    if (storedHash.includes(':')) {
      const [salt, keyHex] = storedHash.split(':');
      if (!salt || !keyHex) return false;
      const keyBuffer = Buffer.from(keyHex, 'hex');
      const derivedBuffer = crypto.scryptSync(password, salt, 64);
      if (keyBuffer.length !== derivedBuffer.length) return false;
      return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
    }

    // Legacy fallback support (if an older 32-byte hash exists in db)
    if (legacyEmailSalt) {
      const legacyHex = crypto.scryptSync(password, legacyEmailSalt, 32).toString('hex');
      const bufA = Buffer.from(legacyHex, 'hex');
      const bufB = Buffer.from(storedHash, 'hex');
      if (bufA.length === bufB.length) {
        return crypto.timingSafeEqual(bufA, bufB);
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function timingSafeStringMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ============================================================
// 4. BRUTE-FORCE LOGIN RATE LIMITER (Max 5 Failed Attempts / 15 Mins)
// ============================================================

interface LoginAttemptRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

const loginAttempts = new Map<string, LoginAttemptRecord>();

export function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function checkLoginRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) {
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_LOGIN_FAILURES };
  }

  if (record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  if (now - record.firstFailureAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_LOGIN_FAILURES };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_LOGIN_FAILURES - record.failures),
  };
}

export function recordLoginFailure(key: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = loginAttempts.get(key);

  if (!existing || now - existing.firstFailureAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {
      failures: 1,
      firstFailureAt: now,
      lockedUntil: 0,
    });
    return { locked: false, retryAfterSeconds: 0 };
  }

  existing.failures += 1;
  if (existing.failures >= MAX_LOGIN_FAILURES) {
    existing.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttempts.set(key, existing);
    return {
      locked: true,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  loginAttempts.set(key, existing);
  return { locked: false, retryAfterSeconds: 0 };
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

// ============================================================
// 5. OPAQUE ADMIN SESSION TOKEN MANAGER (Hides Authentication Details)
// ============================================================

const activeAdminTokens = new Map<string, number>(); // token -> expiresAt
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function issueAdminSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeAdminTokens.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

export function verifyAdminSessionToken(token: unknown): boolean {
  if (typeof token !== 'string' || token.length < 32) return false;
  const expiresAt = activeAdminTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    activeAdminTokens.delete(token);
    return false;
  }
  return true;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryOrBodyToken =
    typeof req.body?.adminToken === 'string'
      ? req.body.adminToken
      : typeof req.headers['x-admin-token'] === 'string'
        ? req.headers['x-admin-token']
        : '';

  const token = bearerToken || queryOrBodyToken;
  if (!verifyAdminSessionToken(token)) {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }
  next();
}

// ============================================================
// 6. OWASP HTTP SECURITY HEADERS & INPUT SANITIZER MIDDLEWARE
// ============================================================

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeNoSqlPayload(req.body);
  }
  next();
}
