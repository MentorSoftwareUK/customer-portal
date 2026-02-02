import { randomInt, createHash } from 'node:crypto'
import { env } from '../env'
import { getDb } from '../db'

export type AuthCodeRecord = {
  email: string
  codeHash: string
  createdAt: string
  expiresAt: string
}

type AuthCodeDoc = AuthCodeRecord & { _id: string }

const COLLECTION = 'auth_codes'

// In-memory fallback for when MongoDB isn't configured.
const codesByEmail = new Map<string, AuthCodeRecord>()

function nowIso() {
  return new Date().toISOString()
}

function minutesFromNowIso(mins: number) {
  return new Date(Date.now() + mins * 60_000).toISOString()
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hashCode(email: string, code: string) {
  const h = createHash('sha256')
  h.update(env.AUTH_JWT_SECRET)
  h.update('|')
  h.update(normalizeEmail(email))
  h.update('|')
  h.update(code)
  return h.digest('hex')
}

function generateNumericCode(length: number) {
  const max = 10 ** length
  const n = randomInt(0, max)
  return String(n).padStart(length, '0')
}

export async function createAuthCode(email: string) {
  const normalized = normalizeEmail(email)
  const code = generateNumericCode(6)
  const record: AuthCodeRecord = {
    email: normalized,
    codeHash: hashCode(normalized, code),
    createdAt: nowIso(),
    expiresAt: minutesFromNowIso(env.AUTH_CODE_TTL_MINS),
  }

  const db = await getDb()
  if (!db) {
    codesByEmail.set(normalized, record)
    return { code, record }
  }

  const col = db.collection<AuthCodeDoc>(COLLECTION)
  await col.updateOne(
    { _id: normalized },
    { $set: { ...record, _id: normalized } },
    { upsert: true },
  )

  return { code, record }
}

export async function verifyAndConsumeAuthCode(params: { email: string; code: string }) {
  const email = normalizeEmail(params.email)
  const code = params.code.trim()

  const db = await getDb()

  let record: AuthCodeRecord | null
  if (!db) {
    record = codesByEmail.get(email) ?? null
  } else {
    const col = db.collection<AuthCodeDoc>(COLLECTION)
    const doc = await col.findOne({ _id: email }, { projection: { _id: 0 } })
    record = doc ?? null
  }

  if (!record) return { ok: false as const, error: 'not_found' as const }

  const expired = Date.parse(record.expiresAt) <= Date.now()
  if (expired) {
    await consumeAuthCode(email)
    return { ok: false as const, error: 'expired' as const }
  }

  const expected = record.codeHash
  const actual = hashCode(email, code)
  if (expected !== actual) return { ok: false as const, error: 'invalid' as const }

  await consumeAuthCode(email)
  return { ok: true as const }
}

async function consumeAuthCode(email: string) {
  const db = await getDb()
  if (!db) {
    codesByEmail.delete(email)
    return
  }
  const col = db.collection<AuthCodeDoc>(COLLECTION)
  await col.deleteOne({ _id: email })
}
