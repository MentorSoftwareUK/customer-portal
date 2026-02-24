const defaultBaseUrl = 'http://localhost:3001'

import { getAdminAccessToken, getUserAccessToken, handleUnauthorized } from './auth'

export type AuthLookupResponse = {
  email: string
  auth?: {
    hasPassword?: boolean
  }
  hubspot: {
    found: boolean
    contactId: string | null
    properties: Record<string, string | null> | null
  }
  isLiveCustomer: boolean | null
  provisionType?: 'supported-accommodation' | 'childrens-home' | 'over-18' | null
  productVersion?: 'v2' | 'v3' | null
  warning?: string
}

export type Audience = 'customer' | 'non-customer' | 'both'
export type Provision = 'childrens-home' | 'supported-accommodation' | 'over-18' | 'all'

export type EventDto = {
  id: string
  title: string
  description: string
  type: 'Webinar' | 'Lunch & Learn' | 'Podcast' | 'Other'
  startAt: string
  dateLabel: string
  timezoneLabel: string
  status?: string
  completed?: boolean
  eligibility: Audience
  eligibilityLabel: string
  provision: Provision
  provisionLabel: string
  priceForNonCustomers: number | null
  durationMins: number
  commentsCount: number
  hostName?: string
  hostTitle?: string
  platform: 'Teams' | 'Riverside' | 'TBD'
  joinUrl?: string | null
  registeredCount?: number
  attendeesCount?: number
  noShowCount?: number
  webinarSlides?: Array<{ label?: string; url: string }>
  webinarRecordingUrl?: string | null
  blogPostUrl?: string | null
  followUpEmailSent?: boolean | null
  emailStats?: {
    sent?: number
    delivered?: number
    bounced?: number
    ctr?: number
  }
}

function getApiBaseUrl() {
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (envBase && envBase.trim()) || defaultBaseUrl
}

async function apiFetch(input: string, init?: RequestInit) {
  const token = (() => {
    try {
      const url = new URL(input)
      const path = url.pathname
      const isAdminEndpoint = path.startsWith('/admin')
      const isAdminAuthEndpoint = path.startsWith('/admin-auth')
      if (isAdminEndpoint || isAdminAuthEndpoint) return getAdminAccessToken()
      // For non-admin endpoints, prefer the user token but fall back to the
      // admin token so admin pages that call shared endpoints (e.g. /videos,
      // /features) still authenticate successfully.
      return getUserAccessToken() || getAdminAccessToken()
    } catch {
      return getUserAccessToken() || getAdminAccessToken()
    }
  })()

  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, {
    ...init,
    headers,
  })

  // For all "normal" API calls, a 401 means the session is no longer valid.
  // Don't do this for auth endpoints where 401s are part of the UX.
  try {
    const url = new URL(input)
    const path = url.pathname
    const isAuthEndpoint =
      path === '/auth/start' ||
      path === '/auth/verify' ||
      path === '/auth/lookup' ||
      path === '/auth/login' ||
      path === '/auth/onboard' ||
      path === '/admin-auth/login'

    if (res.status === 401 && !isAuthEndpoint) {
      // Determine context from the current page only, not the API path.
      // An admin page may call non-admin endpoints (e.g. /videos) and a
      // portal page may probe admin endpoints (e.g. adminMe check in
      // AppShell) — in both cases only the browser URL matters for deciding
      // which login page to redirect to.
      const isInAdminArea =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/admin')
      handleUnauthorized(isInAdminArea ? 'admin' : 'user')
    }
  } catch {
    // ignore
  }

  return res
}

async function adminApiFetch(input: string, init?: RequestInit) {
  const token = getAdminAccessToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, {
    ...init,
    headers,
  })

  try {
    const url = new URL(input)
    const path = url.pathname
    const isAdminAuthEndpoint = path.startsWith('/admin-auth')
    if (res.status === 401 && !isAdminAuthEndpoint) {
      handleUnauthorized('admin')
    }
  } catch {
    // ignore
  }

  return res
}

export type AuthStartResponse = {
  ok: true
  email: string
  warning?: string
  devCode?: string
}

export async function authStart(email: string): Promise<AuthStartResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Auth start failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as AuthStartResponse
}

export type AuthUser = {
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
  adminRoles?: string[]
}

