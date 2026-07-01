# CLAUDE.md — Mentor Customer Portal

Authoritative reference for AI agents working in this codebase. Read this before touching any file.

---

## What this project is

A private SaaS customer portal for **Mentor Software UK**, a UK care-sector software company serving children's residential care providers — children's homes, supported accommodation, and over-18 provisions. It serves two audiences:

1. **Customers** — live Mentor subscribers who log in to access events, tickets, meetings, documents, knowledge base, videos, and invoices. Access is gated by HubSpot contact data.
2. **Admins (Mentor staff)** — internal team who manage events, users, notifications, settings, and view CRM/sales analytics dashboards that pull live data from HubSpot.

The portal is _not_ a public site. All `/app/*` routes require authentication.

---

## Sector context

Mentor Software serves regulated professionals in the UK children's residential care sector. Users are Registered Managers, Responsible Individuals, Directors, Support Workers, and casual/temp staff. These are experienced practitioners working in a compliance-heavy environment governed by the Children's Homes Quality Standards, Supported Accommodation Regulations, and the Ofsted inspection framework.

Copy and UI text must be direct, specific, and professional. No marketing tone in interface text. Do not change visible portal copy or text unless explicitly asked.

---

## Repo structure

```
mentor-cp/
├── apps/
│   ├── api/          Node.js + Fastify API (TypeScript, runs on port 3001)
│   └── portal/       Vue 3 + Vite + Tailwind frontend (runs on port 5173)
├── packages/shared/  (reserved, currently empty)
├── scripts/          One-off HubSpot/Stripe utility scripts (Node ESM)
├── tmp/              Throwaway audit/debug scripts — not production code
├── docs/             Architecture notes and testing guides
├── .env              Root env file (loaded by API at startup; do NOT commit)
└── .env.example      Template for all env vars
```

npm workspaces: `apps/*` and `packages/*`. Run everything from repo root.

---

## Tech stack

### API (`apps/api`)
| Concern | Library |
|---|---|
| HTTP framework | Fastify 5 |
| Security headers | @fastify/helmet (registered at startup, before routes) |
| Validation | Zod 4 |
| Database | MongoDB 6 (via `mongodb` driver) — optional; gracefully absent |
| Auth | JWT via `jose`, OTP codes, bcrypt passwords |
| Email | nodemailer (SMTP) — Brevo SMTP configured |
| CRM | HubSpot Private App Token (REST) + OAuth for KB |
| Payments | Stripe |
| Runtime | Node ≥22.12, `tsx` for dev/prod |
| Tests | Vitest + supertest |

### Portal (`apps/portal`)
| Concern | Library |
|---|---|
| Framework | Vue 3 (Composition API + `<script setup>`) |
| Router | Vue Router 4 |
| UI components | Flowbite + Flowbite-Vue |
| Styling | Tailwind CSS 4 + custom design tokens |
| Build | Vite 7 |
| Type checking | `vue-tsc` |
| Tests | Vitest + `@vue/test-utils` |

---

## Running locally

```bash
npm install           # from repo root
npm run dev           # starts both api (3001) and portal (5173) concurrently
npm run dev:api       # API only
npm run dev:portal    # Portal only
npm run typecheck     # both workspaces
npm run test          # API tests only (portal test coverage minimal)
```

---

## Environment variables

All env vars live in the root `.env` file. The API loads it automatically at startup (walking up from `apps/api` to find the repo root `.env`). A local `apps/api/.env` can override values without affecting shared config.

**Never commit `.env`.**

### Core

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Controls logging and dev guards |
| `PORT` | No | `3001` | API listen port |
| `PORTAL_BASE_URL` | Prod | `http://localhost:5173` | Used for CORS, redirect URLs, email asset URLs |

