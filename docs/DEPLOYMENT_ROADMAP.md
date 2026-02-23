# Deployment Roadmap (Go‑Live Scope: Events + Meetings)

**Date:** 23 Feb 2026  
**Scope for go‑live:** Events + Meetings only (everything else disabled)

## 1) Go‑live definition (what “done” means)

### Must be true on launch day
- Users can log in (passwordless/email code or password), land on the portal, and see only:
  - **Events** (browse, view details, register)
  - **Meetings** (access Customer Success / Training calendar links)
- **Everything else is turned off** in UI and blocked by route guards:
  - Tickets, Knowledge Base, Videos, Documents, Invoices, etc.
- **Event emails** send real confirmation + reminders and include the event join link.
- Admin can manage the minimal settings needed for launch (feature flags + event email timing).
- Production has:
  - MongoDB configured (persistent settings + registrations + email job queue)
  - SMTP configured (emails)
  - Monitoring/logging and a basic rollback plan

### Explicitly NOT in go‑live (post‑launch)
- Tickets, KB, Docs, Videos, Invoices, QuickBooks, HubSpot KB sync, etc.
- Full “meeting list synced from calendars” (unless explicitly chosen as scope)

## 2) Current status (based on repo)

### Events
- Portal pages exist: list, detail, register.
- API endpoints exist: list/get/register, registrations for current user.
- Registrations persist to Mongo when configured; in-memory fallback in dev.
- Stripe flow exists but can be left disabled if launch is **free-only**.
- Email worker exists but only runs when Mongo is configured.

### Meetings
- Portal Meetings UI exists.
- API `/meetings` currently returns **demo meetings only** (not tied to real calendars).

### Feature flags
- Feature flags are stored in Mongo admin settings.
- Important: portal currently **defaults feature flags to enabled** if it can’t load `/features`.

## 3) Remaining work (what’s left)

### A) Turn off everything except Events + Meetings (UI + guards)
**Goal:** users can’t discover or navigate to non-scope modules.
- Ensure nav/sidebar/quick-find only shows Events + Meetings (+ Profile/Dashboard as needed).
- Add route guards for all non-scope routes (not just tickets/invoices).
- Make safe defaults: if `/features` fails, default to “off” for non-scope modules.
- Verify admin settings toggles correctly persist (requires Mongo).

**Estimate:** 0.5–1.0 day

### B) Events: launch hardening
**Goal:** Events feels production-ready for the limited launch scope.
- Event emails:
  - Include **join link** in confirmation/reminder email body.
  - Confirm timings are driven by admin settings (already present).
- Confirm registration UX for customers vs non-customers (free-only launch assumed).
- Confirm DB-backed events in production:
  - Decide how events are created/maintained for launch:
    - **Option 1 (fastest):** seed events directly in Mongo (admin-only operational process)
    - **Option 2 (recommended product):** add “Create event” in admin (API + admin UI)

**Estimate:**
- Email content + end-to-end verification: 0.5–1.0 day
- Event creation:
  - Option 1: 0.0–0.5 day (documentation + seed procedure)
  - Option 2: 1.0–2.0 days (API endpoint + admin UI + validation)

### C) Meetings: make it real for launch
**Goal:** Meetings page points to real team calendars.

Assumption from discussion: “Meetings with Customer Success and Training via their calendars.”

**Phase 1 (go-live, recommended):**
- Replace demo meetings with a small, real model:
  - “Training calendar” link
  - “Customer Success calendar” link
  - (Optional) “Renewals” link
- Store these links in admin settings (Mongo), so they’re editable without redeploy.
- Portal Meetings page shows those links prominently and can keep the calendar UI as a secondary view.

**Estimate:** 0.5–1.0 day

**Phase 2 (post-launch option):**
- Pull *actual scheduled meetings* for each user from HubSpot/Calendar integrations.

**Estimate:** 3–6 days (depends heavily on which calendar system + permissions)

### D) Production infrastructure + deployment
**Goal:** stable environments and repeatable deployment.
- Choose hosting:
  - Portal: Vercel is straightforward (static SPA).
  - API: needs a long-running Node process (Fastify `listen`), plus outbound access to Mongo/SMTP.
- Provision production services:
  - MongoDB (Atlas or equivalent) + network access
  - SMTP provider credentials
  - Domain + TLS for portal + API
- Set environment variables and secrets in hosting platform.
- Set up staging environment (recommended) to run UAT safely.

**Estimate:** 1.0–2.0 days (can overlap with dev work; depends on access/approvals)

### E) QA/UAT + go-live checklist
**Goal:** avoid surprises, confirm scope locks.
- Smoke tests:
  - Login flow
  - Events list/detail/register
  - Confirmation + reminder email content + timing (in staging)
  - Meetings calendar links
  - Non-scope pages inaccessible/hidden
- Operational checklist:
  - Backups (Mongo)
  - Basic monitoring/logging
  - Rollback plan (revert deployment + maintenance mode)

**Estimate:** 0.5–1.0 day

## 4) Timeline summary (single developer)

Assuming **free-only events** and **meetings are calendar links (not synced schedules)**:
- **Minimum:** ~3.0 days
- **Typical (with buffer):** ~4–6 days

Breakdown (typical):
- A: 1.0 day
- B: 1.0–2.0 days (depending on event creation approach)
- C: 1.0 day
- D: 1.0–2.0 days (parallelizable)
- E: 0.5–1.0 day

If you need **user-specific scheduled meetings** pulled from calendars: add **+3–6 days**.

## 5) Dependencies / decisions needed from manager
- Confirm meeting approach for go-live:
  - Calendar links (fast) vs user-specific scheduled meetings (slower).
- Confirm who owns production provisioning (Mongo, SMTP, domains) and timelines for access.
- Confirm whether non-customer registration is allowed at launch (affects auth/support burden).

## 6) Risks (top)
- **Feature flags fail-open** if `/features` can’t be loaded; needs fixing to guarantee “everything else off.”
- Meetings are currently demo-only, so needs a production data source.
- Email deliverability + spam issues if SMTP is not set up correctly (SPF/DKIM depends on provider).
- If Mongo is misconfigured/unreachable, system silently falls back to demo/in-memory behavior.