export type AuthVerifyResponse = {
  accessToken: string
  user: AuthUser
}

export async function authVerify(email: string, code: string): Promise<AuthVerifyResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Auth verify failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as AuthVerifyResponse
}

export async function authLoginWithPassword(email: string, password: string): Promise<AuthVerifyResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Auth login failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as AuthVerifyResponse
}

export type AuthOnboardResponse = {
  ok: true
  action: 'created' | 'updated'
  hubspotContactId: string
}

export async function authOnboard(params: {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  company?: string
}): Promise<AuthOnboardResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Onboarding failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as AuthOnboardResponse
}

export async function authSetPassword(password: string): Promise<{ ok: true }> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/password/set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Set password failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { ok: true }
}

export async function authMe(): Promise<{ user: AuthUser }> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/me`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Auth me failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { user: AuthUser }
}

export type AdminUser = {
  email: string
  roles: string[]
}

export type AdminLoginResponse = {
  accessToken: string
  admin: AdminUser
}

export async function adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin-auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin login failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as AdminLoginResponse
}

export async function adminMe(): Promise<{ admin: AdminUser }> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin-auth/me`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin me failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { admin: AdminUser }
}

export type PortalUser = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  companyId: string | null
  companyName: string | null
  status: 'active' | 'inactive'
  accessStatus: 'active' | 'temp_blocked' | 'perm_blocked'
  blockedUntil: string | null
  blockedReason: string | null
  hubspotContactId: string | null
  emailHistory: Array<{ email: string; removedAt: string; reason?: string }>
  notesCount: number
  ticketsCount: number
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export async function adminListUsers(params: { search?: string; status?: 'active' | 'inactive'; limit?: number; offset?: number } = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const res = await apiFetch(`${getApiBaseUrl()}/admin/users?${query.toString()}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin list users failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { users: PortalUser[]; total: number }
}

export async function adminCreateUser(body: {
  email: string
  firstName?: string
  lastName?: string
  companyId?: string
  companyName?: string
  hubspotContactId?: string
}): Promise<{ user: PortalUser }> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin create user failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { user: PortalUser }
}

export async function adminUpdateUser(id: string, body: Partial<Omit<PortalUser, 'id' | 'emailHistory' | 'createdAt' | 'updatedAt'>>) {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin update user failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { user: PortalUser }
}

export async function adminDetachUser(id: string, reason?: string) {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/users/${id}/detach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin detach user failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { user: PortalUser }
}

export async function adminOffboardUser(id: string, reason?: string) {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/users/${id}/offboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin offboard user failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { user: PortalUser }
}

export type UserUsageMetric = {
  email: string
  userId: string | null
  name: string | null
  companyName: string | null
  lastSeenAt: string | null
  sessionsCount: number
  totalTimeMs: number
  pageViews: number
}

export type KbViewMetric = {
  articleId: string
  title: string | null
  url: string | null
  views: number
  lastViewedAt: string | null
}

export type AdminTicketMetrics = {
  total: number
  open: number
  pending: number
  closed: number
}

export async function adminGetUserUsageMetrics(params?: { days?: number }) {
  const query = new URLSearchParams()
  if (params?.days) query.set('days', String(params.days))
  const res = await apiFetch(`${getApiBaseUrl()}/admin/analytics/users?${query.toString()}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin analytics users failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { metrics: UserUsageMetric[] }
}

export async function adminGetKbViewMetrics(params?: { days?: number }) {
  const query = new URLSearchParams()
  if (params?.days) query.set('days', String(params.days))
  const res = await apiFetch(`${getApiBaseUrl()}/admin/analytics/kb?${query.toString()}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin analytics KB failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { metrics: KbViewMetric[] }
}

export async function adminGetTicketMetrics() {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/analytics/tickets`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin analytics tickets failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { metrics: AdminTicketMetrics }
}

export async function trackSessionStart(path?: string) {
  const res = await apiFetch(`${getApiBaseUrl()}/activity/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { sessionId: string }
  return data.sessionId
}

export async function trackSessionEnd(sessionId: string) {
  await apiFetch(`${getApiBaseUrl()}/activity/session/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => null)
}

export async function trackPageView(path: string) {
  await apiFetch(`${getApiBaseUrl()}/activity/page-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }).catch(() => null)
}

export async function trackKbView(params: { articleId?: string | null; title?: string | null; url?: string | null }) {
  await apiFetch(`${getApiBaseUrl()}/activity/kb-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => null)
}

export async function authLookup(email: string): Promise<AuthLookupResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/auth/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) {
    throw new Error(`Lookup failed: ${res.status}`)
  }

  return (await res.json()) as AuthLookupResponse
}

