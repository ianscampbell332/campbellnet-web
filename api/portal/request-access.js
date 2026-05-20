/**
 * POST /api/portal/request-access
 * Body: { firstName, lastName, title, organization, phone, email }
 *
 * Generates a signed approval token and emails it to the CNS admin.
 * The token is valid for 30 days and contains everything needed to
 * create the contact in Mission Suite when the admin approves.
 */

import { signAccessRequestToken } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firstName, lastName, title, organization, phone, email } = req.body || {};

  if (!firstName || !lastName || !organization || !email) {
    return res.status(400).json({ error: 'First name, last name, organization, and email are required.' });
  }

  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const addr = email.trim().toLowerCase();

  try {
    const token      = signAccessRequestToken({ firstName, lastName, title, organization, phone, email: addr });
    const host       = req.headers['x-forwarded-host'] || req.headers['host'] || 'campbellnetsolutions.com';
    const protocol   = host.includes('localhost') ? 'http' : 'https';
    const approveUrl = `${protocol}://${host}/api/portal/approve?token=${token}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM_EMAIL,
        to:      process.env.ADMIN_ALERT_EMAIL,
        subject: `Portal access request — ${firstName} ${lastName}, ${organization}`,
        text:    `New customer portal access request:\n\nName: ${firstName} ${lastName}\nTitle: ${title || '—'}\nOrganization: ${organization}\nPhone: ${phone || '—'}\nEmail: ${addr}\n\nApprove access:\n${approveUrl}\n\nThis link expires in 30 days.`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="background:#1E2D78;border-radius:8px 8px 0 0;padding:24px 36px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">CampbellNet Solutions</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:32px 36px;border-left:1px solid #e5e8f0;border-right:1px solid #e5e8f0;">
            <h2 style="margin:0 0 8px;font-size:20px;color:#1E2D78;">New portal access request</h2>
            <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">Someone is requesting access to the CampbellNet customer portal.</p>
            <table width="100%" cellpadding="6" cellspacing="0" style="background:#f9f9f7;border-radius:6px;margin-bottom:28px;font-size:14px;">
              <tr><td style="color:#888;width:120px;padding:8px 12px;">Name</td><td style="color:#1E2D78;font-weight:600;padding:8px 12px;">${firstName} ${lastName}</td></tr>
              ${title ? `<tr><td style="color:#888;padding:8px 12px;">Title</td><td style="color:#333;padding:8px 12px;">${title}</td></tr>` : ''}
              <tr><td style="color:#888;padding:8px 12px;">Organization</td><td style="color:#333;padding:8px 12px;">${organization}</td></tr>
              ${phone ? `<tr><td style="color:#888;padding:8px 12px;">Phone</td><td style="color:#333;padding:8px 12px;">${phone}</td></tr>` : ''}
              <tr><td style="color:#888;padding:8px 12px;">Email</td><td style="color:#333;padding:8px 12px;">${addr}</td></tr>
            </table>
            <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6;">
              Click below to approve access. This will add them to the Customers group in Mission Suite and send them a confirmation email.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td style="background:#D4862A;border-radius:6px;">
              <a href="${approveUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">Approve Portal Access →</a>
            </td></tr></table>
            <p style="margin:20px 0 0;color:#aaa;font-size:12px;">This approval link expires in 30 days. If you don't recognize this request, ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f0f0ea;border-radius:0 0 8px 8px;border:1px solid #e5e8f0;border-top:none;padding:16px 36px;">
            <p style="margin:0;font-size:12px;color:#999;">CampbellNet Solutions — <a href="https://campbellnetsolutions.com" style="color:#1E2D78;text-decoration:none;">campbellnetsolutions.com</a></p>
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
      console.error('Access request email failed:', detail);
      // Still return success to the user — we don't want to expose internal errors
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('request-access error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again or call us at 585-377-8910.' });
  }
}
