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

export const meetingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.get('/', async () => {
    const hubspotConfigured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    return {
      meetings: [] as MeetingDto[],
      warning: hubspotConfigured
        ? undefined
        : 'HubSpot is not configured. No meetings available.',
    }
  })
}
