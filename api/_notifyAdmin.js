/**
 * Sends an alert email to the admin via Resend.
 * Fails silently if RESEND_API_KEY is not yet configured.
 *
 * @param {object} options
 * @param {string} options.subject - Email subject
 * @param {string} options.text   - Plain text body
 */
export async function notifyAdmin({ subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('notifyAdmin: RESEND_API_KEY not set, skipping alert email');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to:   process.env.ADMIN_ALERT_EMAIL,
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('notifyAdmin: Resend API error:', detail);
    }
  } catch (err) {
    console.error('notifyAdmin: Failed to send alert email:', err);
  }
}
