import type { FastifyPluginAsync } from 'fastify'
import { env } from '../env'
import { requireAuth } from '../auth/requireAuth'
import { getFeatureFlags } from '../store/settings'

export type InvoiceStatus = 'Paid' | 'Unpaid' | 'Overdue'

export type InvoiceDto = {
  id: string
  number: string
  date: string
  status: InvoiceStatus
  amountGbp: number
  pdfUrl: string | null
}

export const invoicesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAuth(req, reply)
    if (!ok) return reply
  })

  app.addHook('preHandler', async (_req, reply) => {
    const features = await getFeatureFlags()
    if (!features.invoicesEnabled) {
      return reply.status(404).send({ error: 'not_found' })
    }
  })

  app.get('/', async () => {
    const quickbooksConfigured = Boolean(env.QUICKBOOKS_CLIENT_ID && env.QUICKBOOKS_CLIENT_SECRET)

    return {
      invoices: [] as InvoiceDto[],
      warning: quickbooksConfigured
        ? undefined
        : 'QuickBooks is not configured. No invoices available.',
    }
  })
}