### Auth

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AUTH_JWT_SECRET` | **Prod: yes** | dev placeholder | Signs all JWTs. Must be 16+ chars. Warn emitted in prod if default. |
| `AUTH_TOKEN_TTL_HOURS` | No | `168` (7 days) | JWT expiry |
| `AUTH_CODE_TTL_MINS` | No | `10` | OTP expiry |

### Database

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | No | — | MongoDB Atlas connection string. If absent, all store ops return empty/null gracefully. |
| `MONGODB_DB` | No | `mentor_cp` | Database name |

Note: `tls: true` is hardcoded in `db.ts` — this means `MONGODB_URI` must be an Atlas URI. Local MongoDB URIs will fail unless a cert is configured. Known limitation, flagged for fix.

### Email (Brevo SMTP — currently configured)

| Variable | Required | Purpose |
|---|---|---|
| `SMTP_HOST` | For real email | `smtp-relay.brevo.com` |
| `SMTP_PORT` | For real email | `587` |
| `SMTP_SECURE` | No | `false` |
| `SMTP_USER` | For real email | Brevo login email |
| `SMTP_PASS` | For real email | Brevo SMTP key (starts `xkeysib-`) |
| `SMTP_FROM` | For real email | From address (e.g. `marketing@mentorsoftware.co.uk`) |
| `SENDGRID_API_KEY` | Unused | Legacy; not set. If set, takes priority over SMTP. |

`devCode` (OTP in response body) is only returned when **both** conditions are true: `NODE_ENV === 'development'` AND SMTP is not configured. Never returned in staging, preview, CI, or production.

Email job types: `event_invite`, `event_confirmation`, `event_reminder`, `event_thank_you`.

### HubSpot

| Variable | Purpose |
|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` | Required for all HubSpot data (contacts, tickets, meetings, deals) |
| `HUBSPOT_LIVE_CUSTOMER_PROPERTY` | HubSpot contact property name that indicates live customer status |
| `HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES` | Comma-separated values of that property that mean "is a customer" |
| `HUBSPOT_PROVISION_TYPE_PROPERTY` | Contact property for provision type (`supported-accommodation` / `childrens-home` / `over-18`) |
| `HUBSPOT_PRODUCT_VERSION_PROPERTY` | Contact property for product version (`v2` / `v3`) |
| `HUBSPOT_TIMEOUT_MS` | Default `5000`. HubSpot API timeout per request. |
| `HUBSPOT_KB_LANGUAGE` | Language tag for KB articles |
| `HUBSPOT_KB_PUBLIC_SITEMAP_URL` | Sitemap URL for KB scraping (fallback when OAuth unavailable) |
| `HUBSPOT_VIDEOS_HUBDB_TABLE_ID` | HubDB table ID for video library |
| `HUBSPOT_DOCUMENT_KEYWORDS` | Comma-separated keywords for document search |
| `HUBSPOT_OAUTH_CLIENT_ID` | OAuth app client ID (for KB API) |
| `HUBSPOT_OAUTH_CLIENT_SECRET` | OAuth app client secret |
| `HUBSPOT_OAUTH_REDIRECT_URI` | Redirect URI registered on OAuth app |
| `HUBSPOT_COMPANY_EDIT_JOB_TITLE_KEYWORDS` | Comma-separated keywords; contact job title must contain one to edit company |
| `HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_ID` or `_LABEL` | Deal pipeline for event registration reporting |
| `HUBSPOT_EVENT_REGISTRATION_STAGE_REGISTERED` etc. | Stage labels/IDs for each registration status |
| `HUBSPOT_EVENT_REGISTRATION_DEAL_UNIQUE_PROPERTY` | Deal property used for idempotent upserts (default: `mentor_registration_id`) |
| `HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE` | Custom Object type ID (Option B for registration reporting) |
| `HUBSPOT_EVENT_REGISTRATION_OBJECT_UNIQUE_PROPERTY` | Custom Object unique property |

### Stripe

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Required for paid registrations. Use test key locally. |
| `STRIPE_WEBHOOK_SECRET` | Required to validate incoming Stripe webhooks (`whsec_...`) |
| `STRIPE_CHECKOUT_UI_MODE` | `hosted` (default) or `embedded` |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Override checkout success redirect (derived from `PORTAL_BASE_URL` otherwise) |
| `STRIPE_CHECKOUT_CANCEL_URL` | Override checkout cancel redirect |

### QuickBooks (stub — not implemented)

| Variable | Purpose |
|---|---|
| `QUICKBOOKS_CLIENT_ID` | Not in use. Invoice route returns empty array. |
| `QUICKBOOKS_CLIENT_SECRET` | Not in use. |

