import type { FastifyBaseLogger } from 'fastify'
import { env } from '../env'
import { isMongoConfigured } from '../db'
import { getEventByIdStore } from '../store/events'
import { getRegistrationById } from '../store/registrations'
import {
  claimDueEmailJobs,
  markEmailJobFailed,
  markEmailJobSent,
  type EmailJob,
} from '../store/emailJobs'
import { sendTextEmail } from '../integrations/email'

function subjectFor(job: EmailJob, eventTitle: string) {
  switch (job.type) {
    case 'event_confirmation':
      return `Registration confirmed: ${eventTitle}`
    case 'event_reminder':
      return `Reminder: ${eventTitle}`
    case 'event_thank_you':
      return `Thank you for attending: ${eventTitle}`
  }
}

function buildText(params: {
  job: EmailJob
  recipientName: string
  eventTitle: string
  eventDateLabel: string
  timezoneLabel: string
  platform: string
}) {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,'

  if (params.job.type === 'event_confirmation') {
    return [
      greeting,
      '',
      `You're registered for: ${params.eventTitle}`,
      `When: ${params.eventDateLabel} (${params.timezoneLabel})`,
      `Platform: ${params.platform}`,
      '',
      'We’ll share the joining link in a follow-up email.',
      '',
      'Mentor Team',
    ].join('\n')
  }

  if (params.job.type === 'event_reminder') {
    return [
      greeting,
      '',
      `Just a reminder about: ${params.eventTitle}`,
      `When: ${params.eventDateLabel} (${params.timezoneLabel})`,
      `Platform: ${params.platform}`,
      '',
      'Joining link will be shared separately.',
      '',
      'Mentor Team',
    ].join('\n')
  }

  return [
    greeting,
    '',
    `Thanks for attending: ${params.eventTitle}`,
    '',
    'We’ll send the recording and slides once they’re ready.',
    '',
    'Mentor Team',
  ].join('\n')
}

function retryDelayMs(attempts: number) {
  // 1m, 4m, 9m, 16m... capped at 60m
  const mins = Math.min(attempts * attempts, 60)
  return mins * 60_000
}

export async function runEmailWorkerOnce(logger: FastifyBaseLogger) {
  if (!env.EMAIL_JOBS_ENABLED) return
  if (!isMongoConfigured()) return

  const nowIso = new Date().toISOString()
  let jobs: EmailJob[] = []
  try {
    jobs = await claimDueEmailJobs({ nowIso, limit: env.EMAIL_JOBS_BATCH_SIZE })
  } catch (err: any) {
    logger.warn({ err }, 'Email worker skipped: unable to reach Mongo')
    return
  }
  if (jobs.length === 0) return

  for (const job of jobs) {
    try {
      const reg = await getRegistrationById(job.payload.registrationId)
      const evt = await getEventByIdStore(job.payload.eventId)

      if (!reg) {
        await markEmailJobFailed({
          id: job.id,
          nowIso,
          error: `Registration not found: ${job.payload.registrationId}`,
        })
        continue
      }

      if (!evt) {
        await markEmailJobFailed({
          id: job.id,
          nowIso,
          error: `Event not found: ${job.payload.eventId}`,
        })
        continue
      }

      const subject = subjectFor(job, evt.title)
      const text = buildText({
        job,
        recipientName: reg.name,
        eventTitle: evt.title,
        eventDateLabel: evt.dateLabel,
        timezoneLabel: evt.timezoneLabel,
        platform: evt.platform,
      })

      await sendTextEmail({ to: job.to, subject, text })
      await markEmailJobSent({ id: job.id, nowIso })
    } catch (err: any) {
      const message = err?.message ? String(err.message) : String(err)
      logger.error({ err: message, jobId: job.id }, 'Email job failed')

      const canRetry = job.attempts < env.EMAIL_JOBS_MAX_ATTEMPTS
      const retryAtIso = canRetry
        ? new Date(Date.now() + retryDelayMs(job.attempts)).toISOString()
        : undefined

      await markEmailJobFailed({
        id: job.id,
        nowIso,
        error: message,
        retryAtIso,
      })
    }
  }
}

export function startEmailWorker(logger: FastifyBaseLogger) {
  if (!env.EMAIL_JOBS_ENABLED) {
    logger.info('Email worker disabled (EMAIL_JOBS_ENABLED=false)')
    return { stop: () => {} }
  }

  if (!isMongoConfigured()) {
    logger.info('Email worker disabled (Mongo not configured)')
    return { stop: () => {} }
  }

  if (env.NODE_ENV === 'test') return { stop: () => {} }

  const intervalMs = env.EMAIL_JOBS_POLL_INTERVAL_MS
  logger.info({ intervalMs }, 'Email worker started')

  const timer = setInterval(() => {
    runEmailWorkerOnce(logger).catch((err) => {
      logger.error({ err }, 'Email worker tick failed')
    })
  }, intervalMs)

  return {
    stop: () => clearInterval(timer),
  }
}
