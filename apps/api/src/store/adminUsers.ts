import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { env } from '../env'
import { getDb } from '../db'

export type AdminUserRecord = {
  email: string
  roles: string[]
  salt: string
  hash: string
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

type AdminUserDoc = AdminUserRecord & { _id: string }

const COLLECTION = 'admin_users'

const adminUsers = new Map<string, AdminUserRecord>()

function nowIso() {
  return new Date().toISOString()
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeRoles(roles: string[]): string[] {
  return roles
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
}

function scryptAsync(password: Buffer, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey as Buffer)
    })
  })
}

function buildPasswordInput(email: string, password: string) {
  const h = createHash('sha256')
  h.update(env.AUTH_JWT_SECRET)
  h.update('|admin|')
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

export async function upsertAdminUser(params: { email: string; password: string; roles: string[] }) {
  const email = normalizeEmail(params.email)
  const roles = normalizeRoles(params.roles)
  const salt = randomBytes(16)
  const hash = await deriveHash({ email, password: params.password, salt })

  const now = nowIso()
  const record: AdminUserRecord = {
    email,
    roles: roles.length ? roles : ['admin'],
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  if (!db) {
    const existing = adminUsers.get(email)
    if (existing) record.createdAt = existing.createdAt
    adminUsers.set(email, record)
    return record
  }

  const col = db.collection<AdminUserDoc>(COLLECTION)
  const existing = await col.findOne({ _id: email }, { projection: { createdAt: 1 } })
  if (existing?.createdAt) record.createdAt = existing.createdAt

  await col.updateOne({ _id: email }, { $set: { ...record, _id: email } }, { upsert: true })
  return record
}

async function getAdminUser(email: string): Promise<AdminUserRecord | null> {
  const normalized = normalizeEmail(email)
  const db = await getDb()

  if (!db) {
    return adminUsers.get(normalized) ?? null
  }

  const col = db.collection<AdminUserDoc>(COLLECTION)
  const doc = await col.findOne({ _id: normalized }, { projection: { _id: 0 } })
  return doc ?? null
}

export async function verifyAdminCredentials(params: { email: string; password: string }): Promise<AdminUserRecord | null> {
  const user = await getAdminUser(params.email)
  if (!user) return null

  const expected = Buffer.from(user.hash, 'hex')
  const salt = Buffer.from(user.salt, 'hex')
  const actual = await deriveHash({ email: user.email, password: params.password, salt })
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  const db = await getDb()
  const lastLoginAt = nowIso()
  if (!db) {
    adminUsers.set(user.email, { ...user, lastLoginAt })
  } else {
    const col = db.collection<AdminUserDoc>(COLLECTION)
    await col.updateOne({ _id: user.email }, { $set: { lastLoginAt } })
  }

  return { ...user, lastLoginAt }
}

export async function ensureSeedAdmin(log: { info: Function; warn: Function }) {
  const email = env.ADMIN_SEED_EMAIL?.trim()
  const password = env.ADMIN_SEED_PASSWORD?.trim()
  const rolesRaw = env.ADMIN_SEED_ROLES?.trim()
  const roles = rolesRaw ? rolesRaw.split(',').map((r) => r.trim()) : ['admin']

  if (!email || !password) {
    log.warn('No ADMIN_SEED_EMAIL/PASSWORD set; admin login will rely on existing tokens or manual user creation.')
    return
  }

  await upsertAdminUser({ email, password, roles })
  log.info({ email, roles }, 'Seeded admin user')
}
