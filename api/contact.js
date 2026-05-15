export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name_first, name_last, organization, email, phone, location, service, message } = req.body;

  // Basic validation
  if (!name_first || !name_last || !organization || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Map checkbox values to readable labels
  const serviceMap = {
    wifi:        'Wireless Networking',
    voip:        'Unified Communications / VoIP',
    security:    'Physical Security',
    network:     'Network Infrastructure',
    netsecurity: 'Network Security',
    notsure:     'Not sure yet',
  };

  const services = Array.isArray(service) ? service : service ? [service] : [];
  const serviceInterest = services.map(s => serviceMap[s] || s).join(', ');

  // Escape XML special characters
  const esc = v => (v || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const xml = `<AddContactsRequest update="true">
  <Contacts>
    <Contact account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}">
      <Firstname>${esc(name_first)}</Firstname>
      <Lastname>${esc(name_last)}</Lastname>
      <Company>${esc(organization)}</Company>
      <Email>${esc(email)}</Email>
      <Phone>${esc(phone)}</Phone>
      <City>${esc(location)}</City>
      <Notes>${esc(message)}</Notes>
      <UserDefinedFields>
        <UserDefinedField fieldname="Service Interest">${esc(serviceInterest)}</UserDefinedField>
      </UserDefinedFields>
      <Groups>
        <Group_id>${process.env.MISSION_SUITE_CONTACT_FORM_GROUP_ID}</Group_id>
      </Groups>
      <WorkflowID>${process.env.MISSION_SUITE_CONTACT_WORKFLOW_ID}</WorkflowID>
    </Contact>
  </Contacts>
</AddContactsRequest>`;

  const body = new URLSearchParams({
    email: process.env.MISSION_SUITE_USER,
    auth_token: process.env.MISSION_SUITE_AUTH_TOKEN,
    xml,
  });

  try {
    const msRes = await fetch('https://api.stgi.net/api-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const text = await msRes.text();

    if (text.includes('<Result>Success</Result>')) {
      return res.status(200).json({ success: true });
    }

    console.error('Mission Suite error response:', text);
    return res.status(502).json({ error: 'Mission Suite error', detail: text || '(empty response body)', sentXml: xml });

  } catch (err) {
    console.error('Mission Suite fetch failed:', err);
    return res.status(500).json({ error: 'Network error. Please try again or call us directly.' });
  }
}