### Admin / Background jobs

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_EMAIL_ALLOWLIST` | — | Comma-separated emails that can access `/admin/settings` endpoints. See security note below. |
| `ADMIN_SEED_EMAIL` | — | Email for auto-created seed admin on startup |
| `ADMIN_SEED_PASSWORD` | — | Password for seed admin |
| `ADMIN_SEED_ROLES` | — | Roles for seed admin (e.g. `admin`) |
| `EMAIL_JOBS_ENABLED` | `true` | Enable background email job worker |
| `EMAIL_JOBS_POLL_INTERVAL_MS` | `5000` | How often the worker polls for due jobs |
| `EMAIL_JOBS_BATCH_SIZE` | `10` | Jobs claimed per poll cycle |
| `EMAIL_JOBS_MAX_ATTEMPTS` | `5` | Max send retries before marking failed |
| `EVENT_REMINDER_LEAD_TIME_HOURS` | `48` | How far before an event to send reminder |
| `EVENT_THANK_YOU_DELAY_HOURS` | `24` | How long after event end to send thank-you |
| `TICKETS_CACHE_TTL_MS` | `180000` (3 min) | Per-email in-memory cache TTL for ticket data |
| `COMPANIES_HOUSE_API_KEY` | — | Used by admin provider scraper tool |

**Security note — ADMIN_EMAIL_ALLOWLIST**: Emails on this list gain full admin access via the standard customer OTP flow (no password required). This is a known security gap — policy decision pending on whether to require admin credential flow instead. Do not add emails to this list without explicit instruction.

### Portal (`apps/portal`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | API base URL for the frontend |

---

## API routes — complete list

All routes are registered in `apps/api/src/server.ts`. Rate limit: 100 req/min global.

### Public / Auth

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/health/db` | MongoDB connectivity check |
| POST | `/auth/lookup` | Look up email in HubSpot, return customer status |
| POST | `/auth/start` | Generate and send OTP code |
| POST | `/auth/verify` | Verify OTP, return JWT |
| POST | `/auth/login` | Password login (live customers only) |
| POST | `/auth/onboard` | Create/update HubSpot contact on first login |
| POST | `/auth/set-password` | Set password for authenticated user |
| GET | `/auth/me` | Return current user info from JWT |

### Admin auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin-auth/login` | Admin email/password login, returns JWT with `isAdmin: true` |
| GET | `/admin-auth/me` | Return current admin identity |

### Admin — settings & config

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/settings` | Get all admin settings |
| PATCH | `/admin/settings` | Update admin settings (any subset of sections) |
| GET | `/admin/hubspot/status` | HubSpot connectivity + mapping config |
| GET | `/admin/email/status` | Email provider connectivity status |
| POST | `/admin/email/test` | Send a test email |
| GET | `/admin/email/templates` | List email template keys with metadata |
| GET | `/admin/email/templates/:key` | Get template (override or built-in) |
| PUT | `/admin/email/templates/:key` | Upsert email template override |
| DELETE | `/admin/email/templates/:key` | Delete template override (revert to built-in) |
| POST | `/admin/email/preview/:key` | Render template with sample data |
| POST | `/admin/email/send-invite` | Send bulk invite emails for an event from a HubSpot list |

### Admin — users

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users` | List portal users (search, status filter, pagination) |
| POST | `/admin/users` | Create user |
| PATCH | `/admin/users/:id` | Update user (status, access, HubSpot link) |
| POST | `/admin/users/:id/detach` | Detach user from HubSpot (keeps account) |
| POST | `/admin/users/:id/offboard` | Offboard user |

### Admin — events

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/events` | List all events |
| POST | `/admin/events` | Create event |
| GET | `/admin/events/:id` | Get event detail |
| PATCH | `/admin/events/:id` | Update event |
| POST | `/admin/events/:id/cancel` | Cancel event |
| GET | `/admin/events/:id/registrations` | List registrations for event |
| POST | `/admin/events/:id/invite` | Queue invite emails to a HubSpot list |

### Admin — registrations

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/admin/registrations/:id` | Update attendance status (`attended` / `no_show`) |

### Admin — reports & analytics

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/reports/events` | Per-event registration/attendance report |
| GET | `/admin/analytics/users` | User activity metrics (optional `?days=N`) |
| GET | `/admin/analytics/kb` | Knowledge base view metrics |
| GET | `/admin/analytics/tickets` | Ticket metrics |
| GET | `/admin/dashboard-stats` | Live company/user counts from HubSpot (15-min cache) |
| GET | `/admin/sales-funnel` | Marketing funnel data (HubSpot forms + pipeline stages) |
| GET | `/admin/sales-stats` | Deals, MRR, win rate, agent breakdown |
| GET | `/admin/customer-success` | Churn, retention, at-risk customers |
| GET | `/admin/ticket-stats` | Ticket volume, response times (5-min cache) |

### Admin — notifications

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/notifications` | List all notifications (including disabled) |
| POST | `/admin/notifications` | Create notification |
| PATCH | `/admin/notifications/:id` | Update notification |
| DELETE | `/admin/notifications/:id` | Delete notification |

