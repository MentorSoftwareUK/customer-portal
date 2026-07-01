# Mentor Customer Portal — Launch Plan
**Created:** 1 July 2026  
**Status:** Pre-launch

---

## Executive Summary

**What is the portal?**  
A private online portal where Mentor Software customers log in to access training events, support, documents, and their account information — all in one place. It replaces scattered emails and calls with a self-service hub that customers can use any time.

**Where are we now?**  
The portal is built and has been through a full testing round. It is ready to be used. It is not yet open to customers because a small number of setup tasks remain — most of which are account and configuration steps rather than development work.

**What is the plan?**  
We launch in two controlled stages before opening to everyone:

- **Phase 1 — Happy Group testing** (internal): The Happy Group use the portal as if they were a customer and flag any issues. Low risk — no external customers involved.
- **Phase 2 — 10 champion customers**: A hand-picked group of 10 existing customers get early access. We monitor how they get on and fix anything before the full rollout.
- **General rollout**: Once Phase 2 is signed off, all live customers receive an invite.

**What needs to happen before we can start Phase 1?**  
Two things are blocking us right now:

1. **The website hosting plan needs upgrading** — the service we use to host the portal (Vercel) needs to be on a paid plan before we can attach a proper web address (e.g. `portal.mentorsoftware.co.uk`). This is a straightforward subscription upgrade, approximately £15–20/month.
2. **A small number of setup tasks** — creating some test events, setting up the contact form correctly, and confirming the meeting booking system is linked properly. These are configuration tasks, not new development.

**Who needs to do what?**

| Who | Action | When |
|-----|--------|-------|
| Liam | Upgrade Vercel hosting, set up domain, configure payment system | Before Phase 1 |
| Simone | Set up scheduling availability in HubSpot, help select Phase 2 champions | Before Phase 1 |
| Shaun | Create Lunch & Learn sessions in the admin portal | Before Phase 1 |
| Liam + Simone | Select and invite 10 champion customers | Before Phase 2 |

**Timeline (indicative):**

| Milestone | Estimated timing |
|-----------|-----------------|
| Infrastructure setup complete | Week 1 |
| Phase 1 (Happy Group) begins | Week 1–2 |
| Phase 1 review and any fixes | Week 2–3 |
| Phase 2 (10 champions) begins | Week 3–4 |
| Phase 2 review | Week 5–6 |
| General rollout | Week 6+ |

---

## Overview

The portal is a private SaaS platform for Mentor Software UK customers. It gives subscribers access to events and training, support tickets, meetings, the knowledge base, videos, documents, and invoices. Access is gated by HubSpot contact data.

The rollout is staged in two phases before general availability:
- **Phase 1** — Happy Group internal test (controlled, low risk)
- **Phase 2** — Mentor Champion rollout (10 selected customers)

---

## Current Status Summary

Core authentication, events, tickets, knowledge base, videos, documents, meetings, and notifications are all built and functional. The design has been through a full UAT pass. Login page redesigned. The following items are outstanding before Phase 1 can begin.

---

## Infrastructure Blockers — Must Resolve First

These are non-code blockers that must be resolved before any external user can access the portal. Nothing in the codebase can fix these.

| # | Item | Owner | Notes |
|---|------|-------|-------|
| I-1 | **Vercel paid plan** | Liam | The portal is currently deployed on Vercel's free tier (Hobby). The free tier does not support custom domains on team projects, has no password protection, and has bandwidth/build limits unsuitable for production. Upgrade to Vercel Pro before Phase 1 goes live. Team: `mentor-software1`. Project: `customer-portal-portal-gky9`. ~$20/month. |
| I-2 | **Custom domain on Vercel** | Liam | Portal needs a production domain (e.g. `portal.mentorsoftware.co.uk`). Add domain in Vercel → project settings → Domains. Requires DNS CNAME record at domain registrar pointing to `cname.vercel-dns.com`. Vercel auto-provisions SSL. Cannot be done until I-1 (paid plan) is in place. |
| I-3 | **Render production env vars** | Liam | `PORTAL_BASE_URL` on the Render API service must be updated to the production domain once I-2 is set. Also confirm `STRIPE_SECRET_KEY` is set to the **live** key (not test), and `STRIPE_WEBHOOK_SECRET` matches the Stripe live webhook endpoint. |
| I-4 | **Stripe live mode + webhook** | Liam | In the Stripe dashboard, create a live-mode webhook pointing to `https://customer-portal-znxq.onrender.com/stripe/webhook`. Copy the new `whsec_...` signing secret and update `STRIPE_WEBHOOK_SECRET` on Render. Test a £0.00 event first to validate the webhook fires without a real charge. |
| I-5 | **CORS update on API** | Liam | The API only allows requests from `PORTAL_BASE_URL`. Once the domain changes from the Vercel preview URL to `portal.mentorsoftware.co.uk`, update `PORTAL_BASE_URL` on Render or the browser will block all API calls with a CORS error. |
| I-6 | **Render sleep / cold starts** | Liam | Render free-tier web services sleep after 15 minutes of inactivity, causing 30–60s cold starts on first login. Upgrade to at least Render Starter ($7/month) or set up a health-check ping (e.g. UptimeRobot hitting `/health` every 10 minutes) to prevent sleeping. |
| I-7 | **MongoDB Atlas IP allowlist** | Liam | If MongoDB Atlas IP access is currently set to a specific IP, add `0.0.0.0/0` (allow all) or Render's static IP (if on paid Render tier with static outbound IPs). Without this, Render may fail to connect after a service restart or IP rotation. |
| I-8 | **Brevo SMTP sending limit** | Liam | Verify Brevo daily sending quota is sufficient for Phase 1. Free plan is 300 emails/day. OTP codes + event confirmation emails + reminders could exceed this at scale. Upgrade Brevo plan if needed before Phase 2. |

