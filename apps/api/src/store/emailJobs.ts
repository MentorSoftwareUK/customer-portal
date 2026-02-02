import { getDb } from '../db'

export type EmailJobType = 'event_confirmation' | 'event_reminder' | 'event_thank_you'
export type EmailJobStatus = 'pending' | 'sending' | 'sent' | 'failed'

export type EmailJob = {
  id: string
  type: EmailJobType
  to: string

  runAt: string
  status: EmailJobStatus
  attempts: number

  createdAt: string
  updatedAt: string

  lockedAt?: string
  sentAt?: string
  lastError?: string

  payload: {
    eventId: string
    registrationId: string
  }
}

type EmailJobDoc = EmailJob & { _id: string }

const COLLECTION = 'email_jobs'

// In-memory fallback for when MongoDB isn't configured.
const jobsById = new Map<string, EmailJob>()

export async function createEmailJob(job: EmailJob): Promise<EmailJob> {
  const db = await getDb()
  if (!db) {
    const existing = jobsById.get(job.id)
    if (existing) return existing
    jobsById.set(job.id, job)
    return job
  }

  const col = db.collection<EmailJobDoc>(COLLECTION)
  await col.updateOne(
    { _id: job.id },
    { $setOnInsert: { ...job, _id: job.id } },
    { upsert: true }
  )
  return job
}

export async function claimDueEmailJobs(params: {
  nowIso: string
  limit: number
}): Promise<EmailJob[]> {
  const db = await getDb()

  if (!db) {
    const now = Date.parse(params.nowIso)
    const due = [...jobsById.values()]
      .filter((j) => j.status === 'pending')
      .filter((j) => Date.parse(j.runAt) <= now)
      .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt))
      .slice(0, params.limit)

    for (const j of due) {
      j.status = 'sending'
      j.attempts += 1
      j.lockedAt = params.nowIso
      j.updatedAt = params.nowIso
    }

    return due
  }

  const col = db.collection<EmailJobDoc>(COLLECTION)

  const claimed: EmailJob[] = []
  for (let i = 0; i < params.limit; i++) {
    const res = await col.findOneAndUpdate(
      { status: 'pending', runAt: { $lte: params.nowIso } },
      {
        $set: { status: 'sending', lockedAt: params.nowIso, updatedAt: params.nowIso },
        $inc: { attempts: 1 },
      },
      {
        sort: { runAt: 1 },
        returnDocument: 'after',
        projection: { _id: 0 },
      }
    )

    if (!res) break
    claimed.push(res)
  }

  return claimed
}

export async function markEmailJobSent(params: { id: string; nowIso: string }): Promise<void> {
  const db = await getDb()
  if (!db) {
    const j = jobsById.get(params.id)
    if (!j) return
    j.status = 'sent'
    j.sentAt = params.nowIso
    j.updatedAt = params.nowIso
    return
  }

  const col = db.collection<EmailJobDoc>(COLLECTION)
  await col.updateOne(
    { _id: params.id },
    { $set: { status: 'sent', sentAt: params.nowIso, updatedAt: params.nowIso } }
  )
}

export async function markEmailJobFailed(params: {
  id: string
  nowIso: string
  error: string
  retryAtIso?: string
}): Promise<void> {
  const db = await getDb()

  const nextStatus: EmailJobStatus = params.retryAtIso ? 'pending' : 'failed'
  const updates: Partial<EmailJob> = {
    status: nextStatus,
    lastError: params.error,
    updatedAt: params.nowIso,
  }
  if (params.retryAtIso) {
    updates.runAt = params.retryAtIso
    updates.lockedAt = undefined
  }

  if (!db) {
    const j = jobsById.get(params.id)
    if (!j) return
    j.status = nextStatus
    j.lastError = params.error
    j.updatedAt = params.nowIso
    if (params.retryAtIso) {
      j.runAt = params.retryAtIso
      j.lockedAt = undefined
    }
    return
  }

  const col = db.collection<EmailJobDoc>(COLLECTION)
  await col.updateOne({ _id: params.id }, { $set: updates })
}
