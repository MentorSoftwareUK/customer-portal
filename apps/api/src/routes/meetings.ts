import type { FastifyPluginAsync } from 'fastify'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { hubspotGetMeetingsForContact, hubspotFindContactByEmail } from '../integrations/hubspot'
import type { AuthTokenPayload } from '../auth/jwt'

export type MeetingTeam = 'Training' | 'Success Team' | 'Renewals'

export type MeetingDto = {
  id: string
  team: MeetingTeam
  hostName?: string | null
  dateTimeLabel: string
  joinUrl: string | null
}

function formatDateTimeLabel(startMs: number): string {
  const d = new Date(startMs)
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getMonth()]
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} · ${hours}:${mins}`
}

export const meetingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async (req) => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)
    if (!hubspotConfigured) {
      return { meetings: [] as MeetingDto[], warning: 'HubSpot is not configured. No meetings available.' }
    }

    const auth = (req as any).auth as AuthTokenPayload

    // Resolve HubSpot contact ID — prefer the one from the JWT, fall back to email lookup
    let contactId = auth.hubspotContactId ?? null
    if (!contactId) {
      try {
        const contact = await hubspotFindContactByEmail({ email: auth.email, properties: ['email'] })
        contactId = contact?.id ?? null
      } catch {
        contactId = null
      }
    }

    if (!contactId) {
      return { meetings: [] as MeetingDto[], warning: 'No HubSpot contact found for this account.' }
    }

    try {
      const hsMeetings = await hubspotGetMeetingsForContact(contactId)

      const meetings: MeetingDto[] = hsMeetings.map((m) => ({
        id: m.id,
        team: m.team,
        hostName: m.ownerName,
        dateTimeLabel: m.startTimeMs ? formatDateTimeLabel(m.startTimeMs) : 'TBC',
        joinUrl: m.joinUrl,
      }))

      return { meetings }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[meetings] Failed to fetch from HubSpot:', msg)
      return { meetings: [] as MeetingDto[], warning: 'Could not load meetings at this time.' }
    }
  })
}
