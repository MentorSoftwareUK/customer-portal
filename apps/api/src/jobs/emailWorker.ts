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
import {
  buildConfirmationHtml,
  buildInviteHtml,
  buildReminderHtml,
  buildThankYouHtml,
} from '../integrations/emailTemplates'

function subjectFor(job: EmailJob, eventTitle: string) {
  switch (job.type) {
    case 'event_invite':
      return `You're invited: ${eventTitle}`
    case 'event_confirmation':
      return `Registration confirmed: ${eventTitle}`
    case 'event_reminder':
      return `Reminder: ${eventTitle}`
    case 'event_thank_you':
      return `Thank you for joining: ${eventTitle}`
  }
}

function buildText(params: {
  job: EmailJob
  recipientName: string
  eventTitle: string
  eventDateLabel: string
  timezoneLabel: string
  platform: string
  hostName?: string | null
  joinUrl?: string | null
  webinarRecordingUrl?: string | null
  webinarSlides?: Array<{ label?: string; url: string }> | null
  blogPostUrl?: string | null
}) {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,'

  if (params.job.type === 'event_invite') {
    return [
      greeting,
      '',
      `We'd like to invite you to our upcoming exclusive webinar: ${params.eventTitle}`,
      `When: ${params.eventDateLabel}`,
      ...(params.hostName ? [`Host: ${params.hostName}`] : []),
      '',
      'This is an exclusive session for Mentor customers. Spaces are limited — secure your spot today.',
      '',
      'The Mentor Software Team',
    ].join('\n')
  }

  if (params.job.type === 'event_confirmation') {
    return [
      greeting,
      '',
      `You're registered for: ${params.eventTitle}`,
      `When: ${params.eventDateLabel} (${params.timezoneLabel})`,
      ...(params.hostName ? [`Host: ${params.hostName}`] : []),
      ...(params.joinUrl ? ['', `Join: ${params.joinUrl}`] : []),
      '',
      "If you're not able to attend live, don't worry. We'll share the recording and presentation slides with you after the webinar.",
      '',
      'The Mentor Software Team',
    ].join('\n')
  }

  if (params.job.type === 'event_reminder') {
    return [
      greeting,
      '',
      `Just a reminder about our upcoming ${params.eventTitle} webinar${params.hostName ? ` with ${params.hostName}` : ''}.`,
      '',
      `Date: ${params.eventDateLabel}`,
      ...(params.hostName ? [`Host: ${params.hostName}`] : []),
      ...(params.joinUrl ? ['', `Join the session: ${params.joinUrl}`] : []),
      '',
      "We'll share the recording and presentation slides with you after the webinar. We look forward to seeing you there!",
      '',
      'The Mentor Software Team',
    ].join('\n')
  }

  // event_thank_you
  const lines = [
    greeting,
    '',
    'Thank you for joining our exclusive Mentor customer webinar.',
    `"${params.eventTitle}"`,
    '',
    "If you couldn't attend live, or want to revisit the session, you can now:",
  ]
  if (params.webinarRecordingUrl) lines.push(`- Watch the recording: ${params.webinarRecordingUrl}`)
  if (params.webinarSlides?.[0]) lines.push(`- Download the slides: ${params.webinarSlides[0].url}`)
  if (params.blogPostUrl) lines.push(`- Read the key summary blog: ${params.blogPostUrl}`)
  lines.push('', 'If you have any questions or would like further support, our team is always here to help.', '', 'The Mentor Software Team')
  return lines.join('\n')
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
      const evt = await getEventByIdStore(job.payload.eventId)

      if (!evt) {
        await markEmailJobFailed({
          id: job.id,
          nowIso,
          error: `Event not found: ${job.payload.eventId}`,
        })
        continue
      }

      // For invite jobs, recipientName comes from the payload directly (no registration)
      let recipientName: string
      if (job.type === 'event_invite') {
        recipientName = job.payload.recipientName ?? ''
      } else {
        const reg = await getRegistrationById(job.payload.registrationId ?? '')
        if (!reg) {
          await markEmailJobFailed({
            id: job.id,
            nowIso,
            error: `Registration not found: ${job.payload.registrationId}`,
          })
          continue
        }
        recipientName = reg.name
      }

      const subject = subjectFor(job, evt.title)
      const sharedParams = {
        job,
        recipientName,
        eventTitle: evt.title,
        eventDateLabel: evt.dateLabel,
        timezoneLabel: evt.timezoneLabel,
        platform: evt.platform,
        hostName: evt.hostName ?? null,
        joinUrl: evt.joinUrl ?? null,
        webinarRecordingUrl: evt.webinarRecordingUrl ?? null,
        webinarSlides: evt.webinarSlides ?? null,
        blogPostUrl: (evt as any).blogPostUrl ?? null,
      }
      const text = buildText(sharedParams)
      let html: string | undefined
      try {
        if (job.type === 'event_invite') {
          const registerUrl = `${env.PORTAL_BASE_URL}/app/events/${evt.id}`
          html = buildInviteHtml({
            recipientName,
            eventTitle: evt.title,
            startAt: evt.startAt,
            durationMins: evt.durationMins,
            description: evt.description,
            hostName: evt.hostName,
            hostTitle: evt.hostTitle,
            registerUrl,
          })
        } else if (job.type === 'event_confirmation') {
          html = buildConfirmationHtml({
            recipientName,
            eventTitle: evt.title,
            startAt: evt.startAt,
            durationMins: evt.durationMins,
            hostName: evt.hostName,
            hostTitle: evt.hostTitle,
            joinUrl: evt.joinUrl,
          })
        } else if (job.type === 'event_reminder') {
          html = buildReminderHtml({
            recipientName,
            eventTitle: evt.title,
            startAt: evt.startAt,
            durationMins: evt.durationMins,
            hostName: evt.hostName,
            hostTitle: evt.hostTitle,
            joinUrl: evt.joinUrl,
            description: evt.description,
          })
        } else if (job.type === 'event_thank_you') {
          html = buildThankYouHtml({
            recipientName,
            eventTitle: evt.title,
            startAt: evt.startAt,
            durationMins: evt.durationMins,
            hostName: evt.hostName,
            hostTitle: evt.hostTitle,
            webinarRecordingUrl: evt.webinarRecordingUrl,
            webinarSlides: evt.webinarSlides,
            blogPostUrl: (evt as any).blogPostUrl,
          })
        }
      } catch (htmlErr) {
        logger.warn({ htmlErr }, 'Failed to build HTML email; falling back to plain text')
      }

      await sendTextEmail({ to: job.to, subject, text, html })
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