---

## Go-Live Sequencing

Exact order of operations from current state to Phase 1 live.

### Step 1 — Infrastructure Setup (do this first, before any testing)

1. Upgrade Vercel account to Pro (`mentor-software1` team)
2. Add production domain `portal.mentorsoftware.co.uk` in Vercel project settings
3. Add DNS CNAME record at registrar: `portal` → `cname.vercel-dns.com`
4. Wait for DNS propagation and SSL certificate provisioning (up to 48 hours)
5. On Render, update `PORTAL_BASE_URL` to `https://portal.mentorsoftware.co.uk`
6. On Render, confirm `STRIPE_SECRET_KEY` is live key
7. In Stripe live dashboard, create webhook → `https://customer-portal-znxq.onrender.com/stripe/webhook` → copy secret → update `STRIPE_WEBHOOK_SECRET` on Render
8. Trigger a Render redeploy so env var changes take effect
9. Visit `https://portal.mentorsoftware.co.uk` — confirm login page loads with no console errors
10. Set up UptimeRobot (or equivalent) to ping `https://customer-portal-znxq.onrender.com/health` every 5 minutes

### Step 2 — Pre-Launch Content (admin tasks before users arrive)

1. Log in to admin portal → create 3+ upcoming events (published, not draft)
2. Log in to admin portal → create 5+ upcoming Lunch & Learn sessions with Teams links
3. Log in to admin portal → create a welcome notification (e.g. "Welcome to the Mentor Customer Portal — you're one of our first users. Let us know if you have any feedback.")
4. Verify Simone's HubSpot scheduling page shows correct availability
5. Confirm test HubSpot contacts for Phase 1 have correct `isLiveCustomer` property set

### Step 3 — Smoke Test (Liam, logged in as a test customer)

1. Log in with a real Happy Group email address via OTP
2. Check dashboard loads — stats, notifications visible
3. Browse events — at least one event shows, registration works
4. Open a Lunch & Learn — add to Google Calendar
5. Navigate to Tickets → Org Tickets → raise a test ticket
6. Browse Knowledge Base — articles load
7. Browse Videos — videos load
8. Book a meeting with Simone — confirm it appears in the portal Meetings page
9. Navigate to Profile — details load, edit and save
10. Open Contact Us modal — form fields visible, can be filled

### Step 4 — Phase 1 Invite (Happy Group)

1. Send invite email to Happy Group contacts with the portal URL and login instructions
2. Confirm at least one person logs in successfully on day 1
3. Share feedback mechanism (spreadsheet or email)
4. Monitor admin analytics dashboard for activity

### Step 5 — Phase 1 Review & Fix

1. Collect feedback over 1–2 weeks
2. Triage issues: fix any critical bugs immediately, log non-critical for Phase 2
3. Verify meetings sync is working (the key outstanding technical risk)
4. Sign-off from Happy Group lead before proceeding

### Step 6 — Phase 2 Prep

1. Select 10 champion customers (Liam + Simone)
2. Update HubSpot contacts to ensure `isLiveCustomer = true` for all 10
3. Prepare personalised invite email
4. Apply any Phase 1 fixes that affect champion experience
5. Resolve onboarding journey tracker (wire up or remove)
6. Decision on Invoices section (hide or "coming soon")

### Step 7 — Phase 2 Invite (10 Champions)

1. Send personalised invites one at a time or in small batches
2. Monitor login success — any failures likely indicate HubSpot data issues
3. Monitor admin analytics for engagement
4. Collect feedback via short form or email

---

## Outstanding Items Before Launch

