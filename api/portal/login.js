/**
 * POST /api/portal/login
 * Body: { email }
 *
 * Checks that the email exists in the Customers group (Group 9),
 * generates a 6-digit OTP, stores it in a signed httpOnly cookie,
 * and sends the code via Resend.
 *
 * Always returns 200 { success: true } — never reveal whether an
 * email is or isn't in the system.
 */

import { msPost, xmlEsc } from '../_ms.js';
import { signOtpToken, otpCookie } from './_auth.js';
import { notifyAdmin } from '../_notifyAdmin.js';

function generateOtp() {
  // 6-digit code with leading-zero safety
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const addr = email.trim().toLowerCase();
  const ok   = () => res.status(200).json({ success: true });

  try {
    // ── 1. Verify email is in the Customers group ──────────────────────────
    const lookupXml = `<GetContactsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_CUSTOMERS_GROUP_ID}" response="json"><SearchParameters><Email>${xmlEsc(addr)}</Email></SearchParameters></GetContactsRequest>`;
    const lookupText = await msPost(lookupXml);

    let found = false;
    try {
      const data     = JSON.parse(lookupText);
      const contacts = data?.getcontactsresponse?.contacts?.contact;
      found = !!contacts;
    } catch {
      // Fall back to a case-insensitive string search in the raw response
      found = lookupText.toLowerCase().includes(addr.toLowerCase());
    }

    if (!found) {
      // Not a known customer — silent success
      return ok();
    }

    // ── 2. Generate OTP and set short-lived cookie ─────────────────────────
    const otp      = generateOtp();
    const otpToken = signOtpToken(addr, otp);
    res.setHeader('Set-Cookie', otpCookie(otpToken));

    // ── 3. Send OTP via Resend ─────────────────────────────────────────────
    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM_EMAIL,
        to:      addr,
        subject: 'Your CampbellNet portal login code',
        text:    `Your login code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#333">
            <div style="margin-bottom:28px">
              <span style="font-size:20px;font-weight:700;color:#1E2D78;letter-spacing:-0.5px">CampbellNet Solutions</span>
            </div>
            <h2 style="font-size:22px;color:#1E2D78;margin:0 0 12px">Your login code</h2>
            <p style="margin:0 0 24px;color:#555;line-height:1.6">
              Enter this code to access the CampbellNet customer portal:
            </p>
            <div style="font-size:40px;font-weight:700;letter-spacing:10px;color:#1E2D78;background:#f5f5f0;padding:20px 24px;border-radius:8px;text-align:center;margin-bottom:24px">
              ${otp}
            </div>
            <p style="margin:0;color:#999;font-size:13px;line-height:1.6">
              This code expires in 5&nbsp;minutes. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error('OTP email failed:', detail);
      await notifyAdmin({
        subject: 'CampbellNet portal — OTP email delivery failure',
        text:    `Failed to send OTP email to ${addr}.\n\nResend response: ${detail}`,
      });
    }

    return ok();

  } catch (err) {
    console.error('Portal login error:', err);
    return ok(); // Always generic success
  }
}
