import type { FastifyPluginAsync } from 'fastify'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'

export type MeetingTeam = 'Training' | 'Success Team' | 'Renewals'

export type MeetingDto = {
  id: string
  team: MeetingTeam
  hostName?: string | null
  dateTimeLabel: string
  joinUrl: string | null
}

const demoMeetings: MeetingDto[] = [
  {
    id: 'mtg_training_1',
    team: 'Training',
    hostName: 'Shaun Ward',
    dateTimeLabel: 'Wed 17 Jan · 09:30',
    joinUrl: null,
  },
  {
    id: 'mtg_cs_1',
    team: 'Success Team',
    hostName: 'Simone Mills',
    dateTimeLabel: 'Tue 23 Jan · 15:00',
    joinUrl: null,
  },
  {
    id: 'mtg_support_1',
    team: 'Renewals',
    hostName: 'Hope Schindler',
    dateTimeLabel: 'Fri 26 Jan · 11:00',
    joinUrl: null,
  },
]

export const meetingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    return {
      meetings: demoMeetings,
      warning: hubspotConfigured
        ? undefined
        : 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN). Returning demo meetings.',
    }
  })
}