export async function listEvents(): Promise<EventDto[]> {
  const res = await apiFetch(`${getApiBaseUrl()}/events`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Events list failed: ${res.status}`)
  }
  const data = (await res.json()) as { events: EventDto[] }
  return data.events
}

export async function getEvent(id: string): Promise<EventDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/events/${encodeURIComponent(id)}`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Event fetch failed: ${res.status}`)
  }
  const data = (await res.json()) as { event: EventDto }
  return data.event
}

export async function adminListEvents(): Promise<EventDto[]> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Admin events list failed: ${res.status}`)
  }
  const data = (await res.json()) as { events: EventDto[] }
  return data.events
}

export async function adminGetEvent(id: string): Promise<EventDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events/${encodeURIComponent(id)}`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Admin event fetch failed: ${res.status}`)
  }
  const data = (await res.json()) as { event: EventDto }
  return data.event
}

export async function adminUpdateEvent(id: string, body: Partial<EventDto>): Promise<EventDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin event update failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  const data = (await res.json()) as { event: EventDto }
  return data.event
}

export async function adminCreateEvent(body: {
  title: string
  type: 'Webinar' | 'Lunch & Learn' | 'Podcast' | 'Other'
  startAt: string
  durationMins: number
  platform: 'Teams' | 'Riverside' | 'TBD'
  eligibility: 'customer' | 'non-customer' | 'both'
  provision: 'childrens-home' | 'supported-accommodation' | 'over-18' | 'all'
  description?: string
  hostName?: string
  hostTitle?: string
  joinUrl?: string
  priceForNonCustomers?: number | null
}): Promise<EventDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin event create failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  const data = (await res.json()) as { event: EventDto }
  return data.event
}

export async function adminCancelEvent(id: string): Promise<EventDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin event cancel failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  const data = (await res.json()) as { event: EventDto }
  return data.event
}

export type EventRegisterRequest = {
  name: string
  company?: string
  phone?: string
  customField?: string
}

export type EventRegisterResponse =
  | {
      status: 'registered'
      registrationId: string
      eventId: string
    }
  | {
      status: 'payment_required'
      registrationId: string
      eventId: string
      amount: number
      currency: 'GBP'
      paymentProvider: 'stripe'
      checkoutUrl?: string
      checkoutSessionId?: string
      checkoutClientSecret?: string
      warning?: string
    }

export async function registerForEvent(eventId: string, body: EventRegisterRequest): Promise<EventRegisterResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/events/${encodeURIComponent(eventId)}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Event registration failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as EventRegisterResponse
}

// Used when the user has a pending registration and just needs to be sent back to Stripe.
export async function resumeEventPayment(eventId: string): Promise<EventRegisterResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/events/${encodeURIComponent(eventId)}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resume payment failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as EventRegisterResponse
}

export type EventRegistrationDto = {
  id: string
  eventId: string
  status: 'registered' | 'payment_pending' | 'paid' | 'cancelled' | 'failed'
  attendanceStatus?: 'attended' | 'no_show' | null
  attendeeType: 'customer' | 'non-customer'
  createdAt: string
  paidAt: string | null
}

export type AdminEventRegistrationDto = EventRegistrationDto & {
  name: string
  email: string
  company: string
  phone: string
  customField: string
}

export type AdminEventReportDto = {
  eventId: string
  title: string
  dateLabel: string
  status: string | null
  invitedCount: number | null
  registeredCount: number
  paymentPendingCount: number
  paidCount: number
  cancelledCount: number
  failedCount: number
  attendedCount: number
  noShowCount: number
  totalRegistrations: number
}