| # | Item | Notes |
|---|------|-------|
| 1 | **Meetings not syncing from HubSpot** | When a customer books via Simone's HubSpot scheduling link, the meeting does not appear in the portal's Meetings page. This is a HubSpot meeting engagement association issue. Needs investigation — likely the booking isn't creating a CRM meeting engagement linked to the contact. |
| 2 | **Simone's scheduling availability hours** | Her working hours and non-working periods need to be set correctly in HubSpot calendar settings before the portal goes live. |
| 3 | **Contact Us form visibility** | CSS override deployed — needs verification in a real browser that form fields are visible. |
| 4 | **Test event / session data** | At least 2–3 upcoming events and Lunch & Learn sessions should be created in admin so Phase 1 testers see real content, not empty states. |
| 5 | **Admin notification** | Create a welcome/banner notification in the admin panel so Phase 1 testers see a live notification on the dashboard. |

---

### 🟡 Should Fix Before Phase 2

| # | Item | Notes |
|---|------|-------|
| 6 | **Round Robin meeting link** | Add a round-robin booking option in the meetings modal (requires Tickets 7 and HubSpot config first). |
| 7 | **Meeting purpose field** | Add a "purpose of meeting" field to the HubSpot scheduling form so Simone gets context before the call. HubSpot-side config change. |
| 8 | **KB article link on meetings page** | Add a link to the relevant knowledge base article from the meetings page. Needs the article URL. |
| 9 | **Onboarding journey tracker** | Currently hardcoded to "Training" stage for every user. Either wire it to a real HubSpot property or remove it from the dashboard before Phase 2. Needs a decision on which HubSpot property holds the stage. |
| 10 | **Invoices section** | Invoices are intentionally empty (QuickBooks not wired). Decide before Phase 2 whether to hide this section via feature flag or show it with a "coming soon" message. |
| 11 | **Admin email allowlist security** | Emails on the allowlist gain full admin access via OTP only (no password). Decide whether to require the admin credential flow instead. |

---

### 🟢 Nice to Have (Phase 2 or Post-Launch)

| # | Item | Notes |
|---|------|-------|
| 12 | **OTP code hashing** | SHA-256 HMAC only — vulnerable to offline brute-force if the database is compromised. Upgrade to a slow hash before any external rollout. |
| 13 | **Dead file cleanup** | `DashboardPage-OLD.vue.backup` and `HelloWorld.vue` can be deleted from the repo. No functional impact. |
| 14 | **MongoDB graceful shutdown** | MongoClient has no SIGTERM hook. Low risk at current scale, flagged for next sprint. |
| 15 | **Dashboard stats caching** | ~200 customers × 350ms ≈ 70s per cache miss (15-min cache mitigates). Fine now, revisit at scale. |

---

## Feature Flags — Recommended State Per Phase

| Feature | Phase 1 | Phase 2 | Notes |
|---------|---------|---------|-------|
| Events & Registrations | ✅ On | ✅ On | Core feature |
| Support Tickets | ✅ On | ✅ On | Core feature |
| Knowledge Base | ✅ On | ✅ On | Core feature |
| Videos | ✅ On | ✅ On | Core feature |
| Documents | ✅ On | ✅ On | Core feature |
| Meetings | ✅ On | ✅ On | Must resolve sync issue first |
| Global Notifications | ✅ On | ✅ On | Need admin to create one |
| Invoices | ❌ Off | ❌ Off | Not built — hide until QuickBooks integrated |
| Payments (Stripe) | ✅ On | ✅ On | Required for paid event registrations |

---

## Launch Checklist

### Technical Sign-Off

- [ ] Meetings sync from HubSpot confirmed working end-to-end
- [ ] Contact Us form fields visible in modal (not white on white)
- [ ] OTP login tested — code delivered to real email address, not expired
- [ ] Event registration tested — free registration flow works
- [ ] Event registration tested — paid registration flow works (Stripe test mode → live)
- [ ] Ticket creation and reply tested from portal
- [ ] Knowledge Base articles loading for correct provision types
- [ ] Videos loading for correct provision types
- [ ] Documents loading
- [ ] Admin notifications displaying on dashboard
- [ ] Admin can create/edit/cancel events
- [ ] Lunch & Learn events appear in the dedicated section with add-to-calendar
- [ ] Profile page loads and edits save to HubSpot
- [ ] Login page loads and works on mobile
- [ ] All pages load without JS errors in browser console
- [ ] Vercel deployment confirmed on production URL
- [ ] API on Render confirmed healthy (`/health` endpoint returns 200)
- [ ] SMTP email delivery confirmed (Brevo — DMARC updated 11 Jun)
- [ ] Stripe set to **live** keys (not test keys)
- [ ] Stripe webhook secret matches production endpoint

### Content & Data

