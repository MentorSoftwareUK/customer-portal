import { randomUUID } from 'node:crypto'
import { getDb } from '../db'

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

type PortalUserDoc = PortalUser & { _id: string }

const COLLECTION = 'portal_users'
const inMemory = new Map<string, PortalUser>()

function nowIso() {
  return new Date().toISOString()
}

function newUserId() {
  return randomUUID()
}

function normalizeEmail(email: string | null | undefined) {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  return trimmed || null
}

function ensureInMemorySeed() {
  // No-op: users are created dynamically on first login.
}

export async function listUsers(params: { search?: string; status?: 'active' | 'inactive'; limit?: number; offset?: number }) {
  const db = await getDb()
  const limit = params.limit ?? 50
  const offset = params.offset ?? 0
  const search = params.search?.trim().toLowerCase()

  if (!db) {
    ensureInMemorySeed()
    let users = Array.from(inMemory.values())
    if (params.status) users = users.filter((u) => u.status === params.status)
    if (search) {
      users = users.filter((u) => {
        return (
          (u.email && u.email.includes(search)) ||
          (u.firstName && u.firstName.toLowerCase().includes(search)) ||
          (u.lastName && u.lastName.toLowerCase().includes(search)) ||
          (u.companyName && u.companyName.toLowerCase().includes(search))
        )
      })
    }
    return {
      total: users.length,
      items: users.slice(offset, offset + limit),
    }
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  const query: Record<string, unknown> = {}
  if (params.status) query.status = params.status
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
    ]
  }

  const cursor = col.find(query).skip(offset).limit(limit)
  const [items, total] = await Promise.all([cursor.toArray(), col.countDocuments(query)])
  return {
    total,
    items: items.map(({ _id, ...rest }) => rest),
  }
}

export async function createUser(params: {
  email: string
  firstName?: string | null
  lastName?: string | null
  companyId?: string | null
  companyName?: string | null
  hubspotContactId?: string | null
}) {
  const now = nowIso()
  const user: PortalUser = {
    id: newUserId(),
    email: normalizeEmail(params.email),
    firstName: params.firstName?.trim() || null,
    lastName: params.lastName?.trim() || null,
    companyId: params.companyId?.trim() || null,
    companyName: params.companyName?.trim() || null,
    status: 'active',
    accessStatus: 'active',
    blockedUntil: null,
    blockedReason: null,
    hubspotContactId: params.hubspotContactId?.trim() || null,
    emailHistory: [],
    notesCount: 0,
    ticketsCount: 0,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  if (!db) {
    inMemory.set(user.id, user)
    return user
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  await col.insertOne({ ...user, _id: user.id })
  return user
}

export async function updateUser(id: string, params: Partial<Omit<PortalUser, 'id' | 'emailHistory' | 'createdAt' | 'notesCount' | 'ticketsCount'>>) {
  const db = await getDb()
  const next: Partial<PortalUser> = {
    email: normalizeEmail(params.email ?? undefined),
    firstName: params.firstName?.trim() ?? undefined,
    lastName: params.lastName?.trim() ?? undefined,
    companyId: params.companyId?.trim() ?? undefined,
    companyName: params.companyName?.trim() ?? undefined,
    status: params.status ?? undefined,
    accessStatus: params.accessStatus ?? undefined,
    blockedUntil: params.blockedUntil ?? undefined,
    blockedReason: params.blockedReason ?? undefined,
    hubspotContactId: params.hubspotContactId?.trim() ?? undefined,
    lastSeenAt: params.lastSeenAt ?? undefined,
    updatedAt: nowIso(),
  }

  if (!db) {
    const existing = inMemory.get(id)
    if (!existing) return null
    const merged = { ...existing, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) }
    inMemory.set(id, merged)
    return merged
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  const res = await col.findOneAndUpdate(
    { _id: id },
    { $set: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return res ?? null
}

export async function getUserByEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const db = await getDb()
  if (!db) {
    ensureInMemorySeed()
    const items = Array.from(inMemory.values())
    return items.find((u) => u.email === normalized) ?? null
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  const doc = await col.findOne({ email: normalized })
  if (!doc) return null
  const { _id, ...rest } = doc
  return rest
}

export async function ensureUserByEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const existing = await getUserByEmail(normalized)
  if (existing) return existing

  return await createUser({ email: normalized })
}

export async function updateUserLastSeenByEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const now = nowIso()
  const db = await getDb()

  if (!db) {
    const existing = inMemory.get(Array.from(inMemory.values()).find((u) => u.email === normalized)?.id ?? '')
    if (!existing) return null
    const updated = { ...existing, lastSeenAt: now, updatedAt: now }
    inMemory.set(updated.id, updated)
    return updated
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  const res = await col.findOneAndUpdate(
    { email: normalized },
    { $set: { lastSeenAt: now, updatedAt: now } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return res ?? null
}

export async function detachUser(id: string, reason?: string) {
  const db = await getDb()
  const now = nowIso()

  if (!db) {
    const existing = inMemory.get(id)
    if (!existing) return null
    const history = existing.emailHistory.slice()
    if (existing.email) {
      history.push({ email: existing.email, removedAt: now, reason })
    }
    const updated: PortalUser = {
      ...existing,
      email: null,
      companyId: null,
      companyName: null,
      status: 'inactive',
      emailHistory: history,
      updatedAt: now,
    }
    inMemory.set(id, updated)
    return updated
  }

  const col = db.collection<PortalUserDoc>(COLLECTION)
  const existing = await col.findOne({ _id: id })
  if (!existing) return null

  const history = existing.emailHistory ?? []
  if (existing.email) {
    history.push({ email: existing.email, removedAt: now, reason })
  }

  const res = await col.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        email: null,
        companyId: null,
        companyName: null,
        status: 'inactive',
        emailHistory: history,
        updatedAt: now,
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } },
  )

  return res ?? null
}
