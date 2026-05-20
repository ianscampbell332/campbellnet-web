/**
 * GET /api/portal/approve?token=...
 *
 * Called by the CNS admin clicking "Approve Portal Access" in the request email.
 * Verifies the signed 30-day token, adds the contact to the Customers group
 * in Mission Suite, sends the user a confirmation email, and returns a branded
 * HTML success or error page.
 */

import { verifyAccessRequestToken } from './_auth.js';
import { msPost, xmlEsc } from '../_ms.js';

// ── Branded HTML page helper ──────────────────────────────────────────────────

function htmlPage(title, heading, body, isError = false) {
  const headingColor = isError ? '#c0392b' : '#1E2D78';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — CampbellNet Solutions</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:60px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="background:#1E2D78;border-radius:8px 8px 0 0;padding:24px 36px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">CampbellNet Solutions</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:40px 36px 32px;border-left:1px solid #e5e8f0;border-right:1px solid #e5e8f0;">
            <h2 style="margin:0 0 14px;font-size:22px;color:${headingColor};line-height:1.3;">${heading}</h2>
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f0f0ea;border-radius:0 0 8px 8px;border:1px solid #e5e8f0;border-top:none;padding:16px 36px;">
            <p style="margin:0;font-size:12px;color:#999999;">CampbellNet Solutions &mdash; <a href="https://campbellnetsolutions.com" style="color:#1E2D78;text-decoration:none;">campbellnetsolutions.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const token = (req.query.token || '').trim();

  if (!token) {
    return res.status(400).send(htmlPage(
      'Invalid Link',
      'Invalid approval link',
      '<p style="color:#555555;font-size:15px;line-height:1.6;">This link is missing its approval token. Please check the email and click the Approve button again.</p>',
      true
    ));
  }

  const payload = verifyAccessRequestToken(token);
  if (!payload) {
    return res.status(400).send(htmlPage(
      'Expired Link',
      'This approval link has expired or is invalid',
      '<p style="color:#555555;font-size:15px;line-height:1.6;">Approval links are valid for 30 days. If this customer still needs access, ask them to submit a new request at <a href="https://campbellnetsolutions.com/support.html" style="color:#1E2D78;">campbellnetsolutions.com/support.html</a>.</p>',
      true
    ));
  }

  const { firstName, lastName, title, organization, phone, email } = payload;

  try {
    // ── 1. Resolve Customers group name from ID ──────────────────────────────
    const groupXml  = `<GetGroupsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_CUSTOMERS_GROUP_ID}" response="json"></GetGroupsRequest>`;
    const groupText = await msPost(groupXml);

    let groupName;
    try {
      const groupData   = JSON.parse(groupText);
      const groupResult = groupData?.getgroupsresponse?.groups?.group;
      groupName = Array.isArray(groupResult) ? groupResult[0]?.name : groupResult?.name;
    } catch {
      console.error('Group name parse failed:', groupText.slice(0, 300));
    }

    if (!groupName) {
      console.error('Could not resolve Customers group name:', groupText);
      return res.status(500).send(htmlPage(
        'Error',
        'Could not add contact',
        `<p style="color:#555555;font-size:15px;line-height:1.6;">
          The Customers group lookup failed. Please add <strong>${firstName} ${lastName}</strong>
          (${email}) to the Customers group in Mission Suite manually, then notify them.
        </p>`,
        true
      ));
    }

    // ── 2. Add/update contact in Customers group ─────────────────────────────
    const addXml = `<AddContactsRequest update="true">
  <Contacts>
    <Contact account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}">
      <Firstname>${xmlEsc(firstName)}</Firstname>
      <Lastname>${xmlEsc(lastName)}</Lastname>
      <Company>${xmlEsc(organization)}</Company>
      <Email>${xmlEsc(email)}</Email>
      ${phone ? `<Phone>${xmlEsc(phone)}</Phone>` : ''}
      ${title ? `<Title>${xmlEsc(title)}</Title>` : ''}
      <Groups>
        <Group>${xmlEsc(groupName)}</Group>
      </Groups>
    </Contact>
  </Contacts>
</AddContactsRequest>`;

    const addText = await msPost(addXml);

    if (!addText.includes('<Result>Success</Result>')) {
      console.error('AddContactsRequest failed:', addText);
      return res.status(500).send(htmlPage(
        'Mission Suite Error',
        'Could not save to Mission Suite',
        `<p style="color:#555555;font-size:15px;line-height:1.6;">
          The Mission Suite update failed. Please add <strong>${firstName} ${lastName}</strong>
          (${email}) to the Customers group manually and notify them.
        </p>
        <p style="color:#aaaaaa;font-size:12px;margin-top:12px;font-family:monospace;">${addText.slice(0, 300)}</p>`,
        true
      ));
    }

    // ── 3. Send approval email to the user ────────────────────────────────────
    const host      = req.headers['x-forwarded-host'] || req.headers['host'] || 'campbellnetsolutions.com';
    const protocol  = host.includes('localhost') ? 'http' : 'https';
    const portalUrl = `${protocol}://${host}/support.html`;

    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM_EMAIL,
        to:      email,
        subject: "You're approved — CampbellNet customer portal access",
        text:    `Hi ${firstName},\n\nGreat news: your request to access the CampbellNet customer portal has been approved.\n\nYou can sign in at:\n${portalUrl}\n\nJust enter your email address (${email}) and we'll send you a login code.\n\nIf you have any questions, give us a call at 585-377-8910.\n\n— The CampbellNet Team`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;">
        <tr>
          <td style="background:#1E2D78;border-radius:8px 8px 0 0;padding:24px 36px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">CampbellNet Solutions</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e5e8f0;border-right:1px solid #e5e8f0;">
            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1E2D78;line-height:1.3;">You're approved!</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">
              Hi ${firstName}, your request to access the CampbellNet customer portal has been approved.
              You can now sign in to view and manage your support tickets.
            </p>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#D4862A;border-radius:6px;">
                <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;">Access the Customer Portal →</a>
              </td>
            </tr></table>
            <p style="margin:20px 0 0;font-size:13px;color:#999999;line-height:1.6;">
              Enter your email address (${email}) at the link above and we'll send you a one-time login code.
              Questions? Call us at 585-377-8910.
            </p>
          </td>
        </tr>
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

    // ── 4. Return success page ────────────────────────────────────────────────
    return res.status(200).send(htmlPage(
      'Access Approved',
      'Portal access approved',
      `<p style="color:#555555;font-size:15px;line-height:1.6;">
        <strong>${firstName} ${lastName}</strong> (${email}) has been added to the Customers
        group in Mission Suite and sent a confirmation email with a link to the portal.
      </p>
      <p style="color:#555555;font-size:14px;line-height:1.6;margin-top:16px;">
        They can sign in at <a href="${portalUrl}" style="color:#1E2D78;">campbellnetsolutions.com/support.html</a>
        using their email address.
      </p>`
    ));

  } catch (err) {
    console.error('approve error:', err);
    return res.status(500).send(htmlPage(
      'Error',
      'Something went wrong',
      `<p style="color:#555555;font-size:15px;line-height:1.6;">
        An unexpected error occurred. Please add <strong>${firstName} ${lastName}</strong>
        (${email}) to the Customers group in Mission Suite manually and notify them.
      </p>`,
      true
    ));
  }
}
