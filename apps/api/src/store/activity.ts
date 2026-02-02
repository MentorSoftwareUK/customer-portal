import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { listUsers, type PortalUser } from './users'

export type PortalSession = {
  id: string
  userId: string | null
  email: string | null
  path: string | null
  userAgent: string | null
  startedAt: string
  endedAt: string | null
  durationMs: number | null
}

export type PortalPageView = {
  id: string
  userId: string | null
  email: string | null
  path: string
  createdAt: string
}

export type PortalKbView = {
  id: string
  userId: string | null
  email: string | null
  articleId: string | null
  title: string | null
  url: string | null
  createdAt: string
}

const SESSIONS_COLLECTION = 'portal_sessions'
const PAGE_VIEWS_COLLECTION = 'portal_page_views'
const KB_VIEWS_COLLECTION = 'portal_kb_views'

const inMemorySessions = new Map<string, PortalSession>()
const inMemoryPageViews: PortalPageView[] = []
const inMemoryKbViews: PortalKbView[] = []

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  return randomUUID()
}

export async function startSession(params: { userId: string | null; email: string | null; path?: string | null; userAgent?: string | null }) {
  const session: PortalSession = {
    id: newId(),
    userId: params.userId ?? null,
    email: params.email ?? null,
    path: params.path ?? null,
    userAgent: params.userAgent ?? null,
    startedAt: nowIso(),
    endedAt: null,
    durationMs: null,
  }

  const db = await getDb()
  if (!db) {
    inMemorySessions.set(session.id, session)
    return session
  }

  const col = db.collection<PortalSession>(SESSIONS_COLLECTION)
  await col.insertOne({ ...session, _id: session.id } as any)
  return session
}

