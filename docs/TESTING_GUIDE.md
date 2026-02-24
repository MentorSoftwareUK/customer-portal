# Mentor Customer Portal — Testing Guide

**Who this is for:** Marketing team testers  
**Environment:** Production portal (Vercel) + API (Render)  
**Last updated:** 24 February 2026

---

## Before You Start

### What you'll need
- A test email address you can receive emails on
- A desktop or laptop browser (Chrome or Edge recommended)
- The portal URL (ask the dev team if unsure)
- This document open alongside the browser

### A few things to know
- The portal uses **email one-time codes** to log in — no password required
- Some sections (Meetings, Knowledge Base, etc.) may be hidden depending on which features are switched on
- If something looks missing, it may simply be turned off — note it down and flag it rather than assuming it's broken

---

## Section 1 — Logging In

### Test 1.1 — Sign in with email code

1. Go to the portal URL
2. You should land on the **login page**
3. Enter your email address and click **Send code** (or similar)
4. Check your inbox — you should receive an email with a sign-in code within about 30 seconds
5. Enter the code back on the portal

**Expected result:** You are taken to the dashboard. Your first name appears in the welcome heading (e.g. "Welcome back, Sarah").

**What to check:**
- [ ] Login email arrives (check spam if not)
- [ ] Email looks professional — navy header with "Mentor" branding, pink digit blocks for the code, white body
- [ ] Code works and signs you in
- [ ] Your first name shows correctly in the welcome message

---

### Test 1.2 — Invalid code

1. On the code entry screen, type a wrong code (e.g. `000000`)
2. Click Verify

**Expected result:** An error message appears. You are not signed in.

---

### Test 1.3 — Sign out

1. Click your name or the account icon (top right or sidebar)
2. Click **Sign out**

**Expected result:** You are returned to the login page.

---

## Section 2 — Dashboard

After logging in you land on the dashboard. This is the home screen.

### Test 2.1 — Welcome card

**What to check:**
- [ ] Your first name is shown in the heading
- [ ] The **Mentor Champion** badge is visible (navy/pink badge on the right side of the welcome card)
- [ ] A pink **Contact Us** button is visible

---

### Test 2.2 — Contact Us modal

1. Click the **Contact Us** button in the welcome card

**Expected result:** A popup (modal) appears with a contact form embedded from HubSpot.

**What to check:**
- [ ] Modal opens without a blank/empty box
- [ ] The form loads correctly (fields for name, email, message etc.)
- [ ] You can close it using the × button or by clicking the dark background behind it

---

### Test 2.3 — Onboarding journey tracker

Scroll down past the welcome card. You should see a progress tracker labelled **"Your onboarding journey"**.

**What to check:**
- [ ] Stages show: Discovery, Demo, Contract, Training, Live
- [ ] The current stage is highlighted (should be Training for most test accounts)
- [ ] A progress percentage is shown top-right (e.g. "75% complete")

---

### Test 2.4 — Upcoming Events section

On the dashboard look for **"Upcoming Events"** in the lower half.

**What to check:**
- [ ] If there are events, they are listed with a title, date, and a link
- [ ] If there are no events, a message says "No upcoming events scheduled."
- [ ] Clicking "View all" takes you to the Events page

---

### Test 2.5 — Your Meetings section *(if Meetings is enabled)*

Look for **"Your Meetings"** on the right side of the lower dashboard.

**What to check:**
- [ ] If you have meetings booked, they show with the host name, team, date and time
- [ ] If none, it says "No meetings scheduled yet."
- [ ] Clicking "View all" takes you to the Meetings page

---

## Section 3 — Events

Click **Events** in the left navigation.

### Test 3.1 — Events list

**What to check:**
- [ ] A list of upcoming events loads
- [ ] Each event shows a title, date, and type (e.g. Webinar, Workshop)
- [ ] You can filter or browse events

---

### Test 3.2 — Event detail

Click on any event.

**What to check:**
- [ ] Full event description loads
- [ ] Date, time, and format are shown
- [ ] A Register button is visible (unless registration is turned off)

---

### Test 3.3 — Event registration *(if event registrations are enabled)*

1. Open an event
2. Click **Register**
3. Follow the steps

**What to check:**
- [ ] Registration form or confirmation appears
- [ ] A confirmation email arrives after registering

---

