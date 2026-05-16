/**
 * POST /api/portal/logout
 * Clears session and OTP cookies.
 */

import { clearOtpCookie, clearSessionCookie } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', [clearOtpCookie(), clearSessionCookie()]);
  return res.status(200).json({ success: true });
}
