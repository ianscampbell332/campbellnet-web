/**
 * GET  /api/portal/tickets  — list all tickets for the authenticated customer
 * POST /api/portal/tickets  — file a new ticket
 *
 * Tickets are filtered server-side by the authenticated email address.
 * The MS API doesn't expose a per-contact ticket filter, so we pull the
 * full group-12 list and filter here.  For a small customer base this is fine.
 */

import { getSessionEmail } from './_auth.js';
import { msPost, xmlEsc, xmlGet } from '../_ms.js';

export default async function handler(req, res) {
  const email = getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET')  return listTickets(res, email);
  if (req.method === 'POST') return createTicket(req, res, email);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ── List tickets ─────────────────────────────────────────────────────────────

async function listTickets(res, email) {
  try {
    const xml  = `<GetTicketsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}"></GetTicketsRequest>`;
    const text = await msPost(xml);

    const tickets = [];
    for (const match of text.matchAll(/<Ticket>([\s\S]*?)<\/Ticket>/g)) {
      const block      = match[1];
      const ticketEmail = xmlGet(block, 'Email');

      // Only return tickets belonging to the authenticated user
      if (ticketEmail.toLowerCase() !== email.toLowerCase()) continue;

      tickets.push({
        id:         xmlGet(block, 'TicketID'),
        summary:    xmlGet(block, 'TicketSummary'),
        status:     xmlGet(block, 'Status'),
        created:    xmlGet(block, 'CreatedDatetime'),
        closed:     xmlGet(block, 'ClosedDatetime'),
        categoryId: xmlGet(block, 'CategoryID'),   // may be empty in list response
        category:   xmlGet(block, 'CategoryName'), // may be empty in list response
      });
    }

    return res.status(200).json({ tickets });
  } catch (err) {
    console.error('listTickets error:', err);
    return res.status(500).json({ error: 'Failed to load tickets' });
  }
}

// ── Create ticket ────────────────────────────────────────────────────────────

async function createTicket(req, res, email) {
  const { summary, detail, categoryId } = req.body || {};

  if (!summary || !detail || !categoryId) {
    return res.status(400).json({ error: 'summary, detail, and categoryId are required' });
  }

  try {
    // Resolve FormID dynamically so we never hardcode it
    const formsXml  = `<GetTicketFormsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}"/>`;
    const formsText = await msPost(formsXml);

    const formIdMatch = formsText.match(/<FormID>(\d+)<\/FormID>/);
    if (!formIdMatch) {
      console.error('Could not resolve FormID:', formsText);
      return res.status(500).json({ error: 'Could not determine ticket form. Please try again.' });
    }
    const formId = formIdMatch[1];

    // Create the ticket
    const xml = `<AddTicketRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_SUPPORT_GROUP_ID}">
  <Ticket>
    <ContactEmail>${xmlEsc(email)}</ContactEmail>
    <CategoryID>${xmlEsc(categoryId)}</CategoryID>
    <FormID>${xmlEsc(formId)}</FormID>
    <Summary>${xmlEsc(summary)}</Summary>
    <Detail>${xmlEsc(detail)}</Detail>
  </Ticket>
</AddTicketRequest>`;

    const text = await msPost(xml);

    if (!text.includes('<Result>Success</Result>')) {
      console.error('AddTicketRequest failed:', text);
      return res.status(500).json({ error: 'Failed to submit ticket. Please try again or call us.' });
    }

    const newIdMatch = text.match(/<TicketID>(\d+)<\/TicketID>/);
    return res.status(200).json({ success: true, ticketId: newIdMatch ? newIdMatch[1] : null });

  } catch (err) {
    console.error('createTicket error:', err);
    return res.status(500).json({ error: 'Failed to submit ticket. Please try again or call us.' });
  }
}
