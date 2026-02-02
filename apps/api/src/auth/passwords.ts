import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { env } from '../env'
import { getDb } from '../db'

function scryptAsync(password: Buffer, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey as Buffer)
    })
  })
}

export type AuthPasswordRecord = {
  email: string
  salt: string
  hash: string
  createdAt: string
  updatedAt: string
}

type AuthPasswordDoc = AuthPasswordRecord & { _id: string }

const COLLECTION = 'auth_passwords'

// In-memory fallback for when MongoDB isn't configured.
const passwordsByEmail = new Map<string, AuthPasswordRecord>()

function nowIso() {
  return new Date().toISOString()
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function buildPasswordInput(email: string, password: string) {
  // We treat AUTH_JWT_SECRET as a pepper.
  const h = createHash('sha256')
  h.update(env.AUTH_JWT_SECRET)
  h.update('|')
  h.update(normalizeEmail(email))
  h.update('|')
  h.update(password)
  return h.digest()
}

async function deriveHash(params: { email: string; password: string; salt: Buffer }) {
  const input = buildPasswordInput(params.email, params.password)
  const key = await scryptAsync(input, params.salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  })
  return key
}

export async function hasPassword(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email)
  const db = await getDb()

  if (!db) return passwordsByEmail.has(normalized)

  const col = db.collection<AuthPasswordDoc>(COLLECTION)
  const doc = await col.findOne({ _id: normalized }, { projection: { _id: 1 } })
  return Boolean(doc)
}

export async function setPassword(params: { email: string; password: string }): Promise<void> {
  const normalized = normalizeEmail(params.email)
  const salt = randomBytes(16)
  const hash = await deriveHash({ email: normalized, password: params.password, salt })

  const now = nowIso()
  const record: AuthPasswordRecord = {
    email: normalized,
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  if (!db) {
    const existing = passwordsByEmail.get(normalized)
    if (existing) {
      record.createdAt = existing.createdAt
    }
    passwordsByEmail.set(normalized, record)
    return
  }

  const col = db.collection<AuthPasswordDoc>(COLLECTION)
  const existing = await col.findOne({ _id: normalized }, { projection: { createdAt: 1 } })
  if (existing?.createdAt) record.createdAt = existing.createdAt

  await col.updateOne(
    { _id: normalized },
    { $set: { ...record, _id: normalized } },
    { upsert: true },
  )
}

export async function verifyPassword(params: { email: string; password: string }): Promise<boolean> {
  const normalized = normalizeEmail(params.email)
  const db = await getDb()

  let record: AuthPasswordRecord | null
  if (!db) {
    record = passwordsByEmail.get(normalized) ?? null
  } else {
    const col = db.collection<AuthPasswordDoc>(COLLECTION)
    const doc = await col.findOne({ _id: normalized }, { projection: { _id: 0 } })
    record = doc ?? null
  }

  if (!record) return false

  const expected = Buffer.from(record.hash, 'hex')
  const salt = Buffer.from(record.salt, 'hex')
  const actual = await deriveHash({ email: normalized, password: params.password, salt })
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