export async function listMyEventRegistrations(): Promise<EventRegistrationDto[]> {
  const res = await apiFetch(`${getApiBaseUrl()}/events/registrations/me`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Registrations list failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  const data = (await res.json()) as { registrations: EventRegistrationDto[] }
  return data.registrations
}

export async function getMyEventRegistration(eventId: string): Promise<EventRegistrationDto | null> {
  const res = await apiFetch(`${getApiBaseUrl()}/events/${encodeURIComponent(eventId)}/registration/me`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Registration fetch failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  const data = (await res.json()) as { registration: EventRegistrationDto | null }
  return data.registration
}

export async function adminListEventRegistrations(eventId: string): Promise<AdminEventRegistrationDto[]> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/events/${encodeURIComponent(eventId)}/registrations`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Admin registrations list failed: ${res.status}`)
  }
  const data = (await res.json()) as { registrations: AdminEventRegistrationDto[] }
  return data.registrations
}

export async function adminUpdateRegistration(id: string, body: { attendanceStatus: 'attended' | 'no_show' | null }): Promise<AdminEventRegistrationDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/registrations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin registration update failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  const data = (await res.json()) as { registration: AdminEventRegistrationDto }
  return data.registration
}

export async function adminListEventReports(): Promise<AdminEventReportDto[]> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/reports/events`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Admin reports list failed: ${res.status}`)
  }
  const data = (await res.json()) as { events: AdminEventReportDto[] }
  return data.events
}

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

export type GetAdminSettingsResponse = {
  settings: AdminSettings
  system: {
    smtpConfigured: boolean
    emailJobsEnabled: boolean
  }
}

export async function getAdminSettings(): Promise<GetAdminSettingsResponse> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/settings`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin settings fetch failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as GetAdminSettingsResponse
}

export type PatchAdminSettingsRequest = {
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

export async function patchAdminSettings(body: PatchAdminSettingsRequest): Promise<{ settings: AdminSettings }> {
  const res = await apiFetch(`${getApiBaseUrl()}/admin/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Admin settings update failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { settings: AdminSettings }
}

export type FeatureFlags = {
  invoicesEnabled: boolean
  ticketsEnabled: boolean
  knowledgeBaseEnabled: boolean
  documentsEnabled: boolean
  videosEnabled: boolean
  meetingsEnabled: boolean
  paymentsEnabled: boolean
  eventRegistrationsEnabled: boolean
}

export async function getFeatureFlags(): Promise<{ features: FeatureFlags }> {
  const res = await apiFetch(`${getApiBaseUrl()}/features`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Feature flags fetch failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { features: FeatureFlags }
}

export type StripeCheckoutConfirmResponse =
  | {
      status: 'paid'
      registrationId: string
      eventId: string
    }
  | {
      status: 'pending'
      registrationId: string
      eventId: string
    }

export async function confirmStripeCheckoutSession(sessionId: string): Promise<StripeCheckoutConfirmResponse> {
  const url = new URL(`${getApiBaseUrl()}/stripe/checkout/confirm`)
  url.searchParams.set('session_id', sessionId)

  const res = await apiFetch(url.toString(), { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stripe checkout confirmation failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as StripeCheckoutConfirmResponse
}

export type InvoiceStatus = 'Paid' | 'Unpaid' | 'Overdue'

export type InvoiceDto = {
  id: string
  number: string
  date: string
  status: InvoiceStatus
  amountGbp: number
  pdfUrl: string | null
}

export async function listInvoices(): Promise<{ invoices: InvoiceDto[]; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/invoices`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Invoices list failed: ${res.status}`)
  }
  return (await res.json()) as { invoices: InvoiceDto[]; warning?: string }
}

export type TicketStatus = 'Open' | 'Pending' | 'Closed'

export type TicketDto = {
  id: string
  subject: string
  status: TicketStatus
  lastUpdatedLabel: string
}

export type TicketMessageDto = {
  id: string
  direction: 'customer' | 'support'
  body: string
  timeLabel: string
}

export type TicketDetailDto = TicketDto & {
  category?: string
  priority?: 'Low' | 'Normal' | 'High'
  messages: TicketMessageDto[]
}

export type CreateTicketRequest = {
  subject: string
  description: string
  category?: string
  priority?: 'Low' | 'Normal' | 'High'
}

export async function createTicket(body: CreateTicketRequest): Promise<{ ticket: TicketDto; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ticket creation failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { ticket: TicketDto; warning?: string }
}

export async function getTicket(id: string): Promise<{ ticket: TicketDetailDto; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/tickets/${encodeURIComponent(id)}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ticket fetch failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { ticket: TicketDetailDto; warning?: string }
}

export async function replyToTicket(id: string, message: string): Promise<{ ticket: TicketDetailDto; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/tickets/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ticket reply failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }

  return (await res.json()) as { ticket: TicketDetailDto; warning?: string }
}

