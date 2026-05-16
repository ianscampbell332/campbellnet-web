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

  const msPost = async (xml) => {
    const body = new URLSearchParams({
      email: process.env.MISSION_SUITE_USER,
      auth_token: process.env.MISSION_SUITE_AUTH_TOKEN,
      xml,
    });
    const res = await fetch('https://api.stgi.net/api-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.text();
  };

  try {
    // Step 0: Look up group name from ID so we're not hardcoding a name that can change
    const groupLookupXml = `<GetGroupsRequest account_id="${process.env.MISSION_SUITE_ACCOUNT_ID}" group_id="${process.env.MISSION_SUITE_CONTACT_FORM_GROUP_ID}" response="json"></GetGroupsRequest>`;
    const groupLookupText = await msPost(groupLookupXml);
    const groupData = JSON.parse(groupLookupText);
    const groupResult = groupData?.getgroupsresponse?.groups?.group;
    const groupName = Array.isArray(groupResult) ? groupResult[0]?.name : groupResult?.name;

    if (!groupName) {
      console.error('Could not resolve group name from ID:', groupLookupText);
      return res.status(502).json({ error: 'Mission Suite error', detail: 'Could not resolve group name from group ID' });
    }

    // Step 1: Add contact
    const addContactXml = `<AddContactsRequest update="true">
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
        <Group>${esc(groupName)}</Group>
      </Groups>
      <WorkflowID>${process.env.MISSION_SUITE_CONTACT_WORKFLOW_ID}</WorkflowID>
    </Contact>
  </Contacts>
</AddContactsRequest>`;

    const addText = await msPost(addContactXml);

    if (!addText.includes('<Result>Success</Result>')) {
      console.error('AddContactsRequest failed:', addText);
      return res.status(502).json({ error: 'Mission Suite error', detail: addText });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Mission Suite fetch failed:', err);
    return res.status(500).json({ error: 'Network error. Please try again or call us directly.' });
  }
}
