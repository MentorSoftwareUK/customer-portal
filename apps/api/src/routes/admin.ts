import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth/requireAdmin'
import { getAdminSettings, updateAdminSettings } from '../store/settings'
import { env } from '../env'
import { hubspotGetMe } from '../integrations/hubspot'

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

function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM)
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
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
        smtpConfigured: isSmtpConfigured(),
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
