import { z } from 'zod'
import { getDb } from '../db'

export type NotificationLevel = 'info' | 'danger' | 'success' | 'warning' | 'dark'

export type Notification = {
  id: string
  level: NotificationLevel
  title: string
  message: string
  enabled: boolean
  startsAtIso: string | null
  endsAtIso: string | null
  createdAtIso: string
  updatedAtIso: string
}

type NotificationDoc = {
  _id: string
  level: NotificationLevel
  title: string
  message: string
  enabled: boolean
  startsAtIso: string | null
  endsAtIso: string | null
  createdAtIso: string
  updatedAtIso: string
}

const COLLECTION = 'notifications'

const inMemory = new Map<string, Notification>()

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  return `notif_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
}

function toNotification(doc: NotificationDoc): Notification {
  return {
    id: doc._id,
    level: doc.level,
    title: doc.title,
    message: doc.message,
    enabled: doc.enabled,
    startsAtIso: doc.startsAtIso ?? null,
    endsAtIso: doc.endsAtIso ?? null,
    createdAtIso: doc.createdAtIso,
    updatedAtIso: doc.updatedAtIso,
  }
}

export const NotificationCreateSchema = z
  .object({
    level: z.enum(['info', 'danger', 'success', 'warning', 'dark']).default('info'),
    title: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(500),
    enabled: z.boolean().default(true),
    startsAtIso: z.string().datetime().nullable().optional(),
    endsAtIso: z.string().datetime().nullable().optional(),
  })
  .strict()

export type NotificationCreate = z.infer<typeof NotificationCreateSchema>

export const NotificationPatchSchema = z
  .object({
    level: z.enum(['info', 'danger', 'success', 'warning', 'dark']).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    message: z.string().trim().min(1).max(500).optional(),
    enabled: z.boolean().optional(),
    startsAtIso: z.string().datetime().nullable().optional(),
    endsAtIso: z.string().datetime().nullable().optional(),
  })
  .strict()

export type NotificationPatch = z.infer<typeof NotificationPatchSchema>

function isActiveAt(n: Pick<Notification, 'enabled' | 'startsAtIso' | 'endsAtIso'>, nowMs: number): boolean {
  if (!n.enabled) return false

  if (n.startsAtIso) {
    const t = new Date(n.startsAtIso).getTime()
    if (Number.isFinite(t) && nowMs < t) return false
  }

  if (n.endsAtIso) {
    const t = new Date(n.endsAtIso).getTime()
    if (Number.isFinite(t) && nowMs >= t) return false
  }

  return true
}

export async function listNotifications(params?: { includeDisabled?: boolean }): Promise<Notification[]> {
  const db = await getDb()

  if (!db) {
    const items = Array.from(inMemory.values())
    return items
      .filter((n) => (params?.includeDisabled ? true : n.enabled))
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
  }

  const query = params?.includeDisabled ? {} : { enabled: true }
  const docs = (await db
    .collection<NotificationDoc>(COLLECTION)
    .find(query)
    .sort({ createdAtIso: -1 })
    .toArray()) as NotificationDoc[]

  return docs.map(toNotification)
}

export async function listActiveNotifications(): Promise<Notification[]> {
  const nowMs = Date.now()
  const all = await listNotifications({ includeDisabled: true })
  return all.filter((n) => isActiveAt(n, nowMs)).sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
}

export async function createNotification(input: NotificationCreate): Promise<Notification> {
  const id = makeId()
  const ts = nowIso()

  const next: Notification = {
    id,
    level: input.level ?? 'info',
    title: input.title,
    message: input.message,
    enabled: input.enabled ?? true,
    startsAtIso: input.startsAtIso ?? null,
    endsAtIso: input.endsAtIso ?? null,
    createdAtIso: ts,
    updatedAtIso: ts,
  }

  const db = await getDb()
  if (!db) {
    inMemory.set(id, next)
    return next
  }

  await db.collection<NotificationDoc>(COLLECTION).insertOne({
    _id: next.id,
    level: next.level,
    title: next.title,
    message: next.message,
    enabled: next.enabled,
    startsAtIso: next.startsAtIso,
    endsAtIso: next.endsAtIso,
    createdAtIso: next.createdAtIso,
    updatedAtIso: next.updatedAtIso,
  })

  return next
}

export async function updateNotification(id: string, patch: NotificationPatch): Promise<Notification | null> {
  const db = await getDb()
  const ts = nowIso()

  if (!db) {
    const prev = inMemory.get(id)
    if (!prev) return null
    const next: Notification = {
      ...prev,
      ...patch,
      startsAtIso: patch.startsAtIso === undefined ? prev.startsAtIso : patch.startsAtIso,
      endsAtIso: patch.endsAtIso === undefined ? prev.endsAtIso : patch.endsAtIso,
      updatedAtIso: ts,
    }
    inMemory.set(id, next)
    return next
  }

  const update: Record<string, unknown> = { updatedAtIso: ts }
  if (patch.level !== undefined) update.level = patch.level
  if (patch.title !== undefined) update.title = patch.title
  if (patch.message !== undefined) update.message = patch.message
  if (patch.enabled !== undefined) update.enabled = patch.enabled
  if (patch.startsAtIso !== undefined) update.startsAtIso = patch.startsAtIso
  if (patch.endsAtIso !== undefined) update.endsAtIso = patch.endsAtIso

  const res = await db.collection<NotificationDoc>(COLLECTION).findOneAndUpdate(
    { _id: id },
    { $set: update },
    { returnDocument: 'after' },
  )

  return res ? toNotification(res) : null
}

export async function deleteNotification(id: string): Promise<boolean> {
  const db = await getDb()
  if (!db) {
    return inMemory.delete(id)
  }

  const res = await db.collection<NotificationDoc>(COLLECTION).deleteOne({ _id: id })
  return res.deletedCount === 1
}
