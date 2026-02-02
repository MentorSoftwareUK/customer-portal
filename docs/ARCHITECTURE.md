# Architecture (Draft)

## High-level
- **WordPress** remains the public, SEO-facing surface for event listings/details.
- **Portal (Vue/Tailwind)** runs on a subdomain for login, registration, and gated content.
- **API (Node/Fastify)** is the integration layer to HubSpot/Stripe/QuickBooks and (optionally) WordPress shortcodes.

## Source of truth
- **HubSpot** is the source of truth for contact/customer status/provision type.

## Non-negotiables from brief
- **Do not update company name** for existing HubSpot contacts.
- **Event email timing must be configurable** (defaults may exist, but no hardcoded schedules).

## Phase 1 focus
- API + portal scaffolding
- Email-first authentication flow with HubSpot lookup
- Integration client modules (HubSpot/Stripe/QuickBooks) as thin adapters
