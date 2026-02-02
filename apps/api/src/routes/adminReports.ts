import type { FastifyPluginAsync } from 'fastify'
import { requireAdmin } from '../auth/requireAdmin'
import { listEventsStore } from '../store/events'
import { listRegistrationsByEventId } from '../store/registrations'

export type AdminEventReport = {
  eventId: string
  title: string
  dateLabel: string
  status: string | null
  invitedCount: number | null
  registeredCount: number
  paymentPendingCount: number
  paidCount: number
  cancelledCount: number
  failedCount: number
  attendedCount: number
  noShowCount: number
  totalRegistrations: number
}

export const adminReportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  app.get('/events', async () => {
    const events = await listEventsStore()
    const reports: AdminEventReport[] = []

    for (const event of events) {
      const regs = await listRegistrationsByEventId(event.id)
      const registeredCount = regs.filter((r) => r.status === 'registered').length
      const paymentPendingCount = regs.filter((r) => r.status === 'payment_pending').length
      const paidCount = regs.filter((r) => r.status === 'paid').length
      const cancelledCount = regs.filter((r) => r.status === 'cancelled').length
      const failedCount = regs.filter((r) => r.status === 'failed').length
      const attendedCount = regs.filter((r) => r.attendanceStatus === 'attended').length
      const noShowCount = regs.filter((r) => r.attendanceStatus === 'no_show').length
      const invitedCount = event.emailStats?.sent ?? null

      reports.push({
        eventId: event.id,
        title: event.title,
        dateLabel: event.dateLabel,
        status: event.status ?? null,
        invitedCount,
        registeredCount,
        paymentPendingCount,
        paidCount,
        cancelledCount,
        failedCount,
        attendedCount,
        noShowCount,
        totalRegistrations: regs.length,
      })
    }

    return { events: reports }
  })
}
