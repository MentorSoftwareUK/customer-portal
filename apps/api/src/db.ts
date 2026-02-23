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
