import Fastify from 'fastify'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import rateLimit from '@fastify/rate-limit'
import { env } from './env'
import { getDb, isMongoConfigured, ensureIndexes } from './db'
import { authRoutes } from './routes/auth'
import { adminAuthRoutes } from './routes/adminAuth'
import { adminRoutes } from './routes/admin'
import { adminEventsRoutes } from './routes/adminEvents'
import { adminRegistrationsRoutes } from './routes/adminRegistrations'
import { adminReportsRoutes } from './routes/adminReports'
import { adminAnalyticsRoutes } from './routes/adminAnalytics'
import { adminNotificationsRoutes } from './routes/adminNotifications'
import { usersRoutes } from './routes/users'
import { eventsRoutes } from './routes/events'
import { stripeRoutes } from './routes/stripe'
import { invoicesRoutes } from './routes/invoices'
import { ticketsRoutes } from './routes/tickets'
import { meetingsRoutes } from './routes/meetings'
import { notificationsRoutes } from './routes/notifications'
import { knowledgeBaseRoutes } from './routes/knowledgeBase'
import { videosRoutes } from './routes/videos'
import { documentsRoutes } from './routes/documents'
import { profileRoutes } from './routes/profile'
import { featuresRoutes } from './routes/features'
import { hubspotOAuthRoutes } from './routes/hubspotOAuth'
import { activityRoutes } from './routes/activity'
import { adminHubspotAuditRoutes } from './routes/adminHubspotAudit'
import { adminTicketStatsRoutes } from './routes/adminTicketStats'
import { adminDashboardStatsRoutes } from './routes/adminDashboardStats'
import { adminSalesFunnelRoutes } from './routes/adminSalesFunnel'
import { adminSalesStatsRoutes } from './routes/adminSalesStats'
import { adminCustomerSuccessRoutes } from './routes/adminCustomerSuccess'
import { startEmailWorker } from './jobs/emailWorker'
import { ensureSeedAdmin } from './store/adminUsers'

export async function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  })

  let stopWorker: (() => void) | null = null
  app.addHook('onReady', async () => {
    stopWorker = startEmailWorker(app.log).stop
  })

  app.addHook('onClose', async () => {
    stopWorker?.()
  })

  // Seed admin if needed.
  await ensureSeedAdmin(app.log)
  await ensureIndexes()

  const allowedOrigins = env.PORTAL_BASE_URL
    ? [env.PORTAL_BASE_URL.replace(/\/$/, '')]
    : ['http://localhost:5173']

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(compress, { global: true })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.get('/health', async () => ({ ok: true }))

  // Health check — minimal info.
  app.get('/health/db', async () => {
    if (!isMongoConfigured()) {
      return { mongoConfigured: false, mongoConnected: false }
    }

    try {
      const db = await getDb()
      if (!db) return { mongoConfigured: true, mongoConnected: false }
      await db.command({ ping: 1 })
      return { mongoConfigured: true, mongoConnected: true }
    } catch {
      return { mongoConfigured: true, mongoConnected: false }
    }
  })

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(adminAuthRoutes, { prefix: '/admin-auth' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.register(adminEventsRoutes, { prefix: '/admin/events' })
  await app.register(adminRegistrationsRoutes, { prefix: '/admin/registrations' })
  await app.register(adminHubspotAuditRoutes, { prefix: '/admin/hubspot-audit' })
  await app.register(adminReportsRoutes, { prefix: '/admin/reports' })
  await app.register(adminAnalyticsRoutes, { prefix: '/admin/analytics' })
  await app.register(adminNotificationsRoutes, { prefix: '/admin/notifications' })
  await app.register(adminTicketStatsRoutes, { prefix: '/admin/ticket-stats' })
  await app.register(adminDashboardStatsRoutes, { prefix: '/admin/dashboard-stats' })
  await app.register(adminSalesFunnelRoutes, { prefix: '/admin/sales-funnel' })
  await app.register(adminSalesStatsRoutes, { prefix: '/admin/sales-stats' })
  await app.register(adminCustomerSuccessRoutes, { prefix: '/admin/customer-success' })
  await app.register(usersRoutes, { prefix: '/admin/users' })
  await app.register(eventsRoutes, { prefix: '/events' })
  await app.register(stripeRoutes, { prefix: '/stripe' })
  await app.register(invoicesRoutes, { prefix: '/invoices' })
  await app.register(ticketsRoutes, { prefix: '/tickets' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(meetingsRoutes, { prefix: '/meetings' })
  await app.register(knowledgeBaseRoutes, { prefix: '/knowledge-base' })
  await app.register(videosRoutes, { prefix: '/videos' })
  await app.register(documentsRoutes, { prefix: '/documents' })
  await app.register(profileRoutes, { prefix: '/profile' })
  await app.register(featuresRoutes, { prefix: '/features' })
  await app.register(activityRoutes, { prefix: '/activity' })
  await app.register(hubspotOAuthRoutes, { prefix: '/api/hubspot/oauth' })

  return app
}
