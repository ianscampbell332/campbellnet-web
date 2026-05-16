/**
 * GET /api/portal/categories
 * Returns the list of ticket categories for the support group.
 * Used to populate the "Regarding" dropdown when filing a ticket,
 * and the category filter pills on the ticket list tabs.
 */

import { getSessionEmail } from './_auth.js';
import { msPost } from '../_ms.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const xml  = `<GetTicketCategoriesRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}"/>`;
    const text = await msPost(xml);

    const categories = [];
    for (const match of text.matchAll(/<TicketCategory>([\s\S]*?)<\/TicketCategory>/g)) {
      const block   = match[1];
      const idMatch = block.match(/<CategoryID>(\d+)<\/CategoryID>/);
      const nmMatch = block.match(/<CategoryName>(.*?)<\/CategoryName>/);
      if (idMatch && nmMatch) {
        categories.push({ id: idMatch[1], name: nmMatch[1].trim() });
      }
    }

    return res.status(200).json({ categories });
  } catch (err) {
    console.error('categories error:', err);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
}
