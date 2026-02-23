import { z } from 'zod'
import { getDb } from '../db'
import { env } from '../env'

export type AdminSettings = {
  general: {
    portalName: string
    brandPrimaryColor: string
    supportEmail: string
    supportUrl: string
    statusPageUrl: string
  }
  eventEmails: {
    enabled: boolean
    confirmationEnabled: boolean
    reminderEnabled: boolean
    reminderLeadTimeHours: number
    thankYouEnabled: boolean
    thankYouDelayHours: number
  }
  features: {
    invoicesEnabled: boolean
    ticketsEnabled: boolean
    knowledgeBaseEnabled: boolean
    documentsEnabled: boolean
    videosEnabled: boolean
    meetingsEnabled: boolean
    paymentsEnabled: boolean
    eventRegistrationsEnabled: boolean
  }
  communications: {
    emailFromName: string
    emailFromAddress: string
    replyToAddress: string
    supportCc: string
    supportBcc: string
  }
  events: {
    defaultDurationMins: number
    defaultTimezone: string
    defaultPlatform: string
    defaultJoinLinkLabel: string
    defaultCurrency: string
  }
  auth: {
    allowPasswordless: boolean
    passwordMinLength: number
    allowOAuthGoogle: boolean
    allowOAuthMicrosoft: boolean
    allowNonCustomerRegistration: boolean
  }
  integrations: {
    hubspotLiveCustomerProperty: string
    hubspotLiveCustomerTrueValues: string
    hubspotProvisionTypeProperty: string
    hubspotProductVersionProperty: string
    stripeSuccessUrl: string
    stripeCancelUrl: string
    quickbooksRealm: string
    storageProvider: 's3' | 'azure' | 'local'
  }
  contentGating: {
    knowledgeBaseDefaultProvision: 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'
    documentsDefaultProvision: 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'
    videosDefaultProvision: 'all' | 'supported-accommodation' | 'childrens-home' | 'over-18'
    knowledgeBaseAuthorName: string
    knowledgeBaseAuthorTeam: string
  }
  system: {
    maintenanceModeEnabled: boolean
    maintenanceMessage: string
    demoDataEnabled: boolean
    rateLimitPerMinute: number
  }
}

export type AdminSettingsPatch = {
  eventEmails?: Partial<AdminSettings['eventEmails']>
  general?: Partial<AdminSettings['general']>
  features?: Partial<AdminSettings['features']>
  communications?: Partial<AdminSettings['communications']>
  events?: Partial<AdminSettings['events']>
  auth?: Partial<AdminSettings['auth']>
  integrations?: Partial<AdminSettings['integrations']>
  contentGating?: Partial<AdminSettings['contentGating']>
  system?: Partial<AdminSettings['system']>
}

