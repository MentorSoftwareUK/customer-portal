# Mentor Customer Portal — Design System Reference

This file is the canonical reference for colour, typography, and component conventions in the customer portal (`apps/portal`). It exists so that every developer and every AI agent works from the same token vocabulary and does not fight the design going forward.

---

## Design intent

The portal is a professional B2B SaaS tool for regulated care-sector practitioners. The aesthetic is:

- **Clean, light content area** — white card surfaces on a soft grey page background
- **Dark navigation chrome** — sidebar and topbar stay brand navy (`#14192d`) at all times, giving the portal a distinct "dashboard" frame
- **One accent colour** — brand pink `#e7007e` for primary CTAs, links, and active states only
- No gradients on content surfaces. No lift / `translateY` hover effects on stat cards.

---

## Colour tokens

Defined in `tailwind.config.js` under `theme.extend.colors`.

### Semantic page tokens

| Token | Value | When to use |
|---|---|---|
| `bg-page` | `#f5f6f8` | Page root background (outside cards) |
| `bg-surface` / `bg-white` | `#ffffff` | Primary card / panel surface |
| `bg-surface-muted` | `#f9fafb` | Sub-card, muted section, table header |
| `bg-surface-raised` | `#ffffff` | Modal, dropdown (white with shadow) |
| `border-border` / `border-gray-200` | `#e3e6ec` | Default card/panel border |
| `border-gray-300` | `#d1d5db` | Stronger separator, form field border |

### Brand tokens

| Token | Value | When to use |
|---|---|---|
| `bg-brand-primary` | `#14192d` | Sidebar, topbar — nav chrome only |
| `bg-brand-secondary` | `#3A4051` | Not used in content; legacy nav hover |
| `text-brand-accent` / `bg-primary-600` | `#e7007e` | Primary buttons, active nav, links |
| `text-primary-700` | `#bf006a` | Button hover, link hover |
| `bg-primary-50` | `#fdf2f8` | Pink-tinted info backgrounds |

### Status colours (content area)

Always use these opaque variants — never the `/15` or `/30` opacity forms.

| Semantic | Background | Text | Ring |
|---|---|---|---|
| Success | `bg-emerald-50` | `text-emerald-700` | `ring-emerald-200` |
| Warning | `bg-amber-50` | `text-amber-700` | `ring-amber-200` |
| Danger | `bg-rose-50` | `text-rose-700` | `ring-rose-200` |
| Neutral | `bg-gray-100` | `text-gray-600` | `ring-gray-200` |

Use the `.ui-pill-*` classes — they already encode these values.

---

## Typography scale

Font: **Poppins** (400, 500, 600, 700). Do not introduce a second typeface.

| Role | Tailwind classes | Notes |
|---|---|---|
| Page title | `text-2xl font-bold text-gray-900` | One per page |
| Section heading | `text-base font-semibold text-gray-900` | Card titles, panel headers |
| Body / paragraph | `text-sm text-gray-600` leading-relaxed | Default content text |
| Label | `text-sm font-medium text-gray-700` | Form labels, small section labels |
| Caption / muted | `text-xs text-gray-400` | Timestamps, secondary metadata |
| Link | `text-primary-600 hover:text-primary-700 hover:underline` | Use `.ui-link` |