## Section 4 — Meetings *(if Meetings is enabled)*

Click **Meetings** in the left navigation.

### Test 4.1 — Calendar view

**What to check:**
- [ ] A calendar appears showing the current month
- [ ] Any booked meetings appear on the correct dates
- [ ] You can switch between month / week / day / list views using the buttons at the top

---

### Test 4.2 — Meeting details

Click on any meeting in the calendar.

**What to check:**
- [ ] A popup shows the host name, team (Training / Customer Success / Renewals), date and time
- [ ] If a join link is available, a **Join meeting** button appears
- [ ] If no link yet, a greyed-out button saying "Join link pending" is shown instead

---

### Test 4.3 — Schedule a new meeting (+ New meeting button)

Click the **+ New meeting** button (top right of the calendar area).

**Step 1 — Host picker:**
- [ ] Three options appear: Simone Mills (Customer Success), Shaun Ward (Training), Hope Schindler (Renewals)
- [ ] Simone shows **"Book online"** in green
- [ ] Shaun and Hope show **"Invite only"** in grey

**Step 2a — Simone (Book online):**
1. Click Simone's card
- [ ] The modal expands to show HubSpot's scheduling calendar
- [ ] You can pick a date and time directly in the modal
- [ ] A back arrow lets you return to the host picker

**Step 2b — Shaun (Invite only):**
1. Click Shaun's card
- [ ] A message appears explaining training sessions are arranged as part of onboarding
- [ ] A **Got it** button closes the modal

**Step 2c — Hope (Coming soon):**
1. Click Hope's card
- [ ] A message appears saying her calendar isn't available for self-booking yet
- [ ] A **Got it** button closes the modal

---

## Section 5 — Resources *(if enabled)*

The **Resources** section in the nav may contain:

| Sub-section | What it shows |
|---|---|
| Knowledge Base | Articles and how-to guides |
| Training Videos | Recorded sessions and walkthroughs |
| Document Library | Downloadable templates and files |

These appear in the nav only when switched on. Test each one that is visible:

**For each resource section:**
- [ ] Page loads without error
- [ ] Content is listed (articles, videos, or documents)
- [ ] Clicking an item opens the detail or file

---

## Section 6 — Profile

Click your name or **Profile** in the nav/sidebar.

**What to check:**
- [ ] Your name and email are shown
- [ ] You can edit details (first name, last name, phone number, job title)
- [ ] Saving shows a success confirmation

---

## Section 7 — Navigation & Layout

### Test 7.1 — Sidebar navigation

**What to check:**
- [ ] All nav items that should be visible are visible
- [ ] Items that are turned off do NOT appear (e.g. Invoices, Tickets)
- [ ] Active page is highlighted in the nav
- [ ] Logo/branding looks correct at the top of the sidebar

---

### Test 7.2 — Mobile/responsive layout

Resize your browser window to a narrow width (or test on a phone if possible).

**What to check:**
- [ ] Navigation collapses into a menu
- [ ] Cards and text don't overflow or overlap
- [ ] Buttons remain tappable

---

### Test 7.3 — Quick Find *(keyboard shortcut)*

Press **Cmd+K** (Mac) or **Ctrl+K** (Windows).

**What to check:**
- [ ] A search/quick-find modal opens
- [ ] Typing filters available pages
- [ ] Pressing Escape closes it

---

## Section 8 — Things to Flag

When reporting issues, please include:

1. **What you were trying to do** — e.g. "I was trying to book a meeting with Simone"
2. **What you expected to happen** — e.g. "I expected the HubSpot calendar to load"
3. **What actually happened** — e.g. "The modal showed a blank white box"
4. **Screenshot** — always helpful
5. **Browser and OS** — e.g. Chrome on Mac

---

## Known Limitations (as of this release)

| Area | Status |
|---|---|
| Invoices | Feature switched off — page not visible |
| Support Tickets | Feature switched off — page not visible |
| Meetings — Hope Schindler | Calendar not yet set up — invite-only message shown |
| Meetings — Shaun Ward | Invite-only — no self-booking |
| Meetings — Simone Mills | Self-booking via HubSpot calendar ✅ |
| Event registration emails | Requires server to be fully warm — may take 30 seconds |

---

*If you're unsure whether something is a bug or expected behaviour, flag it anyway — the dev team would rather know.*