export async function endSession(sessionId: string) {
  const endedAt = nowIso()
  const db = await getDb()

  if (!db) {
    const existing = inMemorySessions.get(sessionId)
    if (!existing) return null
    const durationMs = new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
    const updated = { ...existing, endedAt, durationMs }
    inMemorySessions.set(sessionId, updated)
    return updated
  }

  const col = db.collection<PortalSession>(SESSIONS_COLLECTION)
  const existing = await col.findOne({ _id: sessionId } as any)
  if (!existing) return null
  const durationMs = new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
  const res = await col.findOneAndUpdate(
    { _id: sessionId } as any,
    { $set: { endedAt, durationMs } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return res ?? null
}

export async function trackPageView(params: { userId: string | null; email: string | null; path: string }) {
  const view: PortalPageView = {
    id: newId(),
    userId: params.userId ?? null,
    email: params.email ?? null,
    path: params.path,
    createdAt: nowIso(),
  }

  const db = await getDb()
  if (!db) {
    inMemoryPageViews.push(view)
    return view
  }

  const col = db.collection<PortalPageView>(PAGE_VIEWS_COLLECTION)
  await col.insertOne({ ...view, _id: view.id } as any)
  return view
}

export async function trackKbView(params: { userId: string | null; email: string | null; articleId?: string | null; title?: string | null; url?: string | null }) {
  const view: PortalKbView = {
    id: newId(),
    userId: params.userId ?? null,
    email: params.email ?? null,
    articleId: params.articleId ?? null,
    title: params.title ?? null,
    url: params.url ?? null,
    createdAt: nowIso(),
  }

  const db = await getDb()
  if (!db) {
    inMemoryKbViews.push(view)
    return view
  }

  const col = db.collection<PortalKbView>(KB_VIEWS_COLLECTION)
  await col.insertOne({ ...view, _id: view.id } as any)
  return view
}

export async function getUserUsageMetrics(params: { since?: Date }) {
  const since = params.since
  const db = await getDb()

  let sessions: PortalSession[] = []
  let pageViews: PortalPageView[] = []

  if (!db) {
    sessions = Array.from(inMemorySessions.values())
    pageViews = [...inMemoryPageViews]
  } else {
    const sessionsCol = db.collection<PortalSession>(SESSIONS_COLLECTION)
    const viewsCol = db.collection<PortalPageView>(PAGE_VIEWS_COLLECTION)
    const sessionQuery = since ? { startedAt: { $gte: since.toISOString() } } : {}
    const viewQuery = since ? { createdAt: { $gte: since.toISOString() } } : {}
    sessions = (await sessionsCol.find(sessionQuery).toArray()).map(({ _id, ...rest }: any) => rest)
    pageViews = (await viewsCol.find(viewQuery).toArray()).map(({ _id, ...rest }: any) => rest)
  }

  const usageByEmail = new Map<string, {
    email: string
    sessionsCount: number
    totalTimeMs: number
    lastSeenAt: string | null
    pageViews: number
  }>()

  for (const session of sessions) {
    if (!session.email) continue
    const entry = usageByEmail.get(session.email) ?? {
      email: session.email,
      sessionsCount: 0,
      totalTimeMs: 0,
      lastSeenAt: null,
      pageViews: 0,
    }
    entry.sessionsCount += 1
    if (session.durationMs) entry.totalTimeMs += session.durationMs
    const last = session.endedAt ?? session.startedAt
    if (!entry.lastSeenAt || new Date(last).getTime() > new Date(entry.lastSeenAt).getTime()) {
      entry.lastSeenAt = last
    }
    usageByEmail.set(session.email, entry)
  }

  for (const view of pageViews) {
    if (!view.email) continue
    const entry = usageByEmail.get(view.email) ?? {
      email: view.email,
      sessionsCount: 0,
      totalTimeMs: 0,
      lastSeenAt: null,
      pageViews: 0,
    }
    entry.pageViews += 1
    if (!entry.lastSeenAt || new Date(view.createdAt).getTime() > new Date(entry.lastSeenAt).getTime()) {
      entry.lastSeenAt = view.createdAt
    }
    usageByEmail.set(view.email, entry)
  }

  const usersRes = await listUsers({ limit: 500, offset: 0 })
  const userByEmail = new Map<string, PortalUser>()
  for (const user of usersRes.items) {
    if (user.email) userByEmail.set(user.email, user)
  }

  return Array.from(usageByEmail.values()).map((entry) => {
    const user = userByEmail.get(entry.email)
    return {
      email: entry.email,
      userId: user?.id ?? null,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
      companyName: user?.companyName ?? null,
      lastSeenAt: entry.lastSeenAt,
      sessionsCount: entry.sessionsCount,
      totalTimeMs: entry.totalTimeMs,
      pageViews: entry.pageViews,
    }
  })
}

export async function getKbViewMetrics(params: { since?: Date }) {
  const since = params.since
  const db = await getDb()
  let views: PortalKbView[] = []

  if (!db) {
    views = [...inMemoryKbViews]
  } else {
    const col = db.collection<PortalKbView>(KB_VIEWS_COLLECTION)
    const query = since ? { createdAt: { $gte: since.toISOString() } } : {}
    views = (await col.find(query).toArray()).map(({ _id, ...rest }: any) => rest)
  }

  const byArticle = new Map<string, { articleId: string; title: string | null; url: string | null; views: number; lastViewedAt: string | null }>()

  for (const view of views) {
    const key = view.articleId || view.url || view.title || 'unknown'
    const entry = byArticle.get(key) ?? {
      articleId: view.articleId || key,
      title: view.title || null,
      url: view.url || null,
      views: 0,
      lastViewedAt: null,
    }
    entry.views += 1
    if (!entry.lastViewedAt || new Date(view.createdAt).getTime() > new Date(entry.lastViewedAt).getTime()) {
      entry.lastViewedAt = view.createdAt
    }
    byArticle.set(key, entry)
  }

  return Array.from(byArticle.values()).sort((a, b) => b.views - a.views)
}