**WCAG minimum**: body text on white must meet 4.5:1. `text-gray-600` (#4b5563) on white = 7.7:1 ✓. `text-gray-400` (#9ca3af) on white = 3.0:1 — only use for decorative or non-essential text.

---

## Component classes

Defined in `style.css` under `@layer components`. Use these everywhere — do not re-implement inline.

### Surfaces

```html
<!-- Primary card surface -->
<div class="ui-surface p-5">...</div>

<!-- Muted / secondary surface (table headers, info boxes) -->
<div class="ui-surface-muted p-4">...</div>
```

### Buttons

```html
<!-- Primary CTA (pink) — use sparingly: one per screen -->
<button class="ui-btn-primary">Register now</button>

<!-- Secondary action (white + border) -->
<button class="ui-btn-secondary">Cancel</button>

<!-- Small variant — add ui-btn-xs to either -->
<button class="ui-btn-secondary ui-btn-xs">Edit</button>
```

**Primary button rule**: only one `ui-btn-primary` visible at a time per viewport region. Pink is reserved for the single most important action.

### Status pills

```html
<span class="ui-pill ui-pill-success"><span class="ui-pill-dot"></span>Active</span>
<span class="ui-pill ui-pill-warning"><span class="ui-pill-dot"></span>Pending</span>
<span class="ui-pill ui-pill-danger"><span class="ui-pill-dot"></span>Overdue</span>
<span class="ui-pill ui-pill-neutral">No status</span>
```

### Form elements

```html
<label class="ui-label" for="x">Field name</label>
<input id="x" class="ui-input" type="text" placeholder="...">
```

### Table

```html
<table class="ui-table">
  <thead><tr><th>Name</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>...</td><td><span class="ui-pill ui-pill-success">Active</span></td></tr>
  </tbody>
</table>
```

---

## Navigation chrome (sidebar + topbar)

**Always dark.** The sidebar and topbar use `bg-brand-primary` (`#14192d`) directly. Do not change these backgrounds in light mode — the dark chrome is an intentional design choice creating a permanent "dashboard frame" that separates brand identity from content.

- Active nav item: `bg-white/10 text-white` — subtle white tint on dark surface ✓
- Inactive nav item: `text-white/70 hover:bg-white/5 hover:text-white`
- Do not introduce a pink left-border active indicator on nav items unless there is an explicit UX decision to do so

Topbar dropdowns (notifications, quick links, user menu) **are white** — they float over the light content area so they use the same card surface style as content.

---

## What to never do

1. **Do not use `dark:` Tailwind variants** in portal files — dark mode has been removed. Any `dark:` prefix is dead code and will cause confusion.
2. **Do not use opacity-based colour values** (`bg-white/10`, `text-white/70`, `border-white/10`) in content area components — they were dark-mode hacks. Use the explicit grey equivalents from the scale above.
3. **Do not use `bg-[#14192d]` or `bg-[#0f1428]` in page or content component files** — those belong only to nav chrome in `AppShell.vue`.
4. **Do not add a second font** — Poppins only.
5. **Do not add `translateY` / lift effects to stat cards**.
6. **Do not use `-300` Tailwind colour variants for text on white** — they fail WCAG. Use `-600` or `-700` variants for text.
7. **Do not re-introduce `customer-light` or `admin-light` CSS hack classes** — these have been removed. Fix the component classes directly.

---

## Pre-empting UX lead feedback

These are known gaps and decisions to have ready when a UX lead reviews:

### 1. Dark sidebar — is this intentional?
Yes. It is a deliberate "permanent chrome" pattern common in SaaS dashboards (Slack, Linear, Notion). It gives Mentor brand presence and distinguishes nav from content at a glance. Decision made. Revisit only with a full design system overhaul.

### 2. Pink primary button usage
Currently overused across multiple pages. The UX lead will want to enforce "one primary CTA per view". Audit needed in `EventsListPage`, `DashboardPage`, and `TicketsPage` where multiple pink buttons may appear simultaneously.

### 3. Empty states
No consistent empty state pattern exists. Each page handles "no data" inline with ad-hoc copy. The UX lead will ask for a standardised empty state component: icon + heading + body + optional CTA. Not built yet.

### 4. Form field consistency
Profile, tickets, and event registration all have slightly different input border-radius and padding. `.ui-input` is now defined — pages need to adopt it uniformly. Audit `ProfilePage.vue` and `TicketsPage.vue` in particular.

### 5. Loading skeleton pattern
Most pages use a solid grey `bg-gray-50 rounded` placeholder. A shimmer animation pattern (`animate-pulse bg-gray-100`) would be more professional. Not implemented yet.

### 6. Responsive nav — mobile
The sidebar collapses to a mobile drawer. The mobile trigger is in `AppShell.vue`. This works but has not been tested against the new light content background. Smoke test on mobile before signing off.

### 7. WCAG audit on stat number text
Stat numbers in `DashboardPage` and `TicketsPage` were previously `-300` variants (fails on white). They are now `-600` after the bulk replacement. Confirm visually these still feel energetic enough — `-600` can look heavier/more serious than intended for metric callouts.

### 8. Active nav state
Current active state is `bg-white/10` (subtle white tint on dark sidebar). A pink left-border `border-l-2 border-primary-500` is a common stronger active indicator. Hold for explicit UX sign-off before changing — it's a visible interaction model shift.

---

## File locations

| Concern | File |
|---|---|
| Tailwind config + token definitions | `apps/portal/tailwind.config.js` |
| Global CSS + component class definitions | `apps/portal/src/style.css` |
| Portal shell layout (sidebar, topbar, content area) | `apps/portal/src/ui/AppShell.vue` |
| Admin shell layout | `apps/portal/src/ui/AdminShell.vue` |
| Toast notifications | `apps/portal/src/ui/ToastContainer.vue` |
| Toast composable | `apps/portal/src/lib/toast.ts` |
| API fetch util | `apps/portal/src/lib/api.ts` |
| Feature flags | `apps/portal/src/lib/featureFlags.ts` |