export async function listTickets(): Promise<{ tickets: TicketDto[]; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/tickets`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Tickets list failed: ${res.status}`)
  }
  return (await res.json()) as { tickets: TicketDto[]; warning?: string }
}

export type MeetingTeam = 'Training' | 'Success Team' | 'Renewals'

export type MeetingDto = {
  id: string
  team: MeetingTeam
  hostName?: string | null
  dateTimeLabel: string
  joinUrl: string | null
}

export async function listMeetings(): Promise<{ meetings: MeetingDto[]; warning?: string }> {
  const res = await apiFetch(`${getApiBaseUrl()}/meetings`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Meetings list failed: ${res.status}`)
  }
  return (await res.json()) as { meetings: MeetingDto[]; warning?: string }
}

export type KnowledgeBaseCategory = 'Getting started' | 'Reporting' | 'Support'

export type KnowledgeBaseArticleDto = {
  id: string
  title: string
  category: KnowledgeBaseCategory
  readMins: number
  provision: Provision
  productVersion?: 'all' | 'v2' | 'v3'
  url?: string
  featuredImageUrl?: string
  description?: string
  snippet?: string
}

export async function listKnowledgeBaseArticles(params?: {
  productVersion?: 'all' | 'v2' | 'v3'
}): Promise<{ articles: KnowledgeBaseArticleDto[]; warning?: string }> {
  const url = new URL(`${getApiBaseUrl()}/knowledge-base`)
  if (params?.productVersion) url.searchParams.set('productVersion', params.productVersion)
  const res = await apiFetch(url.toString(), { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Knowledge base list failed: ${res.status}`)
  }
  return (await res.json()) as { articles: KnowledgeBaseArticleDto[]; warning?: string }
}

