/**
 * Stateless JWT utilities for the customer portal.
 * Uses Node's built-in crypto — no npm dependencies.
 *
 * Token types:
 *   otp     — short-lived (5 min), carries the one-time code
 *   session — 24-hour session after successful login
 */

import crypto from 'crypto';

function secret() {
  return process.env.SESSION_SECRET || 'dev-secret-please-set-SESSION_SECRET';
}

// ─── base64url helpers ──────────────────────────────────────────────────────

function b64uEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(str) {
  return Buffer.from(
    str.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString();
}

// ─── core sign / verify ─────────────────────────────────────────────────────

function sign(payload) {
  const header  = b64uEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = b64uEncode(JSON.stringify(payload));
  const sigRaw  = crypto.createHmac('sha256', secret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.${sigRaw}`;
}

function verify(token) {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;

    const expected = crypto.createHmac('sha256', secret())
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Timing-safe comparison
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const payload = JSON.parse(b64uDecode(body));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── public API ─────────────────────────────────────────────────────────────

/** Create a 5-minute OTP token. */
export function signOtpToken(email, otp) {
  return sign({ type: 'otp', email, otp, exp: Date.now() + 5 * 60 * 1000 });
}

/** Verify an OTP token. Returns true only if token, email, and code all match. */
export function verifyOtpToken(token, email, code) {
  const payload = verify(token);
  if (!payload || payload.type !== 'otp') return false;
  if (payload.email !== email) return false;
  try {
    // Timing-safe OTP comparison (both must be same length)
    const a = Buffer.from(String(payload.otp));
    const b = Buffer.from(String(code));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Create a 24-hour session token. */
export function signSession(email) {
  return sign({ type: 'session', email, exp: Date.now() + 24 * 60 * 60 * 1000 });
}

/**
 * Read the session cookie from a request and return the authenticated email,
 * or null if missing / invalid / expired.
 */
export function getSessionEmail(req) {
  const cookie = req.headers?.cookie || '';
  const match  = cookie.match(/(?:^|;\s*)cns_session=([^;]+)/);
  if (!match) return null;
  const payload = verify(match[1]);
  if (!payload || payload.type !== 'session') return null;
  return payload.email;
}

/** Cookie string for the OTP token (5-minute, portal path only). */
export function otpCookie(token) {
  return `cns_otp=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/portal; Max-Age=300`;
}

/** Cookie string for clearing the OTP token. */
export function clearOtpCookie() {
  return `cns_otp=; HttpOnly; Secure; SameSite=Strict; Path=/api/portal; Max-Age=0`;
}

/** Cookie string for a 24-hour session. */
export function sessionCookie(token) {
  return `cns_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}

/** Cookie string for clearing the session. */
export function clearSessionCookie() {
  return `cns_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Read the raw OTP token from request cookies (for verify endpoint). */
export function getOtpToken(req) {
  const cookie = req.headers?.cookie || '';
  const match  = cookie.match(/(?:^|;\s*)cns_otp=([^;]+)/);
  return match ? match[1] : null;
}
