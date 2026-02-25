import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { env } from '../env'

// ─── Types ────────────────────────────────────────────────────────────────────

type PropertyVersion = {
  value: string | null
  timestamp: string
  sourceType: string | null
  sourceId: string | null
}

type ContactWithHistory = {
  id: string
  properties: Record<string, string | null>
  propertiesWithHistory: {
    firstname?: PropertyVersion[]
    lastname?: PropertyVersion[]
    email?: PropertyVersion[]
    hs_additional_emails?: PropertyVersion[]
  }
}

export type FormCorruptionMatch = {
  contactId: string
  hubspotUrl: string
  currentEmail: string
  currentFirstName: string
  currentLastName: string
  previousEmail: string
  firstNameBefore: string
  firstNameAfter: string
  additionalEmails: string
  changeTimestamp: string
  sourceType: string
  sourceId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hubspotHeaders() {
  const token = env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not configured')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Search for contacts that have hs_additional_emails set.
 * Returns pages of contact IDs.
 */
async function searchContactsWithAdditionalEmails(
  after?: string,
): Promise<{ results: Array<{ id: string }>; nextAfter?: string }> {
  const body = {
    filterGroups: [
      {
        filters: [{ propertyName: 'hs_additional_emails', operator: 'HAS_PROPERTY' }],
      },
    ],
    properties: ['firstname', 'lastname', 'email', 'hs_additional_emails'],
    limit: 100,
    ...(after ? { after } : {}),
  }

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: hubspotHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot search failed (${res.status}): ${text}`)
  }

  const data = await res.json() as {
    results: Array<{ id: string; properties: Record<string, string | null> }>
    paging?: { next?: { after: string } }
  }

  return {
    results: data.results ?? [],
    nextAfter: data.paging?.next?.after,
  }
}

/**
 * Fetch a single contact with property history for the four key properties.
 */
async function fetchContactWithHistory(contactId: string): Promise<ContactWithHistory> {
  const props = 'firstname,lastname,email,hs_additional_emails'
  const url = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?propertiesWithHistory=${props}&properties=${props}`

  const res = await fetch(url, { method: 'GET', headers: hubspotHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HubSpot contact fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<ContactWithHistory>
}

/** Find the version entry whose timestamp is within `windowMs` of `targetMs`. */
function findVersionNear(
  versions: PropertyVersion[] | undefined,
  targetMs: number,
  windowMs = 120_000,
): PropertyVersion | null {
  if (!versions) return null
  return (
    versions.find((v) => {
      const t = Date.parse(v.timestamp)
      return !Number.isNaN(t) && Math.abs(t - targetMs) <= windowMs
    }) ?? null
  )
}

/** Get the version that appeared just BEFORE `v` in the array (array is newest-first). */
function versionBefore(versions: PropertyVersion[], v: PropertyVersion): PropertyVersion | null {
  const idx = versions.indexOf(v)
  if (idx < 0) return null
  return versions[idx + 1] ?? null
}

/**
 * Check whether a contact's property history matches the form-submission
 * name/email corruption pattern and return details if it does.
 */
function detectPattern(contact: ContactWithHistory): FormCorruptionMatch | null {
  const h = contact.propertiesWithHistory
  const firstnameHistory = h.firstname ?? []
  const lastnameHistory = h.lastname ?? []
  const emailHistory = h.email ?? []
  const additionalHistory = h.hs_additional_emails ?? []

  // Walk every firstname change and look for the pattern
  for (const fnVersion of firstnameHistory) {
    const changeMs = Date.parse(fnVersion.timestamp)
    if (Number.isNaN(changeMs)) continue

    // The version immediately before this one (older)
    const fnBefore = versionBefore(firstnameHistory, fnVersion)
    if (!fnBefore) continue // no prior record → can't compare
    if ((fnBefore.value ?? '') === (fnVersion.value ?? '')) continue // firstname didn't actually change

    // Look for an email change within a 2-minute window of this firstname change
    const emailVersion = findVersionNear(emailHistory, changeMs)
    if (!emailVersion) continue
    const emailBefore = versionBefore(emailHistory, emailVersion)
    if (!emailBefore) continue
    if ((emailBefore.value ?? '') === (emailVersion.value ?? '')) continue // email didn't change

    // The old email should now appear in hs_additional_emails
    const addlVersion = findVersionNear(additionalHistory, changeMs)
    const addlValue = addlVersion?.value ?? contact.properties.hs_additional_emails ?? ''
    const previousEmail = emailBefore.value ?? ''
    if (!addlValue || !previousEmail) continue
    if (!addlValue.split(';').map((s) => s.trim()).includes(previousEmail)) continue

    // Lastname should NOT have changed at this timestamp
    const lnVersion = findVersionNear(lastnameHistory, changeMs)
    if (lnVersion) continue // lastname changed → not our pattern

    // Determine source (prefer firstname change source, fall back to email)
    const sourceType = fnVersion.sourceType ?? emailVersion.sourceType ?? 'UNKNOWN'
    const sourceId = fnVersion.sourceId ?? emailVersion.sourceId ?? null

    // We only want form-originated changes (or unknown, which forms sometimes produce)
    const isFormSource = ['FORM', 'UNKNOWN', 'MIGRATION', 'IMPORT'].includes(
      sourceType.toUpperCase(),
    )
    if (!isFormSource) continue

    return {
      contactId: contact.id,
      hubspotUrl: `https://app.hubspot.com/contacts/${contact.id}`,
      currentEmail: contact.properties.email ?? '',
      currentFirstName: contact.properties.firstname ?? '',
      currentLastName: contact.properties.lastname ?? '',
      previousEmail,
      firstNameBefore: fnBefore.value ?? '',
      firstNameAfter: fnVersion.value ?? '',
      additionalEmails: addlValue,
      changeTimestamp: fnVersion.timestamp,
      sourceType,
      sourceId,
    }
  }

  return null
}

// ─── Route ───────────────────────────────────────────────────────────────────

const MAX_CONTACTS_TO_SCAN = 500

export const adminHubspotAuditRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  /**
   * GET /admin/hubspot-audit/form-contact-corruption
   *
   * Scans HubSpot contacts that have hs_additional_emails set, then checks
   * their property history for the form-submission name/email corruption pattern:
   *   - firstname changed
   *   - email changed at the same time
   *   - old email moved to hs_additional_emails
   *   - lastname unchanged
   *   - source was a form submission
   */
  app.get('/form-contact-corruption', async (req, reply) => {
    if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
      return reply.status(503).send({ error: 'HubSpot not configured' })
    }

    const matches: FormCorruptionMatch[] = []
    let scanned = 0
    let after: string | undefined = undefined
    let truncated = false

    try {
      outer: while (true) {
        const page = await searchContactsWithAdditionalEmails(after)
        if (page.results.length === 0) break

        // Fetch history for each contact in this page concurrently (batches of 10)
        const batchSize = 10
        for (let i = 0; i < page.results.length; i += batchSize) {
          const batch = page.results.slice(i, i + batchSize)
          const details = await Promise.all(
            batch.map((c) =>
              fetchContactWithHistory(c.id).catch(() => null),
            ),
          )

          for (const contact of details) {
            if (!contact) continue
            scanned++

            const match = detectPattern(contact)
            if (match) matches.push(match)

            if (scanned >= MAX_CONTACTS_TO_SCAN) {
              truncated = true
              break outer
            }
          }
        }

        if (!page.nextAfter) break
        after = page.nextAfter
      }
    } catch (err: any) {
      return reply.status(502).send({
        error: 'HubSpot API error',
        message: err?.message ?? String(err),
      })
    }

    return {
      scanned,
      matched: matches.length,
      truncated,
      results: matches,
    }
  })
}
