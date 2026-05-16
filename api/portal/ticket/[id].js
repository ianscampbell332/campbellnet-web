/**
 * GET  /api/portal/ticket/[id]  — fetch ticket detail with full update history
 * POST /api/portal/ticket/[id]  — add an update to an open ticket
 *
 * Both operations verify that the ticket belongs to the authenticated customer
 * before doing anything.
 */

import { getSessionEmail } from '../_auth.js';
import { msPost, xmlEsc, xmlGet } from '../../_ms.js';

export default async function handler(req, res) {
  const email = getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || !/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ticket ID' });

  if (req.method === 'GET')  return getTicket(res, email, id);
  if (req.method === 'POST') return addUpdate(req, res, email, id);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Get ticket detail ─────────────────────────────────────────────────────────

async function getTicket(res, email, id) {
  try {
    const xml  = `<GetTicketsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}" ticket_id="${id}" include_ticket_updates="true"></GetTicketsRequest>`;
    const text = await msPost(xml);

    if (!text.includes('<Result>Success</Result>')) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // ── Parse ticket ──
    const ticketBlock = text.match(/<Ticket>([\s\S]*?)<\/Ticket>/)?.[1] || '';
    const ticketEmail = xmlGet(ticketBlock, 'Email');

    // Security: only show tickets owned by the authenticated user
    if (ticketEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Parse updates ──
    const updates = [];
    for (const match of text.matchAll(/<TicketUpdate>([\s\S]*?)<\/TicketUpdate>/g)) {
      const block = match[1];

      // Content is often wrapped in CDATA
      const contentRaw = block.match(/<Content>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Content>/)?.[1] || '';

      updates.push({
        id:        xmlGet(block, 'TicketUpdateID'),
        datetime:  xmlGet(block, 'UpdateDatetime'),
        firstname: xmlGet(block, 'Firstname'),
        lastname:  xmlGet(block, 'Lastname'),
        email:     xmlGet(block, 'Email'),
        content:   contentRaw.trim(),
      });
    }

    const ticket = {
      id,
      summary:    xmlGet(ticketBlock, 'TicketSummary'),
      status:     xmlGet(ticketBlock, 'Status'),
      created:    xmlGet(ticketBlock, 'CreatedDatetime'),
      closed:     xmlGet(ticketBlock, 'ClosedDatetime'),
      categoryId: xmlGet(ticketBlock, 'CategoryID'),
      category:   xmlGet(ticketBlock, 'CategoryName'),
      email:      ticketEmail,
      updates,
    };

    return res.status(200).json({ ticket });
  } catch (err) {
    console.error('getTicket error:', err);
    return res.status(500).json({ error: 'Failed to load ticket' });
  }
}

// ── Add update ────────────────────────────────────────────────────────────────

async function addUpdate(req, res, email, id) {
  const { detail } = req.body || {};
  if (!detail || !detail.trim()) {
    return res.status(400).json({ error: 'Update text is required' });
  }

  try {
    // ── Verify ownership and check ticket is open ──
    const checkXml  = `<GetTicketsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}" ticket_id="${id}"></GetTicketsRequest>`;
    const checkText = await msPost(checkXml);

    const ticketBlock = checkText.match(/<Ticket>([\s\S]*?)<\/Ticket>/)?.[1] || '';
    const ticketEmail = xmlGet(ticketBlock, 'Email');
    const status      = xmlGet(ticketBlock, 'Status');

    if (ticketEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (status.toLowerCase().startsWith('closed')) {
      return res.status(400).json({ error: 'This ticket is closed and cannot be updated.' });
    }

    // ── Submit update ──
    const xml = `<AddTicketUpdateRequest ticket_id="${id}" account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}">
  <TicketUpdate>
    <ContactEmail>${xmlEsc(email)}</ContactEmail>
    <Detail>${xmlEsc(detail.trim())}</Detail>
    <Status>Open</Status>
    <EmailClient>Y</EmailClient>
    <EmailSupportTeam>Y</EmailSupportTeam>
  </TicketUpdate>
</AddTicketUpdateRequest>`;

    const text = await msPost(xml);

    if (!text.includes('<Result>Success</Result>')) {
      console.error('AddTicketUpdateRequest failed:', text);
      return res.status(500).json({ error: 'Failed to submit update. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('addUpdate error:', err);
    return res.status(500).json({ error: 'Failed to submit update. Please try again.' });
  }
}
