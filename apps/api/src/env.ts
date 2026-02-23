import { config as loadDotEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// When running via npm workspaces, CWD is often apps/api. When running via other tooling, CWD may vary.
// Prefer the repo-root .env (one level above /apps), then allow a local CWD .env to override.
function findRepoRootEnvPathFromCwd(): string | null {
  const cwd = process.cwd()
  const parts = cwd.split(path.sep)
  const appsIndex = parts.lastIndexOf('apps')

  if (appsIndex > 0) {
    const repoRoot = parts.slice(0, appsIndex).join(path.sep) || path.sep
    const candidate = path.join(repoRoot, '.env')
    if (fs.existsSync(candidate)) return candidate
  }

  // Fallback: look for a .env in CWD.
  const cwdEnv = path.join(cwd, '.env')
  if (fs.existsSync(cwdEnv)) return cwdEnv
  return null
}

const repoRootEnvPath = findRepoRootEnvPathFromCwd()
const originalEnvKeys = new Set(Object.keys(process.env))

if (repoRootEnvPath) {
  loadDotEnv({ path: repoRootEnvPath })
}

// Allow local overrides (e.g., apps/api/.env), but never override variables that were already set
// on the real process environment (command line, CI, hosting platform).
const cwdEnvPath = path.join(process.cwd(), '.env')
if (fs.existsSync(cwdEnvPath)) {
  const result = loadDotEnv({ path: cwdEnvPath })
  const parsed = result.parsed ?? {}
  for (const [key, value] of Object.entries(parsed)) {
    if (originalEnvKeys.has(key)) continue
    if (typeof value === 'string' && value.trim() === '' && process.env[key]) continue
    process.env[key] = value
  }
}

function emptyStringToUndefined(value: unknown) {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

function optionalString() {
  return z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
}

function optionalPositiveInt() {
  return z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive().optional())
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Auth
  // In production you MUST set a strong secret.
  AUTH_JWT_SECRET: z.string().trim().min(16).default('dev-insecure-change-me-please'),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(24 * 7),
  AUTH_CODE_TTL_MINS: z.coerce.number().int().positive().default(10),

  // Portal URL used for payment redirect URLs (dev default)
  PORTAL_BASE_URL: z.string().trim().min(1).default('http://localhost:5173'),

  // Database (MongoDB). If not set, API returns empty data.
  MONGODB_URI: z.string().trim().min(1).optional(),
  MONGODB_DB: z.string().trim().min(1).default('mentor_cp'),

  // Must remain configurable (brief requirement)
  EVENT_REMINDER_LEAD_TIME_HOURS: z.coerce.number().int().nonnegative().default(48),
  EVENT_THANK_YOU_DELAY_HOURS: z.coerce.number().int().nonnegative().default(24),

  // Integrations
  HUBSPOT_PRIVATE_APP_TOKEN: z.string().optional(),
  // HubSpot event registration reporting via Deals (works without Custom Objects).
  // Create a dedicated deal pipeline (recommended) and stages for registration statuses.
  HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_ID: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_LABEL: optionalString(),
  // Stage labels (or ids) used to map our registration status -> HubSpot dealstage.
  HUBSPOT_EVENT_REGISTRATION_STAGE_REGISTERED: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_STAGE_PAYMENT_PENDING: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_STAGE_PAID: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_STAGE_CANCELLED: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_STAGE_FAILED: optionalString(),
  // Property on the Deal used for idempotency (must exist on deals).
  HUBSPOT_EVENT_REGISTRATION_DEAL_UNIQUE_PROPERTY: optionalString(),
  // HubSpot Custom Object for registration reporting (Option B)
  HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE: optionalString(),
  HUBSPOT_EVENT_REGISTRATION_OBJECT_UNIQUE_PROPERTY: optionalString(),
  // HubSpot mapping (brief requirement: check for "live customer" status)
  // Example:
  //  HUBSPOT_LIVE_CUSTOMER_PROPERTY=mentor_customer_status
  //  HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES=live,active,true
  HUBSPOT_LIVE_CUSTOMER_PROPERTY: optionalString(),
  HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES: optionalString(),
  // HubSpot mapping (brief requirement: provision type gating)
  // Example:
  //  HUBSPOT_PROVISION_TYPE_PROPERTY=provision_type
  HUBSPOT_PROVISION_TYPE_PROPERTY: optionalString(),

  // HubSpot HTTP timeout (ms) to keep login fast when HubSpot is slow.
  HUBSPOT_TIMEOUT_MS: z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive()).default(1_200),

  // HubSpot mapping: product version gating (e.g. v2 vs v3)
  // Example:
  //  HUBSPOT_PRODUCT_VERSION_PROPERTY=mentor_product_version
  HUBSPOT_PRODUCT_VERSION_PROPERTY: optionalString(),

  // HubSpot content sources (Knowledge Base + Videos)
  HUBSPOT_KB_LANGUAGE: optionalString(),
  HUBSPOT_KB_PUBLIC_SITEMAP_URL: optionalString(),
  HUBSPOT_VIDEOS_HUBDB_TABLE_ID: optionalString(),
  HUBSPOT_DOCUMENT_KEYWORDS: optionalString(),

  // HubSpot OAuth (for Knowledge Base API access)
  HUBSPOT_OAUTH_CLIENT_ID: optionalString(),
  HUBSPOT_OAUTH_CLIENT_SECRET: optionalString(),
  HUBSPOT_OAUTH_REDIRECT_URI: optionalString(),

  // Company edit permissions derived from HubSpot contact job titles.
  // Comma-separated keywords; if contact.jobtitle contains any (case-insensitive), they can edit company details.
  HUBSPOT_COMPANY_EDIT_JOB_TITLE_KEYWORDS: z
    .string()
    .trim()
    .min(1)
    .default('director,head,chief,ceo,cfo,coo,cto,owner,founder,partner,principal,managing,vice president,vp'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: optionalString(),
  STRIPE_CHECKOUT_UI_MODE: z.preprocess(emptyStringToUndefined, z.enum(['hosted', 'embedded']).optional()).default('hosted'),
  STRIPE_CHECKOUT_SUCCESS_URL: optionalString(),
  STRIPE_CHECKOUT_CANCEL_URL: optionalString(),
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),

  // Email (optional). If not configured, auth codes are logged (dev only) and returned in the response (dev only).
  SMTP_HOST: optionalString(),
  SMTP_PORT: optionalPositiveInt(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  SMTP_USER: optionalString(),
  SMTP_PASS: optionalString(),
  SMTP_FROM: optionalString(),
  
  // Admin + background jobs
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
  EMAIL_JOBS_ENABLED: z.coerce.boolean().default(true),
  EMAIL_JOBS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  EMAIL_JOBS_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  EMAIL_JOBS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Admin auth
  ADMIN_SEED_EMAIL: optionalString(),
  ADMIN_SEED_PASSWORD: optionalString(),
  ADMIN_SEED_ROLES: optionalString(),
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)

// Warn loudly in production if the JWT secret is the default placeholder.
if (env.NODE_ENV === 'production' && env.AUTH_JWT_SECRET === 'dev-insecure-change-me-please') {
  console.error(
    '\n⚠️  WARNING: AUTH_JWT_SECRET is using the default dev placeholder.\n' +
    '   Set AUTH_JWT_SECRET to a strong random value in your environment variables.\n',
  )
}
