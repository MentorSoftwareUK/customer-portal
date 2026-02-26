import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { getAdminSettings, updateAdminSettings } from '../store/settings'
import { env } from '../env'
import { isEmailConfigured } from '../integrations/email'
import { hubspotGetMe } from '../integrations/hubspot'
import {
  deleteEmailTemplateOverride,
  getEmailTemplateOverride,
  listEmailTemplateOverrides,
  type EmailTemplateKey,
  upsertEmailTemplateOverride,
} from '../store/emailTemplateOverrides'
import { renderTemplate } from '../email/renderTemplate'
import {
  buildConfirmationHtml,
  buildInviteHtml,
  buildReminderHtml,
  buildThankYouHtml,
} from '../integrations/emailTemplates'
import { sendTextEmail } from '../integrations/email'

const PatchSettingsSchema = z.object({
  eventEmails: z
    .object({
      enabled: z.boolean().optional(),
      confirmationEnabled: z.boolean().optional(),
      reminderEnabled: z.boolean().optional(),
      reminderLeadTimeHours: z.number().int().nonnegative().optional(),
      thankYouEnabled: z.boolean().optional(),
      thankYouDelayHours: z.number().int().nonnegative().optional(),
    })
    .optional(),
  general: z
    .object({
      portalName: z.string().trim().max(120).optional(),
      brandPrimaryColor: z.string().trim().max(20).optional(),
      supportEmail: z.string().trim().email().optional(),
      supportUrl: z.string().trim().max(400).optional(),
      statusPageUrl: z.string().trim().max(400).optional(),
    })
    .optional(),
  features: z
    .object({
      invoicesEnabled: z.boolean().optional(),
      ticketsEnabled: z.boolean().optional(),
      knowledgeBaseEnabled: z.boolean().optional(),
      documentsEnabled: z.boolean().optional(),
      videosEnabled: z.boolean().optional(),
      meetingsEnabled: z.boolean().optional(),
      paymentsEnabled: z.boolean().optional(),
      eventRegistrationsEnabled: z.boolean().optional(),
    })
    .optional(),
  communications: z
    .object({
      emailFromName: z.string().trim().max(120).optional(),
      emailFromAddress: z.string().trim().email().optional(),
      replyToAddress: z.string().trim().email().optional(),
      supportCc: z.string().trim().max(500).optional(),
      supportBcc: z.string().trim().max(500).optional(),
    })
    .optional(),
  events: z
    .object({
      defaultDurationMins: z.number().int().positive().optional(),
      defaultTimezone: z.string().trim().max(120).optional(),
      defaultPlatform: z.string().trim().max(120).optional(),
      defaultJoinLinkLabel: z.string().trim().max(120).optional(),
      defaultCurrency: z.string().trim().max(10).optional(),
    })
    .optional(),
  auth: z
    .object({
      allowPasswordless: z.boolean().optional(),
      passwordMinLength: z.number().int().min(6).max(128).optional(),
      allowOAuthGoogle: z.boolean().optional(),
      allowOAuthMicrosoft: z.boolean().optional(),
      allowNonCustomerRegistration: z.boolean().optional(),
    })
    .optional(),
  integrations: z
    .object({
      hubspotLiveCustomerProperty: z.string().trim().max(120).optional(),
      hubspotLiveCustomerTrueValues: z.string().trim().max(500).optional(),
      hubspotProvisionTypeProperty: z.string().trim().max(120).optional(),
      hubspotProductVersionProperty: z.string().trim().max(120).optional(),
      stripeSuccessUrl: z.string().trim().max(500).optional(),
      stripeCancelUrl: z.string().trim().max(500).optional(),
      quickbooksRealm: z.string().trim().max(200).optional(),
      storageProvider: z.enum(['s3', 'azure', 'local']).optional(),
    })
    .optional(),
  contentGating: z
    .object({
      knowledgeBaseDefaultProvision: z.enum(['all', 'supported-accommodation', 'childrens-home', 'over-18']).optional(),
      documentsDefaultProvision: z.enum(['all', 'supported-accommodation', 'childrens-home', 'over-18']).optional(),
      videosDefaultProvision: z.enum(['all', 'supported-accommodation', 'childrens-home', 'over-18']).optional(),
    })
    .optional(),
  system: z
    .object({
      maintenanceModeEnabled: z.boolean().optional(),
      maintenanceMessage: z.string().trim().max(500).optional(),
      demoDataEnabled: z.boolean().optional(),
      rateLimitPerMinute: z.number().int().positive().optional(),
    })
    .optional(),
})

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  const EmailTemplateKeySchema = z.enum([
    'event_invite',
    'event_confirmation',
    'event_reminder',
    'event_thank_you',
  ])

  const UpsertEmailTemplateSchema = z
    .object({
      subject: z.string().max(500).nullable().optional(),
      html: z.string().max(200_000).nullable().optional(),
      text: z.string().max(200_000).nullable().optional(),
    })
    .strict()

  function templateMeta(key: EmailTemplateKey) {
    switch (key) {
      case 'event_invite':
        return {
          label: 'Invite',
          description: 'Sent to invite customers to register for an event',
          placeholders: ['recipientName', 'eventTitle', 'eventDateLabel', 'timezoneLabel', 'platform', 'hostName', 'registerUrl', 'description'],
        }
      case 'event_confirmation':
        return {
          label: 'Confirmation',
          description: 'Sent immediately after registration',
          placeholders: ['recipientName', 'eventTitle', 'eventDateLabel', 'timezoneLabel', 'platform', 'hostName', 'joinUrl'],
        }
      case 'event_reminder':
        return {
          label: 'Reminder',
          description: 'Sent before the event starts',
          placeholders: ['recipientName', 'eventTitle', 'eventDateLabel', 'timezoneLabel', 'platform', 'hostName', 'joinUrl', 'description'],
        }
      case 'event_thank_you':
        return {
          label: 'Thank you',
          description: 'Sent after the event with recording/materials',
          placeholders: ['recipientName', 'eventTitle', 'eventDateLabel', 'timezoneLabel', 'platform', 'hostName', 'webinarRecordingUrl', 'blogPostUrl'],
        }
    }
  }

  function defaultSubjectFor(key: EmailTemplateKey, eventTitle: string) {
    switch (key) {
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

  function sampleVars() {
    return {
      recipientName: 'Alex',
      eventTitle: 'Building Better Workflows',
      eventDateLabel: 'Thursday 14 March 2026, 10:00',
      timezoneLabel: 'Europe/London',
      platform: 'Teams',
      hostName: 'Taylor Smith',
      joinUrl: 'https://example.com/join',
      registerUrl: 'https://example.com/register',
      webinarRecordingUrl: 'https://example.com/recording',
      blogPostUrl: 'https://example.com/blog',
      description: 'A short walkthrough of best practices and Q&A.',
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      durationMins: 60,
    }
  }

  function defaultHtmlFor(key: EmailTemplateKey, vars: ReturnType<typeof sampleVars>) {
    if (key === 'event_invite') {
      return buildInviteHtml({
        recipientName: vars.recipientName,
        eventTitle: vars.eventTitle,
        startAt: vars.startAt,
        durationMins: vars.durationMins,
        description: vars.description,
        hostName: vars.hostName,
        hostTitle: 'Product Specialist',
        registerUrl: vars.registerUrl,
      })
    }
    if (key === 'event_confirmation') {
      return buildConfirmationHtml({
        recipientName: vars.recipientName,
        eventTitle: vars.eventTitle,
        startAt: vars.startAt,
        durationMins: vars.durationMins,
        hostName: vars.hostName,
        hostTitle: 'Product Specialist',
        joinUrl: vars.joinUrl,
      })
    }
    if (key === 'event_reminder') {
      return buildReminderHtml({
        recipientName: vars.recipientName,
        eventTitle: vars.eventTitle,
        startAt: vars.startAt,
        durationMins: vars.durationMins,
        hostName: vars.hostName,
        hostTitle: 'Product Specialist',
        joinUrl: vars.joinUrl,
        description: vars.description,
      })
    }

    return buildThankYouHtml({
      recipientName: vars.recipientName,
      eventTitle: vars.eventTitle,
      startAt: vars.startAt,
      durationMins: vars.durationMins,
      hostName: vars.hostName,
      hostTitle: 'Product Specialist',
      webinarRecordingUrl: vars.webinarRecordingUrl,
      webinarSlides: [{ label: 'Slides', url: 'https://example.com/slides.pdf' }],
      blogPostUrl: vars.blogPostUrl,
    })
  }

  app.get('/email/templates', async () => {
    const overrides = await listEmailTemplateOverrides()
    const byKey = new Map(overrides.map((o) => [o.key, o]))
    const keys: EmailTemplateKey[] = ['event_invite', 'event_confirmation', 'event_reminder', 'event_thank_you']
    const templates = keys.map((key) => {
      const meta = templateMeta(key)
      const ov = byKey.get(key) ?? null
      return {
        key,
        ...meta,
        override: ov,
      }
    })
    return { templates }
  })

  app.get('/email/templates/:key/preview', async (req, reply) => {
    const parsedKey = EmailTemplateKeySchema.safeParse((req.params as any)?.key)
    if (!parsedKey.success) return reply.status(400).send({ error: 'invalid_request' })
    const key = parsedKey.data as EmailTemplateKey

    const meta = templateMeta(key)
    const vars = sampleVars()
    const defaultSubject = defaultSubjectFor(key, vars.eventTitle)
    const defaultHtml = defaultHtmlFor(key, vars)

    const override = await getEmailTemplateOverride(key)
    const overrideRendered = override
      ? {
          subject: override.subject ? renderTemplate(override.subject, vars, 'subject') : null,
          text: override.text ? renderTemplate(override.text, vars, 'text') : null,
          html: override.html ? renderTemplate(override.html, vars, 'html') : null,
        }
      : null

    const effective = {
      subject: overrideRendered?.subject ?? defaultSubject,
      text: overrideRendered?.text ?? null,
      html: overrideRendered?.html ?? defaultHtml,
      source: overrideRendered?.subject || overrideRendered?.html || overrideRendered?.text ? 'override' : 'default',
    }

    return {
      key,
      ...meta,
      vars,
      default: { subject: defaultSubject, html: defaultHtml },
      override: override ? { ...override, rendered: overrideRendered } : null,
      effective,
    }
  })

  app.put('/email/templates/:key', async (req, reply) => {
    const parsedKey = EmailTemplateKeySchema.safeParse((req.params as any)?.key)
    if (!parsedKey.success) return reply.status(400).send({ error: 'invalid_request' })

    const parsedBody = UpsertEmailTemplateSchema.safeParse(req.body)
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsedBody.error.issues })
    }

    const key = parsedKey.data as EmailTemplateKey
    const next = await upsertEmailTemplateOverride(key, parsedBody.data)
    return { override: next }
  })

  app.delete('/email/templates/:key', async (req, reply) => {
    const parsedKey = EmailTemplateKeySchema.safeParse((req.params as any)?.key)
    if (!parsedKey.success) return reply.status(400).send({ error: 'invalid_request' })

    const key = parsedKey.data as EmailTemplateKey
    await deleteEmailTemplateOverride(key)
    return { ok: true }
  })

  app.post('/email/templates/:key/test-send', async (req, reply) => {
    const parsedKey = EmailTemplateKeySchema.safeParse((req.params as any)?.key)
    if (!parsedKey.success) return reply.status(400).send({ error: 'invalid_request' })

    const BodySchema = z.object({ to: z.string().trim().email().optional() }).strict()
    const parsedBody = BodySchema.safeParse(req.body ?? {})
    if (!parsedBody.success) return reply.status(400).send({ error: 'invalid_request', issues: parsedBody.error.issues })

    const auth = (req as any).auth as { email: string }
    const to = parsedBody.data.to ?? auth.email
    const key = parsedKey.data as EmailTemplateKey
    const vars = sampleVars()
    const override = await getEmailTemplateOverride(key)

    const subject = override?.subject ? renderTemplate(override.subject, vars, 'subject') : defaultSubjectFor(key, vars.eventTitle)
    const text = override?.text ? renderTemplate(override.text, vars, 'text') : `Test email for template: ${key}`
    const html = override?.html ? renderTemplate(override.html, vars, 'html') : defaultHtmlFor(key, vars)

    await sendTextEmail({ to, subject: `[TEST] ${subject}`, text, html })
    return { ok: true, to, smtpConfigured: isEmailConfigured() }
  })

  app.get('/hubspot/status', async () => {
    const configured = Boolean(env.HUBSPOT_PRIVATE_APP_TOKEN)

    const mappings = {
      liveCustomer: {
        property: env.HUBSPOT_LIVE_CUSTOMER_PROPERTY ?? null,
        trueValues: env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES ?? null,
      },
      provisionType: {
        property: env.HUBSPOT_PROVISION_TYPE_PROPERTY ?? null,
      },
      productVersion: {
        property: env.HUBSPOT_PRODUCT_VERSION_PROPERTY ?? null,
      },
      companyEditJobTitleKeywords: env.HUBSPOT_COMPANY_EDIT_JOB_TITLE_KEYWORDS,
    }

    if (!configured) {
      return {
        configured: false,
        connected: false,
        mappings,
        message: 'HubSpot is not configured (missing HUBSPOT_PRIVATE_APP_TOKEN).',
      }
    }

    try {
      const me = await hubspotGetMe()
      return {
        configured: true,
        connected: true,
        me,
        mappings,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'HubSpot request failed'
      return {
        configured: true,
        connected: false,
        mappings,
        error: message,
      }
    }
  })

  app.get('/me', async (req) => {
    const auth = (req as any).auth as { email: string }
    return { admin: true, email: auth.email }
  })

  app.get('/settings', async () => {
    const settings = await getAdminSettings()
    return {
      settings,
      system: {
        smtpConfigured: isEmailConfigured(),
        emailJobsEnabled: env.EMAIL_JOBS_ENABLED,
      },
    }
  })

  app.patch('/settings', async (req, reply) => {
    const parsed = PatchSettingsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', issues: parsed.error.issues })
    }

    const next = await updateAdminSettings(parsed.data)
    return { settings: next }
  })
}