export const AdminSettingsSchema = z.object({
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
      knowledgeBaseAuthorName: z.string().trim().max(100).optional(),
      knowledgeBaseAuthorTeam: z.string().trim().max(100).optional(),
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

type SettingsDoc = AdminSettings & { _id: string }

const COLLECTION = 'settings'
const SETTINGS_ID = 'admin_settings'

let inMemorySettings: AdminSettings | null = null

function defaults(): AdminSettings {
  return {
    general: {
      portalName: 'Mentor Portal',
      brandPrimaryColor: '#14192d',
      supportEmail: '',
      supportUrl: 'https://mentor.co.uk/support',
      statusPageUrl: '',
    },
    eventEmails: {
      enabled: true,
      confirmationEnabled: true,
      reminderEnabled: true,
      reminderLeadTimeHours: env.EVENT_REMINDER_LEAD_TIME_HOURS,
      thankYouEnabled: true,
      thankYouDelayHours: env.EVENT_THANK_YOU_DELAY_HOURS,
    },
    features: {
      invoicesEnabled: true,
      ticketsEnabled: true,
      knowledgeBaseEnabled: true,
      documentsEnabled: true,
      videosEnabled: true,
      meetingsEnabled: true,
      paymentsEnabled: true,
      eventRegistrationsEnabled: true,
    },
    communications: {
      emailFromName: 'Mentor',
      emailFromAddress: env.SMTP_FROM ?? '',
      replyToAddress: env.SMTP_FROM ?? '',
      supportCc: '',
      supportBcc: '',
    },
    events: {
      defaultDurationMins: 60,
      defaultTimezone: 'Europe/London',
      defaultPlatform: 'Teams',
      defaultJoinLinkLabel: 'Join meeting',
      defaultCurrency: 'GBP',
    },
    auth: {
      allowPasswordless: true,
      passwordMinLength: 8,
      allowOAuthGoogle: false,
      allowOAuthMicrosoft: false,
      allowNonCustomerRegistration: true,
    },
    integrations: {
      hubspotLiveCustomerProperty: env.HUBSPOT_LIVE_CUSTOMER_PROPERTY ?? '',
      hubspotLiveCustomerTrueValues: env.HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES ?? '',
      hubspotProvisionTypeProperty: env.HUBSPOT_PROVISION_TYPE_PROPERTY ?? '',
      hubspotProductVersionProperty: env.HUBSPOT_PRODUCT_VERSION_PROPERTY ?? '',
      stripeSuccessUrl: env.STRIPE_CHECKOUT_SUCCESS_URL ?? '',
      stripeCancelUrl: env.STRIPE_CHECKOUT_CANCEL_URL ?? '',
      quickbooksRealm: '',
      storageProvider: 's3',
    },
    contentGating: {
      knowledgeBaseDefaultProvision: 'all',
      documentsDefaultProvision: 'all',
      videosDefaultProvision: 'all',
      knowledgeBaseAuthorName: 'Shaun Ward',
      knowledgeBaseAuthorTeam: 'Training Team',
    },
    system: {
      maintenanceModeEnabled: false,
      maintenanceMessage: '',
      demoDataEnabled: true,
      rateLimitPerMinute: 100,
    },
  }
}

function mergeSettings(base: AdminSettings, patch: AdminSettingsPatch): AdminSettings {
  return {
    general: {
      ...base.general,
      ...(patch.general ?? {}),
    },
    eventEmails: {
      ...base.eventEmails,
      ...(patch.eventEmails ?? {}),
    },
    features: {
      ...base.features,
      ...(patch.features ?? {}),
    },
    communications: {
      ...base.communications,
      ...(patch.communications ?? {}),
    },
    events: {
      ...base.events,
      ...(patch.events ?? {}),
    },
    auth: {
      ...base.auth,
      ...(patch.auth ?? {}),
    },
    integrations: {
      ...base.integrations,
      ...(patch.integrations ?? {}),
    },
    contentGating: {
      ...base.contentGating,
      ...(patch.contentGating ?? {}),
    },
    system: {
      ...base.system,
      ...(patch.system ?? {}),
    },
  }
}

export type FeatureFlags = AdminSettings['features']

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const settings = await getAdminSettings()
  return settings.features
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const db = await getDb()
  const d = defaults()

  if (!db) {
    inMemorySettings = inMemorySettings ? mergeSettings(d, inMemorySettings) : d
    return inMemorySettings
  }

  const col = db.collection<SettingsDoc>(COLLECTION)
  const doc = await col.findOne({ _id: SETTINGS_ID }, { projection: { _id: 0 } })
  if (!doc) return d

  return mergeSettings(d, doc)
}

export async function updateAdminSettings(patch: AdminSettingsPatch): Promise<AdminSettings> {
  const db = await getDb()
  const current = await getAdminSettings()
  const next = mergeSettings(current, patch)

  if (!db) {
    inMemorySettings = next
    return next
  }

  const col = db.collection<SettingsDoc>(COLLECTION)
  await col.updateOne({ _id: SETTINGS_ID }, { $set: { ...next } }, { upsert: true })
  return next
}