### Admin — tools

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/hubspot-audit` | Scan all HubSpot contacts for form-corruption (name/email overwrite) |
| GET | `/admin/ops` | Ops health dashboard (tasks, handoff, department health) |
| GET | `/admin/provider-scraper/providers` | List scraped care providers |
| POST | `/admin/provider-scraper/scrape` | Trigger Companies House + Google scrape |
| GET | `/admin/old-crm` | Load and cross-reference old CSV CRM data against HubSpot — local only, dead in production |

### Admin — HubSpot OAuth (KB)

| Method | Path | Purpose |
|---|---|---|
| GET | `/hubspot/oauth/authorize` | Start OAuth flow — requires `requireAdmin` |
| GET | `/hubspot/oauth/callback` | Handle OAuth callback, store tokens |
| GET | `/hubspot/oauth/status` | Check OAuth connection status |
| POST | `/hubspot/oauth/disconnect` | Remove stored OAuth tokens |

### Customer-facing routes (require auth JWT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/events` | List events visible to the current user (gated by eligibility + provision) |
| GET | `/events/:id` | Get event detail |
| POST | `/events/:id/register` | Register for an event (may trigger Stripe checkout) |
| POST | `/events/:id/cancel-registration` | Cancel own registration |
| GET | `/stripe/checkout/confirm` | Confirm Stripe checkout session after redirect |
| POST | `/stripe/webhook` | Stripe webhook receiver (signature verified) |
| GET | `/invoices` | List invoices (returns empty — QuickBooks not implemented) |
| GET | `/tickets` | List tickets for authenticated user's contact |
| GET | `/tickets/org` | List tickets for the user's organisation |
| GET | `/tickets/:id` | Ticket detail with message thread |
| POST | `/tickets` | Create new ticket |
| POST | `/tickets/:id/reply` | Add reply note to ticket |
| GET | `/meetings` | List HubSpot meetings for authenticated contact |
| GET | `/knowledge-base` | List KB articles (gated by provision + product version) |
| GET | `/knowledge-base/article` | Fetch and scrape article HTML by URL |
| GET | `/videos` | List videos from HubDB table (gated by provision + product version) |
| GET | `/documents` | List documents from HubSpot File Manager |
| GET | `/notifications` | List active global portal notifications |
| GET | `/profile` | Get profile (personal + company from HubSpot) |
| PATCH | `/profile/personal` | Update personal HubSpot contact properties |
| PATCH | `/profile/company` | Update company HubSpot properties (if `canEditCompany`) |
| GET | `/features` | Return feature flag object |
| POST | `/activity/session/start` | Start a portal session |
| POST | `/activity/session/end` | End a session |
| POST | `/activity/page-view` | Track a page view |
| POST | `/activity/kb-view` | Track a KB article view |

---

## Auth model

### Customer login flow
1. `POST /auth/lookup` — finds HubSpot contact by email, determines `isLiveCustomer`, `provisionType`, `productVersion`; enrichment is cached 60 s
2. `POST /auth/start` — sends OTP via SMTP email; returns `devCode` only in local development with no SMTP configured
3. `POST /auth/verify` — validates OTP, issues JWT

### JWT payload
```typescript
{
  email: string
  viewerType: 'customer' | 'non-customer'
  hubspotContactId: string | null
  isLiveCustomer: boolean | null
  provisionType: 'supported-accommodation' | 'childrens-home' | 'over-18' | null
  productVersion: 'v2' | 'v3' | null
  jobTitle: string | null
  buyingRole: string | null
  canEditCompany: boolean
  isAdmin: boolean
  adminRoles: string[] | null
}
```

### Admin login
Separate credential flow via `POST /admin-auth/login`. Admin users are stored in MongoDB (`admin_users` collection). A seed admin is created on startup if `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` are set.

### Token storage (frontend)
- User token: `localStorage.accessToken`
- Admin token: `localStorage.adminAccessToken`
- `apiFetch()` in `lib/api.ts` automatically picks the right token based on endpoint prefix (`/admin` → admin token, else user token with admin fallback)

---

## Feature flags

