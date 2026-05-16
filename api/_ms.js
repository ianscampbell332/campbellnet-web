/**
 * Shared Mission Suite API utility.
 * All portal and contact-form functions should use msPost() from here.
 */

export async function msPost(xml) {
  const body = new URLSearchParams({
    email:      process.env.MISSION_SUITE_USER,
    auth_token: process.env.MISSION_SUITE_AUTH_TOKEN,
    xml,
  });
  const res = await fetch('https://api.stgi.net/api-xml', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  return res.text();
}

/** Escape a value for safe insertion into XML. */
export function xmlEsc(v) {
  return (v || '').toString()
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

/** Pull a single tag value out of an XML string. */
export function xmlGet(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
  return m ? m[1].trim() : '';
}
