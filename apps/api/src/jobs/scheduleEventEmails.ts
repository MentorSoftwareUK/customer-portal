import { getAdminSettings } from '../store/settings'
import { createEmailJob, type EmailJobType } from '../store/emailJobs'
import { getEventByIdStore } from '../store/events'

function jobId(registrationId: string, type: EmailJobType) {
  return `email_${registrationId}_${type}`
}

function hoursToMs(hours: number) {
  return hours * 60 * 60 * 1000
}

function buildRunAtIso(date: Date) {
  return date.toISOString()
}

export async function scheduleEventEmailsForRegistration(params: {
  registrationId: string
  eventId: string
  to: string
  sendConfirmationNow?: boolean
}): Promise<{ enqueued: EmailJobType[] }> {
  const settings = await getAdminSettings()
  const evt = await getEventByIdStore(params.eventId)
  if (!evt) return { enqueued: [] }

  const enqueued: EmailJobType[] = []

  const now = new Date()

  const enabled = settings.eventEmails.enabled
  if (!enabled) return { enqueued }

  if (settings.eventEmails.confirmationEnabled && params.sendConfirmationNow !== false) {
    const type: EmailJobType = 'event_confirmation'
    await createEmailJob({
      id: jobId(params.registrationId, type),
      type,
      to: params.to,
      status: 'pending',
      attempts: 0,
      runAt: buildRunAtIso(now),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      payload: {
        eventId: params.eventId,
        registrationId: params.registrationId,
      },
    })
    enqueued.push(type)
  }

  const eventStart = new Date(evt.startAt)

  if (settings.eventEmails.reminderEnabled) {
    const reminderAt = new Date(eventStart.getTime() - hoursToMs(settings.eventEmails.reminderLeadTimeHours))
    if (reminderAt.getTime() > now.getTime()) {
      const type: EmailJobType = 'event_reminder'
      await createEmailJob({
        id: jobId(params.registrationId, type),
        type,
        to: params.to,
        status: 'pending',
        attempts: 0,
        runAt: buildRunAtIso(reminderAt),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        payload: {
          eventId: params.eventId,
          registrationId: params.registrationId,
        },
      })
      enqueued.push(type)
    }
  }

  if (settings.eventEmails.thankYouEnabled) {
    const thankAt = new Date(eventStart.getTime() + hoursToMs(settings.eventEmails.thankYouDelayHours))
    if (thankAt.getTime() > now.getTime()) {
      const type: EmailJobType = 'event_thank_you'
      await createEmailJob({
        id: jobId(params.registrationId, type),
        type,
        to: params.to,
        status: 'pending',
        attempts: 0,
        runAt: buildRunAtIso(thankAt),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        payload: {
          eventId: params.eventId,
          registrationId: params.registrationId,
        },
      })
      enqueued.push(type)
    }
  }

  return { enqueued }
}