Feature flags are stored in MongoDB `admin_settings` collection and managed via `GET/PATCH /admin/settings`. The `/features` endpoint exposes them to the frontend. All feature-gated routes check flags in a `preHandler` hook and return `404` if disabled.

Flags:
- `invoicesEnabled`
- `ticketsEnabled`
- `knowledgeBaseEnabled`
- `documentsEnabled`
- `videosEnabled`
- `meetingsEnabled`
- `paymentsEnabled`
- `eventRegistrationsEnabled`
- `globalNotificationsEnabled`

---

## Content gating

Content is filtered at the API level — not the frontend — based on the user's JWT claims:

- **`provisionType`** — `supported-accommodation` | `childrens-home` | `over-18` | `all` — determined from HubSpot contact property `HUBSPOT_PROVISION_TYPE_PROPERTY`
- **`productVersion`** — `v2` | `v3` — determined from `HUBSPOT_PRODUCT_VERSION_PROPERTY`

Events also gate by **`eligibility`** (`customer` / `non-customer` / `both`).

The normalization logic is forgiving (string matching, not exact values) — e.g. "FileMaker" maps to `v2`, "web" maps to `v3`.

---

## HubSpot integration

All calls go through `apps/api/src/integrations/hubspot.ts` via `hubspotFetch()`.

- **Private App Token** is used for all standard endpoints (contacts, companies, tickets, meetings, deals, pipelines, HubDB)
- **OAuth tokens** are used only for the CMS Knowledge Base API — stored in MongoDB `hubspot_oauth_tokens` collection, auto-refreshed with 5-min buffer
- **Rate limiting**: 429 responses are retried with exponential backoff (max 3 retries)
- **Timeout**: `HUBSPOT_TIMEOUT_MS` (default 5 s) per request
- HubSpot API base: `https://api.hubapi.com` (EU endpoint used for OAuth: `https://app-eu1.hubspot.com/oauth`)

### What the API reads from HubSpot
- Contacts: lookup by email, get by ID, batch read, update, upsert
- Companies: get by ID, find by domain, update, associate to contact
- Deals: upsert registration deals (idempotent by `mentor_registration_id`)
- Tickets: list by contact, by company, get by ID, create, add note engagement
- Meetings: list by contact ID
- Pipelines: ticket pipelines (cached in-memory), deal pipelines
- Contact lists: for bulk event invite emails
- HubDB tables: for video library
- File Manager: for document library
- Knowledge Base: articles list + article fetch (OAuth-gated)

### What the API writes to HubSpot
- Contact properties on login/onboard/profile update
- Registration deal upserts on register/pay/cancel
- Custom Object registration records (if `HUBSPOT_EVENT_REGISTRATION_OBJECT_TYPE` set)
- Note engagements on ticket replies

### Do not write
- Never send `company` or `companyname` fields for existing HubSpot contacts (actively guarded in code)

---

## Stripe integration

- Payments are GBP only
- Supports both `hosted` and `embedded` checkout UI modes (`STRIPE_CHECKOUT_UI_MODE`)
- Registration flow: customer registers → if `priceForNonCustomers > 0` and user is non-customer → Stripe session created → user redirected → webhook `checkout.session.completed` → registration marked paid → HubSpot deal updated
- Webhook endpoint at `POST /stripe/webhook` verifies Stripe signature using raw request body
- Free registrations (customers, or free events) skip Stripe entirely

---

## Email system

Email is sent via SMTP (currently Brevo). DNS: DMARC record updated 11 Jun 2026 to include Brevo `rua` reporting. The sending logic in `integrations/email.ts`:

1. If `SENDGRID_API_KEY` is set → use SendGrid HTTP API (legacy, not currently configured)
2. Else if `SMTP_HOST + SMTP_PORT + SMTP_FROM` are set → use nodemailer SMTP
3. Else in local development only → log email content and return (no error thrown)
4. In production with no email config → throw error

### Email job worker
A background worker (`jobs/emailWorker.ts`) polls MongoDB `email_jobs` collection every `EMAIL_JOBS_POLL_INTERVAL_MS` ms. Jobs are created by `scheduleEventEmailsForRegistration()` when someone registers or an event is updated. The worker sends in batches and marks jobs `sent` or `failed` with retry count.

