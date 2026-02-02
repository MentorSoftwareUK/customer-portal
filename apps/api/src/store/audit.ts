import { getDb } from '../db'

export type AdminAuditEntry = {
  id: string
  actorEmail: string
  action: string
  targetUserId?: string | null
  targetEmail?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
}

type AdminAuditDoc = Omit<AdminAuditEntry, 'id'> & { _id: string }

const inMemoryAudit: AdminAuditEntry[] = []
const COLLECTION = 'admin_audit'

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  return `audit_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
}

export async function addAdminAuditEntry(params: {
  actorEmail: string
  action: string
  targetUserId?: string | null
  targetEmail?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}) {
  const entry: AdminAuditEntry = {
    id: makeId(),
    actorEmail: params.actorEmail,
    action: params.action,
    targetUserId: params.targetUserId ?? null,
    targetEmail: params.targetEmail ?? null,
    reason: params.reason ?? null,
    metadata: params.metadata,
    createdAt: nowIso(),
  }

  const db = await getDb()
  if (!db) {
    inMemoryAudit.unshift(entry)
    return entry
  }

  const col = db.collection<AdminAuditDoc>(COLLECTION)
  await col.insertOne({
    _id: entry.id,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetUserId: entry.targetUserId,
    targetEmail: entry.targetEmail,
    reason: entry.reason,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
  })

  return entry
}
