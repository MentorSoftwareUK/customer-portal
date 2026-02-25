import { getDb } from '../db'
import type { EventDto } from '../routes/events'

const COLLECTION = 'events'

/* Demo events removed — the store returns [] when MongoDB is unavailable. */

type EventDoc = EventDto & { _id: string }

export async function seedDemoEventsIfEmpty() {
  // No-op — demo events have been removed.
}

export async function listEventsStore(): Promise<EventDto[]> {
  const db = await getDb()
  if (!db) return []

  const col = db.collection<EventDoc>(COLLECTION)
  const docs = await col.find({}, { projection: { _id: 0 } }).sort({ startAt: 1 }).toArray()
  return docs
}

export async function getEventByIdStore(id: string): Promise<EventDto | null> {
  const db = await getDb()
  if (!db) return null

  const col = db.collection<EventDoc>(COLLECTION)
  const doc = await col.findOne({ _id: id }, { projection: { _id: 0 } })
  return doc ?? null
}

export async function updateEventStore(id: string, patch: Partial<EventDto>): Promise<EventDto | null> {
  const db = await getDb()
  if (!db) {
    return null
  }

  const col = db.collection<EventDoc>(COLLECTION)
  const res = await col.findOneAndUpdate(
    { _id: id },
    { $set: patch },
    { projection: { _id: 0 }, returnDocument: 'after' },
  )
  return res ?? null
}

export async function cancelEventStore(id: string): Promise<EventDto | null> {
  return updateEventStore(id, { status: 'cancelled' })
}

export async function createEventStore(data: EventDto): Promise<EventDto> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const col = db.collection<EventDoc>(COLLECTION)
  await col.insertOne({ ...data, _id: data.id } as EventDoc)
  return data
}