### Email templates
Built-in HTML templates in `integrations/emailTemplates.ts`: invite, confirmation, reminder, thank-you. All use an inline-CSS white card on `#f0f2f7` background with Mentor brand colours (pink `#e7007e`, navy `#14192d`). Templates can be overridden per-key via the admin UI (stored in MongoDB `email_template_overrides`). Override fields: `subject`, `html`, `text`. Template variables use `{{handlebars}}` syntax rendered via `email/renderTemplate.ts`.

---

## Database (MongoDB)

Optional — the app degrades gracefully when `MONGODB_URI` is not set. Collections:

| Collection | Purpose |
|---|---|
| `portal_users` | Portal user accounts (email, HubSpot link, status, access) |
| `admin_users` | Admin accounts (hashed passwords, roles) |
| `events` | Event documents |
| `registrations` | Event registration records |
| `auth_codes` | OTP codes (TTL index on `expiresAt`) |
| `email_jobs` | Background email job queue |
| `email_template_overrides` | Per-key email template overrides |
| `notifications` | Global portal banners |
| `admin_settings` | Single-document settings (feature flags, email config, etc.) |
| `audit_log` | Admin action audit trail |
| `activity_sessions` | Portal session tracking |
| `activity_page_views` | Page view events |
| `activity_kb_views` | Knowledge base view events |
| `scraped_providers` | Companies House / Google scraped care provider data |
| `dashboard_stats_cache` | Cached HubSpot live company stats (15-min TTL) |
| `hubspot_oauth_tokens` | HubSpot OAuth access/refresh tokens for KB API |
| `sales_funnel_cache` | Cached sales funnel data |

Indexes are created on startup via `ensureIndexes()`.

---

## Frontend — portal (`apps/portal`)

### Routing
Two layout shells:
- `/app/*` → `AppShell.vue` — customer-facing portal with sidebar nav + topbar
- `/admin/*` → `AdminShell.vue` — admin dashboard with sidebar nav
- `/login` and `/admin/login` — standalone login pages (no shell)

All lazy-loaded via `() => import(...)`.

### Design tokens (Tailwind)
Defined in `apps/portal/tailwind.config.js`:

```js
primary: {
  500: '#ff1f9e', 600: '#e7007e', 700: '#bf006a', ...  // pink scale
}
brand: {
  primary: '#14192d',   // dark navy — used for sidebar + page backgrounds
  accent: '#e7007e',    // pink — buttons, links, highlights
  secondary: '#3A4051', // medium slate — secondary surfaces
  button: '#3A4051',    // button backgrounds
}
```

Font: **Poppins** (loaded from Google Fonts). Do not introduce a second typeface.

CSS utility classes defined in `style.css`:
- `.rounded-base` → `rounded-lg`
- `.text-body` → `text-white/80`
- `.text-heading` → `text-white`
- `.text-fg-brand` → `text-brand-accent`
- Body default: `background-color: #14192d`, `color: #ffffff` (dark navy)

Dark mode: toggled via `class` on `<html>` (stored in `localStorage` as `mentor-theme`). **Not system/OS dark mode.**

