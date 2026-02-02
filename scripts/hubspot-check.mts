import {
  hubspotFindContactByEmail,
  hubspotFindCompanyByDomain,
  hubspotGetCompanyById,
  hubspotGetPrimaryCompanyIdForContact,
} from '../apps/api/src/integrations/hubspot'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx -y tsx scripts/hubspot-check.mts <email>')
  process.exit(1)
}

const domain = email.split('@')[1]?.toLowerCase().trim() || null

async function main() {
  const contact = await hubspotFindContactByEmail({
    email,
    properties: ['email', 'salesstatus'],
  })

  let primaryCompany: { id: string; properties: Record<string, string | null> } | null = null
  if (contact?.id) {
    const companyId = await hubspotGetPrimaryCompanyIdForContact(contact.id)
    if (companyId) {
      primaryCompany = await hubspotGetCompanyById({
        id: companyId,
        properties: ['name', 'domain', 'salesstatus'],
      })
    }
  }

  const companyByDomain = domain
    ? await hubspotFindCompanyByDomain({
        domain,
        properties: ['name', 'domain', 'salesstatus'],
      })
    : null

  console.log(
    JSON.stringify(
      {
        email,
        domain,
        contact: contact
          ? {
              id: contact.id,
              salesstatus: contact.properties?.salesstatus ?? null,
            }
          : null,
        primaryCompany: primaryCompany
          ? {
              id: primaryCompany.id,
              domain: primaryCompany.properties?.domain ?? null,
              salesstatus: primaryCompany.properties?.salesstatus ?? null,
            }
          : null,
        companyByDomain: companyByDomain
          ? {
              id: companyByDomain.id,
              domain: companyByDomain.properties?.domain ?? null,
              salesstatus: companyByDomain.properties?.salesstatus ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