export async function getKnowledgeBaseArticle(url: string): Promise<{ title: string; html: string; url: string }> {
  const apiUrl = new URL(`${getApiBaseUrl()}/knowledge-base/article`)
  apiUrl.searchParams.set('url', url)
  const res = await apiFetch(apiUrl.toString(), { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Knowledge base article failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { title: string; html: string; url: string }
}

export async function getKnowledgeBaseArticleFeaturedImage(url: string): Promise<string | null> {
  const apiUrl = new URL(`${getApiBaseUrl()}/knowledge-base/article/featured-image`)
  apiUrl.searchParams.set('url', url)
  const res = await apiFetch(apiUrl.toString(), { method: 'GET' })
  if (!res.ok) {
    return null
  }
  const data = (await res.json()) as { featuredImageUrl: string | null }
  return data.featuredImageUrl
}

export async function getKnowledgeBaseArticleSnippet(url: string): Promise<string> {
  const apiUrl = new URL(`${getApiBaseUrl()}/knowledge-base/article/snippet`)
  apiUrl.searchParams.set('url', url)
  const res = await apiFetch(apiUrl.toString(), { method: 'GET' })
  if (!res.ok) {
    return ''
  }
  const data = (await res.json()) as { snippet: string }
  return data.snippet
}

export type VideoDto = {
  youtubeId: string
  title: string
  category: string
  authorName: string
  timeAgo: string
  provision: Provision
  productVersion?: 'all' | 'v2' | 'v3'
  keywords?: string[]
  videoUrl?: string
  thumbnailUrl?: string
}

export async function listVideos(params?: {
  productVersion?: 'all' | 'v2' | 'v3'
  keyword?: string
}): Promise<{
  recentVideos: VideoDto[]
  popularVideos: VideoDto[]
  warning?: string
}> {
  const url = new URL(`${getApiBaseUrl()}/videos`)
  if (params?.productVersion) url.searchParams.set('productVersion', params.productVersion)
  if (params?.keyword) url.searchParams.set('keyword', params.keyword)
  const res = await apiFetch(url.toString(), { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Videos list failed: ${res.status}`)
  }
  return (await res.json()) as {
    recentVideos: VideoDto[]
    popularVideos: VideoDto[]
    warning?: string
  }
}

export type DocumentCategory = 'Guides' | 'Templates' | 'Policies'

export type DocumentDto = {
  id: string
  title: string
  category: DocumentCategory
  version: string
  downloadLabel: string
  provision: Provision
  productVersion?: 'all' | 'v2' | 'v3'
  url?: string
}

export async function listDocuments(params?: {
  productVersion?: 'all' | 'v2' | 'v3'
}): Promise<{ documents: DocumentDto[]; warning?: string }> {
  const url = new URL(`${getApiBaseUrl()}/documents`)
  if (params?.productVersion) url.searchParams.set('productVersion', params.productVersion)
  const res = await apiFetch(url.toString(), { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Documents list failed: ${res.status}`)
  }
  return (await res.json()) as { documents: DocumentDto[]; warning?: string }
}

export type ProfileDto = {
  personal: {
    email: string
    firstName: string
    lastName: string
    phone: string
    jobTitle: string
  }
  company: {
    id: string
    name: string
    domain: string
    phone: string
    address: string
    city: string
    zip: string
    country: string
  } | null
  permissions: {
    canEditCompany: boolean
  }
  onboarding?: {
    required: boolean
    missingFields: Array<'firstName' | 'lastName' | 'phone' | 'jobTitle' | 'email'>
  }
}

export type UpdatePersonalRequest = {
  firstName?: string
  lastName?: string
  phone?: string
  jobTitle?: string
}

export async function getProfile(): Promise<ProfileDto> {
  const res = await apiFetch(`${getApiBaseUrl()}/profile`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Profile fetch failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as ProfileDto
}

export async function updatePersonalProfile(
  body: UpdatePersonalRequest,
): Promise<{ personal: ProfileDto['personal']; onboarding?: ProfileDto['onboarding'] }> {
  const res = await apiFetch(`${getApiBaseUrl()}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Profile update failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { personal: ProfileDto['personal'] }
}

export type UpdateCompanyRequest = {
  name?: string
  domain?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
}

export type CompanySyncDto = {
  totalCompanyContacts: number
  updatedContacts: number
}

export async function updateCompanyProfile(
  body: UpdateCompanyRequest,
): Promise<{ company: NonNullable<ProfileDto['company']>; sync?: CompanySyncDto }> {
  const res = await apiFetch(`${getApiBaseUrl()}/profile/company`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Company update failed: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { company: NonNullable<ProfileDto['company']>; sync?: CompanySyncDto }
}

// HubSpot OAuth
export type HubSpotOAuthStatus = {
  connected: boolean
  expiresAt: string | null
}

export async function getHubSpotOAuthStatus(): Promise<HubSpotOAuthStatus> {
  const res = await adminApiFetch(`${getApiBaseUrl()}/api/hubspot/oauth/status`)
  if (!res.ok) {
    throw new Error(`Failed to get OAuth status: ${res.status}`)
  }
  return (await res.json()) as HubSpotOAuthStatus
}

export function initiateHubSpotOAuth() {
  // Redirect to OAuth authorization endpoint
  window.location.href = `${getApiBaseUrl()}/api/hubspot/oauth/authorize`
}

export async function disconnectHubSpotOAuth(): Promise<void> {
  const res = await adminApiFetch(`${getApiBaseUrl()}/api/hubspot/oauth/disconnect`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to disconnect OAuth: ${res.status}${text ? ` - ${text}` : ''}`)
  }
}

// ─── Event Invites (HubSpot contact list blast) ────────────────────────────────

export type HubSpotContactList = {
  listId: number
  name: string
  size: number
  dynamic: boolean
}

export async function adminGetInviteLists(eventId: string): Promise<HubSpotContactList[]> {
  const res = await adminApiFetch(`${getApiBaseUrl()}/api/admin/events/${eventId}/invite-lists`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load invite lists: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return ((await res.json()) as { lists: HubSpotContactList[] }).lists
}

export async function adminSendInvites(
  eventId: string,
  listId: number,
): Promise<{ queued: number }> {
  const res = await adminApiFetch(`${getApiBaseUrl()}/api/admin/events/${eventId}/send-invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to send invites: ${res.status}${text ? ` - ${text}` : ''}`)
  }
  return (await res.json()) as { queued: number }
}

