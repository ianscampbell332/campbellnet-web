/**
 * POST /api/portal/verify
 * Body: { email, code }
 *
 * Validates the OTP from the cookie against the submitted code.
 * On success: clears OTP cookie, sets 24-hour session cookie, returns { success, email }.
 * On failure: returns 401.
 */

import {
  verifyOtpToken,
  signSession,
  getOtpToken,
  clearOtpCookie,
  sessionCookie,
} from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  const addr         = email.trim().toLowerCase();
  const submittedOtp = String(code).trim();

  // Pull OTP token from cookie
  const otpToken = getOtpToken(req);
  if (!otpToken) {
    return res.status(401).json({ error: 'Code expired. Please request a new one.' });
  }

  const valid = verifyOtpToken(otpToken, addr, submittedOtp);
  if (!valid) {
    return res.status(401).json({ error: 'That code isn\'t right. Please try again.' });
  }

  // Issue session, clear OTP cookie
  const token = signSession(addr);
  res.setHeader('Set-Cookie', [
    clearOtpCookie(),
    sessionCookie(token),
  ]);

  return res.status(200).json({ success: true, email: addr });
}
