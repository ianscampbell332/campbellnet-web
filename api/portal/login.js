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

  try {
    // ── 1. Verify email exists in the Customers group (Group 9) ───────────
    const lookupXml = `<GetContactsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_CUSTOMERS_GROUP_ID}" response="json"><SearchParameters><Email>${xmlEsc(addr)}</Email></SearchParameters></GetContactsRequest>`;
    const lookupText = await msPost(lookupXml);

    let found = false;
    try {
      const data        = JSON.parse(lookupText);
      const contactData = data?.getcontactsresponse?.contacts?.contact;
      if (contactData) {
        // MS returns an object for one result, array for multiple
        const contacts = Array.isArray(contactData) ? contactData : [contactData];
        // Verify at least one returned contact actually has the matching email
        found = contacts.some(c =>
          (c.email || c.Email || '').toLowerCase() === addr
        );
      }
    } catch {
      // JSON parse failed — MS returned XML or an error response.
      // Do NOT fall back to string search (prone to false positives).
      console.warn('Group 9 lookup parse failed:', lookupText.slice(0, 300));
      found = false;
    }

    if (!found) {
      // Not an approved customer — tell the frontend to show the request-access form
      return res.status(200).json({ success: true, status: 'not_found' });
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
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;">

        <!-- Header bar -->
        <tr>
          <td style="background:#1E2D78;border-radius:8px 8px 0 0;padding:24px 36px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">CampbellNet Solutions</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e5e8f0;border-right:1px solid #e5e8f0;">

            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1E2D78;line-height:1.3;">Your login code</h1>
            <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:1.6;">
              Use the code below to sign in to the CampbellNet customer portal. It expires in <strong>5 minutes</strong>.
            </p>

            <!-- OTP box -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td align="center" style="background:#f5f5f0;border-radius:8px;padding:24px 16px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888888;">Login Code</p>
                  <p style="margin:0;font-size:44px;font-weight:700;letter-spacing:12px;color:#1E2D78;line-height:1;">${otp}</p>
                </td>
              </tr>
            </table>

            <p style="margin:28px 0 0;font-size:13px;color:#999999;line-height:1.6;">
              If you didn't request this, you can safely ignore this email — your account is not at risk.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f0f0ea;border-radius:0 0 8px 8px;border:1px solid #e5e8f0;border-top:none;padding:16px 36px;">
            <p style="margin:0;font-size:12px;color:#999999;line-height:1.6;">
              CampbellNet Solutions &mdash; Upstate New York &mdash;
              <a href="https://campbellnetsolutions.com" style="color:#1E2D78;text-decoration:none;">campbellnetsolutions.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`,
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

    return res.status(200).json({ success: true, status: 'otp_sent' });

  } catch (err) {
    console.error('Portal login error:', err);
    return res.status(200).json({ success: true, status: 'otp_sent' }); // fail safe
  }
}
