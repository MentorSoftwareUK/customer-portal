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

const demoInvoices: InvoiceDto[] = [
  {
    id: 'inv_10021',
    number: 'INV-10021',
    date: '2026-01-01',
    status: 'Paid',
    amountGbp: 120,
    pdfUrl: null,
  },
  {
    id: 'inv_10012',
    number: 'INV-10012',
    date: '2025-11-15',
    status: 'Overdue',
    amountGbp: 120,
    pdfUrl: null,
  },
  {
    id: 'inv_10008',
    number: 'INV-10008',
    date: '2025-12-01',
    status: 'Unpaid',
    amountGbp: 120,
    pdfUrl: null,
  },
]

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
      invoices: demoInvoices,
      warning: quickbooksConfigured
        ? undefined
        : 'QuickBooks is not configured (missing QUICKBOOKS_CLIENT_ID/QUICKBOOKS_CLIENT_SECRET). Returning demo invoices.',
    }
  })
}
