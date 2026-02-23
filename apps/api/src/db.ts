import { MongoClient, type Db } from 'mongodb'
import { env } from './env'

let client: MongoClient | null = null
let db: Db | null = null
let connectionFailed = false

export function isMongoConfigured() {
  return Boolean(env.MONGODB_URI && env.MONGODB_URI.trim() && !env.MONGODB_URI.startsWith('memory:'))
}

export async function getDb(): Promise<Db | null> {
  if (!isMongoConfigured()) return null
  if (db) return db
  if (connectionFailed) return null

  try {
    client = new MongoClient(env.MONGODB_URI as string, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
    })
    await client.connect()
    db = client.db(env.MONGODB_DB)
    return db
  } catch (err) {
    // If Mongo is misconfigured or unreachable, fall back to in-memory demo data.
    console.error('[mongo] connection failed; falling back to demo data', err)
    client = null
    db = null
    connectionFailed = true
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