### UI conventions
- Use `rounded` not `rounded-lg` on interactive elements
- No left-border active states on nav items
- No hover lift / translateY effects on stat cards
- Sidebar and page backgrounds use `brand.primary` (#14192d) — do not lighten
- Do not introduce new Tailwind utility patterns without checking existing component usage first

### Component conventions

- All components use `<script setup lang="ts">` (Composition API)
- No Options API
- Props typed inline with TypeScript
- Async data loaded in `onMounted()`
- Loading states managed with `ref<boolean>`
- Error/warning states managed with `ref<string | null>`
- Feature-gated sections check `featureFlags.value.xEnabled` before rendering

### Key shared components

| Component | Purpose |
|---|---|
| `ui/AppShell.vue` | Customer portal layout with sidebar, topbar, global notifications, onboarding check, session tracking |
| `ui/AdminShell.vue` | Admin layout with Quick Find modal (Cmd+K) |
| `ui/ToastContainer.vue` | Toast notification display (uses `lib/toast.ts`) |
| `components/QuickFindModal.vue` | Cmd+K search across admin pages |
| `components/LoginLoadingSequence.vue` | Animated loading screen after OTP verify |
| `components/PipelineStageTracker.vue` | Visual pipeline stage indicator |
| `components/HubSpotContactForm.vue` | Embedded HubSpot form |
| `components/DonutChart.vue` | SVG donut chart |
| `components/LineChart.vue` | SVG line chart |
| `components/SparkLine.vue` | Inline sparkline |
| `components/PageHeader.vue` | Standard page header |
| `components/EventTypeChip.vue` | Event type badge |
| `components/StripeEmbeddedCheckout.vue` | Embedded Stripe checkout (for `embedded` UI mode) |

### lib utilities

| File | Purpose |
|---|---|
| `lib/api.ts` | All API calls; `apiFetch()` handles auth headers automatically |
| `lib/auth.ts` | Token read/write from `localStorage`, JWT decode |
| `lib/featureFlags.ts` | Singleton `ref` for feature flags; loaded once then reused |
| `lib/toast.ts` | Toast notification composable |
| `lib/provision.ts` | Provision filter read/write from `localStorage` |
| `lib/productVersion.ts` | Product version filter read/write |
| `lib/dashboard-helpers.ts` | Date parsing helpers for dashboard |
| `lib/useAdminTheme.ts` | Admin light/dark mode toggle |
| `lib/useDashboardMonth.ts` | Shared month selector state for admin dashboards |

### Login flow (frontend)
Multi-step state machine in `LoginPage.vue`:
```
'email' → (lookup) → 'onboard' | 'password' | 'code' | 'setPassword'
```
- `onboard`: new user, collect name/company
- `password`: existing live customer with password set
- `code`: OTP entry (30-second resend cooldown)
- `setPassword`: post-verify prompt to set a password for next time

---

## Deployment

- **Portal**: Vercel static SPA under the Mentor Software Vercel team (`mentor-software1`). Project name: `customer-portal-portal-gky9`. Root `vercel.json` rewrites all paths to `/index.html`. Security headers set: `X-Frame-Options: DENY`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **API**: Render web service. Production URL: `https://customer-portal-znxq.onrender.com`. Service ID: `srv-d60b2dkhg0os73a7f0lg`.
- **CORS**: API allows only `PORTAL_BASE_URL` origin (single origin).

### Vercel CLI (portal)

Default Vercel CLI login is a personal account. Prefix all commands with the Mentor Software token:

```bash
VERCEL_TOKEN=<mentor-software-vercel-token> vercel env ls
VERCEL_TOKEN=<mentor-software-vercel-token> vercel projects ls --scope mentor-software1
```

Token: 1Password / Vercel dashboard → Account Settings → Tokens (`liam@mentorsoftware.co.uk`).

### Render API (API service)

```bash
# List env vars
curl -s -H "Authorization: Bearer <render-api-key>" \
  "https://api.render.com/v1/services/srv-d60b2dkhg0os73a7f0lg/env-vars?limit=100"

# Update env vars (PUT replaces all vars atomically)
curl -s -X PUT \
  -H "Authorization: Bearer <render-api-key>" \
  -H "Content-Type: application/json" \
  -d '[{"key":"VAR","value":"val"},...]' \
  "https://api.render.com/v1/services/srv-d60b2dkhg0os73a7f0lg/env-vars"
```

Render API key: dashboard.render.com → Account Settings → API Keys (`liam@mentorsoftware.co.uk`).

---

## Security fixes — 11 Jun 2026

The following audit items are closed. Do not revert or reopen them.

| # | Fix |
|---|---|
| 1 & 15 | `@fastify/helmet` installed and registered at API startup — all responses now include security headers |
| 2 | `devCode` OTP gate tightened — only returned when `NODE_ENV === 'development'` AND SMTP not configured |
| 3 | HubSpot OAuth `/authorize` endpoint locked behind `requireAdmin` |
| 6 & 7 | HubSpot token prefix and per-request path `console.log` statements removed |
| 5 (UX) | KB article navigation replaced `window.location.reload()` with Vue Router watch + reactive reload |
| 4 (UX) | DOMPurify `ALLOW_DATA_ATTR: true` removed from KB article sanitiser |

---

## Incomplete / stubbed / TODO

| Area | Status |
|---|---|
| **Invoices** | `GET /invoices` always returns `[]`. QuickBooks OAuth flow exists in `integrations/quickbooks.ts` (credentials check only — no actual API calls implemented). |
| **HubSpot OAuth (KB)** | Token refresh and storage wired. Article fetching works if OAuth connected. Falls back to public sitemap scraping if OAuth not connected. |
| **Stripe embedded checkout** | `StripeEmbeddedCheckout.vue` component exists and `STRIPE_CHECKOUT_UI_MODE=embedded` is supported. Less tested than `hosted` mode. |
| **`allowOAuthGoogle` / `allowOAuthMicrosoft`** | Auth settings schema includes these fields but no OAuth identity provider is implemented. |
| **`DashboardPage-OLD.vue.backup`** | Dead file left in `pages/`. Not referenced anywhere. Delete when confirmed safe. |
| **`packages/shared/`** | Directory exists but is empty. |
| **`HelloWorld.vue`** | Scaffold leftover in `components/`. Not used. Delete when confirmed safe. |
| **Admin "Content" page** | `AdminContentPage.vue` exists. Verify completeness before relying on it. |
| **`adminOldCrm`** | Reads CSV files from `tmp/old crm/` — local only, dead in production. CSV files contain PII and must be removed from repo history, not just deleted. Pending. |
| **Provider scraper** | Uses Companies House API + cheerio scraping. Requires `COMPANIES_HOUSE_API_KEY`. Data stored in MongoDB. |
| **Email `allowNonCustomerRegistration`** | Present in auth settings schema but not enforced in auth flow code. |
| **ADMIN_EMAIL_ALLOWLIST admin access** | Allowlist currently grants full admin via OTP only — no password required. Policy decision pending. No code change made. |
| **OTP code hashing** | SHA-256 HMAC only — not a slow hash. Vulnerable to offline brute-force if `auth_codes` collection is compromised. Flagged for next security sprint. |
| **MongoDB SIGTERM shutdown** | MongoClient has no `onClose` hook. In-flight operations can be orphaned on Render restart. Flagged for next sprint. |
| **MongoDB `tls: true` hardcoded** | Breaks non-Atlas URIs. Local MongoDB requires Atlas URI or cert setup. Flagged for fix. |
| **Dashboard stats sequential fetching** | ~200 customers × 350ms = 70s+ per cache miss. 15-min cache mitigates in normal use. Acceptable at current scale — revisit at growth. |
| **In-memory caches unbounded** | `lastSeenCache`, `enrichmentCache`, `ticketPipelineCache`, `statsCache` have no upper-bound eviction. Monitor memory on Render starter tier. |
| **`/admin/hubspot-audit`** | Fetches every HubSpot contact with property history synchronously in the HTTP request. No timeout protection. Use sparingly. |
| **Provider scraper inline HTTP** | `POST /admin/provider-scraper/scrape` runs synchronously with no overall timeout. Can block for minutes. |
| **`requireAdmin` consistency** | Some admin routes use `addHook('preHandler', ...)`, others use inline form. Inline form in `hubspotOAuth.ts` must return after auth check. Audit remaining routes for consistency. |

---

## Agent rules

### Do
- Read the relevant route file and store file before changing behaviour
- Validate with Zod at the API boundary — schemas already exist for all inputs
- Keep HubSpot calls in `integrations/hubspot.ts`; do not add raw HubSpot `fetch()` calls in route files
- Return empty arrays / graceful degradation when HubSpot or MongoDB is not configured — this is the established pattern
- Use `requireAuth` / `requireAdmin` hooks via `addHook('preHandler', ...)` — never skip them, never use the inline form for new routes
- Keep email sending in `integrations/email.ts` via `sendTextEmail()`
- Match the existing `<script setup lang="ts">` Vue pattern

### Do not
- Do not revert or reopen any fix listed in the Security fixes — 11 Jun 2026 section
- Do not return `devCode` unless `NODE_ENV === 'development'` AND SMTP is not configured — both conditions required
- Do not add `console.log` to `hubspot.ts` under any circumstances
- Do not change the DOMPurify config in `KnowledgeBaseArticlePage.vue` without explicit security review
- Do not bypass feature flag checks in route `preHandler` hooks
- Do not add demo/mock data — empty responses when not configured is intentional
- Do not add QuickBooks API calls — the integration is not wired and no credentials exist
- Do not write `company` or `companyname` to existing HubSpot contacts
- Do not change `CORS` origin to `*` — single-origin is intentional
- Do not commit `.env` or any file containing `SMTP_PASS`, `HUBSPOT_PRIVATE_APP_TOKEN`, or other secrets
- Do not use Options API in Vue components — only Composition API with `<script setup>`
- Do not introduce new npm dependencies without clear justification
- Do not change visible portal copy or text unless explicitly asked
- Do not add `console.log` debug statements to production paths — use the existing `console.error` / `console.warn` patterns
- Do not run `git push`, `vercel deploy`, or any deployment command without being asked