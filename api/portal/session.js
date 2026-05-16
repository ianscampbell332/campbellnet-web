/**
 * GET /api/portal/session
 * Returns { email } if a valid session exists, 401 otherwise.
 * Used by the portal UI on load to check whether the user is already logged in.
 */

import { getSessionEmail } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = getSessionEmail(req);
  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.status(200).json({ email });
}
