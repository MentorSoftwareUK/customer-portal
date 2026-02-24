import { MongoClient, type Db } from 'mongodb'
import { env } from './env'

let client: MongoClient | null = null
let db: Db | null = null
let failedAt = 0
const RETRY_INTERVAL_MS = 30_000 // retry after 30 s

export function isMongoConfigured() {
  return Boolean(env.MONGODB_URI && env.MONGODB_URI.trim() && !env.MONGODB_URI.startsWith('memory:'))
}

export async function getDb(): Promise<Db | null> {
  if (!isMongoConfigured()) return null
  if (db) return db
  // If a recent attempt failed, skip retrying until the cooldown expires.
  if (failedAt && Date.now() - failedAt < RETRY_INTERVAL_MS) return null

  try {
    const uri = env.MONGODB_URI as string
    // Append retryWrites & majority write-concern if the URI doesn't already
    // include them — Atlas best practice and sometimes stabilises handshakes.
    const separator = uri.includes('?') ? '&' : '?'
    const extras: string[] = []
    if (!/retryWrites/i.test(uri)) extras.push('retryWrites=true')
    if (!/\bw=/i.test(uri)) extras.push('w=majority')
    const finalUri = extras.length ? `${uri}${separator}${extras.join('&')}` : uri

    console.log('[mongo] connecting, node=%s, openssl=%s', process.version, process.versions.openssl)

    client = new MongoClient(finalUri, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      tls: true,
      // Node 22+ (OpenSSL 3.5) rejects Atlas M0 free-tier TLS handshake
      // with alert 80 "internal error". tlsInsecure skips cert verification
      // while keeping the connection encrypted. Acceptable for M0 shared
      // clusters — upgrade to M2+ or dedicated cluster to remove this.
      tlsInsecure: true,
    })
    await client.connect()
    db = client.db(env.MONGODB_DB)
    failedAt = 0
    console.log('[mongo] connected ok')
    return db
  } catch (err) {
    console.error('[mongo] connection failed; will retry in 30 s', err)
    client = null
    db = null
    failedAt = Date.now()
    return null
  }
}

/**
 * Create indexes that speed up common queries.
 * Safe to call repeatedly — MongoDB ignores if the index already exists.
 */
export async function ensureIndexes(): Promise<void> {
  const database = await getDb()
  if (!database) return

  try {
    await Promise.all([
      database.collection('portal_users').createIndex({ email: 1 }, { unique: true, sparse: true }),
      database.collection('portal_users').createIndex({ status: 1 }),
      database.collection('events').createIndex({ startAt: 1 }),
      database.collection('events').createIndex({ status: 1 }),
      database.collection('registrations').createIndex({ eventId: 1 }),
      database.collection('registrations').createIndex({ email: 1 }),
      database.collection('auth_codes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      database.collection('audit_log').createIndex({ createdAt: -1 }),
      database.collection('email_jobs').createIndex({ status: 1, scheduledFor: 1 }),
    ])
  } catch (err) {
    console.error('[mongo] failed to create indexes', err)
  }
}