- [ ] At least 2 upcoming events created and published in admin
- [ ] At least 3 upcoming Lunch & Learn sessions created in admin with Teams links
- [ ] Simone's HubSpot scheduling availability reviewed and confirmed
- [ ] Admin welcome notification created
- [ ] Knowledge base articles confirmed visible for Supported Accommodation + Children's Homes
- [ ] HubSpot contact property `HUBSPOT_LIVE_CUSTOMER_PROPERTY` confirmed for all Phase 1/2 contacts

### Communications

- [ ] Invite email prepared for Phase 1 (Happy Group)
- [ ] Brief guide / one-pager prepared for testers (what to test, how to report issues)
- [ ] Internal Mentor staff trained on admin portal (events, notifications, ticket management)
- [ ] Decision made on onboarding journey tracker (wire up or remove)
- [ ] Decision made on Invoices section (hide or "coming soon")

---

## Staged Rollout Plan

---

### Phase 1 — Happy Group Internal Testing

**Goal:** Catch any critical issues in a fully controlled environment before any external users see the portal.

**When:** Target start date TBC (resolve all 🔴 blockers first)

**Who:** Happy Group only — internal Mentor team using it as if they were a customer

**Duration:** 1–2 weeks

**What to test:**
1. Login flow — OTP received, no double-send, password option works
2. Dashboard — stats load, notifications show, Contact Us modal works
3. Events — events visible, registration works (free and paid), Lunch & Learns accordion works with add-to-calendar
4. Tickets — view existing tickets, create a new ticket from the Org Tickets page, reply
5. Knowledge Base — articles load for correct provision type, article view works
6. Videos — load for correct provision type
7. Documents — load
8. Meetings — booking works, meeting appears in the portal after booking
9. Profile — personal details load and can be saved
10. Mobile — test on phone/tablet (login, dashboard, events, tickets)

**Feedback mechanism:** Shared testing spreadsheet (like the UAT sheet). Log page, issue, severity, screenshot.

**Success criteria:** No critical bugs. All core flows complete without error. Meetings syncing confirmed.

**Gate:** Phase 2 does not start until Phase 1 issues are resolved and sign-off given.

---

### Phase 2 — Mentor Champion Rollout (10 Customers)

**Goal:** Validate the portal works for real customers across different provision types and product versions, with minimal risk.

**When:** After Phase 1 sign-off (estimated 2–3 weeks after Phase 1 start, depending on issues found)

**Who:** 10 carefully selected existing Mentor customers — spread across:
- Mix of provision types (Children's Homes, Supported Accommodation, 18+)
- Mix of product versions (v2 / v3)
- Mix of roles (Registered Manager, RI, Director)
- Ideally customers who are active, engaged, and likely to give useful feedback

**How to select:** Liam + Simone/Shaun to identify 10 contacts from HubSpot who fit the above mix and are likely to be receptive.

**Onboarding:**
1. Mentor sends a personalised invite email to each contact
2. Email explains what the portal is, what they can do, and how to log in
3. Contact follows OTP login flow (no password needed first time)
4. Short feedback form or email address shared for feedback

**Duration:** 2–4 weeks

**What they can access:** All features with feature flags as specified in the table above

**What to monitor:**
- Login success rate (any contacts unable to log in → likely HubSpot data issue)
- Support tickets created via the portal
- Event registrations
- Any emails to Mentor support about confusion or bugs
- Check portal activity logs in admin (`/admin/analytics/users`)

**Success criteria:**
- All 10 contacts can log in without manual intervention
- No critical bugs reported
- At least 5 of 10 use a core feature (events, tickets, or KB) without prompting
- Meetings sync confirmed for any customers who book

**Gate:** General rollout does not start until Phase 2 feedback reviewed and any issues resolved.

---

### Phase 3 — General Rollout (All Live Customers)

**Outline only — plan TBC after Phase 2**

- Bulk invite email to all live HubSpot contacts with `isLiveCustomer = true`
- Stagger invites if volume warrants it (e.g. 50/day to avoid support overload)
- Mentor staff ready to handle increase in support tickets
- Admin monitoring dashboard active
- Invoices section decision finalised before this phase

---

## Key Contacts & Responsibilities

| Role | Person | Area |
|------|--------|------|
| Portal owner / dev | Liam | Technical, deployment, fixes |
| Customer Success | Simone | HubSpot scheduling setup, champion selection, customer comms |
| Training | Shaun | Lunch & Learn event creation, Phase 1 testing |
| Phase 1 lead | TBC | Coordinating Happy Group feedback |

---

## Known Out of Scope (Not Launching)

- **Invoices** — QuickBooks not integrated. Feature flag off.
- **Onboarding journey tracker** — Static placeholder. Decision needed.
- **OAuth Google / Microsoft login** — Not implemented.
- **Old CRM data** — CSV files in `tmp/old crm/` contain PII and are not in scope.

---

*This document should be reviewed and updated after Phase 1 and again after Phase 2.*
