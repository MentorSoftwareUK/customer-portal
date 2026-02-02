# Mentor Customer Portal (Foundation)

Monorepo scaffold for the Mentor customer portal + events system.

## Apps
- `apps/portal`: Vue 3 + Vite + Tailwind (portal UI)
- `apps/api`: Node.js (Fastify) API (integration layer)

## Getting started

```bash
npm install
npm run dev
```

- Portal: http://localhost:5173
- API: http://localhost:3001/health

## Environment
- Copy `.env.example` to `.env` (root) and set values as you wire integrations.
- Copy `apps/portal/.env.example` to `apps/portal/.env` if you want a custom API base URL.

Admin settings endpoints (`/admin/settings`) require `ADMIN_EMAIL_ALLOWLIST` to be set (comma-separated emails).

Event emails (confirmation/reminder/thank-you) are driven by a lightweight email job worker in the API. Configure SMTP to send real emails; in non-production environments without SMTP, emails are logged to the API console.

## Stripe (paid event registrations)

Set these in your root `.env`:

- `STRIPE_SECRET_KEY` (test key for local dev)
- `STRIPE_WEBHOOK_SECRET` (from Stripe CLI or the Dashboard webhook endpoint)

Optional overrides (otherwise derived from `PORTAL_BASE_URL`):

- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`

### Local webhook testing (recommended)

1. Install and login to the Stripe CLI.
2. Forward webhooks to the API:

```bash
stripe listen --forward-to http://localhost:3001/stripe/webhook
```

3. Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

Notes:

- Paid registrations will return `501 not_configured` unless `STRIPE_SECRET_KEY` is set.
- The portal completes the flow by calling `GET /stripe/checkout/confirm?session_id=...` after redirect.

## HubSpot

This repo uses a **HubSpot Private App Token** (recommended) for server-to-server access.

1. In HubSpot, create a Private App and copy the access token.
2. Set `HUBSPOT_PRIVATE_APP_TOKEN` in your root `.env`.
3. (Optional but recommended) Configure property mappings so the portal can gate content:
	- `HUBSPOT_LIVE_CUSTOMER_PROPERTY` and `HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES`
	- `HUBSPOT_PROVISION_TYPE_PROPERTY`
	- `HUBSPOT_PRODUCT_VERSION_PROPERTY`

To verify connectivity (admin-only), call `GET /admin/hubspot/status`.
It returns whether HubSpot is configured, whether the API can connect, and the current mapping config.

## Auth + onboarding (real-time testing)

This repo supports passwordless sign-in via emailed passcodes, with optional passwords for **live customers**.

### 1) Configure HubSpot mappings

In your root `.env`:

- `HUBSPOT_PRIVATE_APP_TOKEN` (required for real HubSpot lookups + onboarding)
- `HUBSPOT_LIVE_CUSTOMER_PROPERTY` (contact property name)
- `HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES` (comma-separated values that count as “true”)
- Optional gating:
	- `HUBSPOT_PROVISION_TYPE_PROPERTY`
	- `HUBSPOT_PRODUCT_VERSION_PROPERTY`

Restart the API after setting these.

Example (HubSpot dropdown internal values):

```dotenv
HUBSPOT_LIVE_CUSTOMER_PROPERTY=salesstatus
HUBSPOT_LIVE_CUSTOMER_TRUE_VALUES=paying_customer
```

### 2) Configure SMTP (recommended for testing with real people)

If SMTP is configured, login codes are sent to real inboxes:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`
- Optional auth: `SMTP_USER`, `SMTP_PASS`

In dev without SMTP, the API returns a `devCode` from `POST /auth/start` and the portal shows it.

### 3) Run a lookup + auth flow

Start the app:

```bash
npm run dev
```

Portal login: http://localhost:5173/login

Or test via script:

```bash
node scripts/test-auth.mjs lookup you@company.com
node scripts/test-auth.mjs start you@company.com
node scripts/test-auth.mjs verify you@company.com 123456
```

### Event registration reporting (recommended)

To keep HubSpot as the reporting source of truth (without requiring Custom Objects), the API can upsert a HubSpot **Deal** per portal registration.

1. Create a dedicated Deal pipeline (recommended) called “Event Registrations”.
2. Create stages:
	- Registered
	- Payment Pending
	- Paid
	- Cancelled
	- Failed
3. Create a Deal property called `mentor_registration_id` (Single-line text) used for idempotent upserts.
4. Add any additional Deal properties you want for reporting. The API will attempt to write:
	- `mentor_event_id`
	- `mentor_event_title`
	- `mentor_event_start_at`
	- `mentor_attendee_type`
	- `mentor_registration_status` (e.g. registered/payment_pending/paid/cancelled/failed)
	- `mentor_registered_at`
	- `mentor_paid_at`
	- `mentor_stripe_checkout_session_id`
5. Set these env vars:
	- `HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_LABEL` (default: `Event Registrations`) or `HUBSPOT_EVENT_REGISTRATION_DEAL_PIPELINE_ID`
	- Stage labels (defaults match the names above), e.g. `HUBSPOT_EVENT_REGISTRATION_STAGE_PAID=Paid`
	- `HUBSPOT_EVENT_REGISTRATION_DEAL_UNIQUE_PROPERTY` (default: `mentor_registration_id`)

Notes:
- Associations are best-effort; the deal upsert is the core reporting record.
- Free registrations for customers will be created with `amount=0`.
- Paid registrations for non-customers will use the event price as `amount`.
- HubSpot contact updates will never send `company`/`companyname` fields for existing contacts.
