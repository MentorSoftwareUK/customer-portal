# Mentor Customer Portal — Launch Plan
**Created:** 1 July 2026  
**Status:** Pre-launch

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

## Outstanding Items Before Launch

### 🔴 Blockers (must fix before Phase 1)

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
