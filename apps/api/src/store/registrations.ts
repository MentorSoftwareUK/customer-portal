import { getDb } from '../db'

export type RegistrationStatus = 'registered' | 'payment_pending' | 'paid' | 'cancelled' | 'failed'
export type AttendanceStatus = 'attended' | 'no_show'

export type RegistrationRecord = {
  id: string
  eventId: string
  attendeeType: 'customer' | 'non-customer'
  hubspotContactId?: string | null
  hubspotRegistrationId?: string | null
  name: string
  email: string
  company: string
  phone: string
  customField: string
  status: RegistrationStatus
  attendanceStatus?: AttendanceStatus | null
  checkoutSessionId?: string
  createdAt: string
  paidAt?: string
}

type RegistrationDoc = RegistrationRecord & { _id: string }

const COLLECTION = 'registrations'

// In-memory fallback for when MongoDB isn't configured.
const registrationsById = new Map<string, RegistrationRecord>()
const registrationIdByCheckoutSessionId = new Map<string, string>()

export async function createRegistration(record: RegistrationRecord) {
  const db = await getDb()
  if (!db) {
    registrationsById.set(record.id, record)
    if (record.checkoutSessionId) {
      registrationIdByCheckoutSessionId.set(record.checkoutSessionId, record.id)
    }
    return record
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  await col.insertOne({ ...record, _id: record.id })
  return record
}

export async function updateRegistrationById(id: string, patch: Partial<RegistrationRecord>) {
  const db = await getDb()
  if (!db) {
    const found = registrationsById.get(id)
    if (!found) return null
    Object.assign(found, patch)
    return found
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const updated = await col.findOneAndUpdate(
    { _id: id },
    { $set: patch },
    { returnDocument: 'after', projection: { _id: 0 } },
  )
  return updated ?? null
}

export async function getRegistrationById(id: string) {
  const db = await getDb()
  if (!db) return registrationsById.get(id) ?? null

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const doc = await col.findOne({ _id: id }, { projection: { _id: 0 } })
  return doc ?? null
}

export async function getRegistrationByCheckoutSessionId(sessionId: string) {
  const db = await getDb()
  if (!db) {
    const registrationId = registrationIdByCheckoutSessionId.get(sessionId)
    if (!registrationId) return null
    return registrationsById.get(registrationId) ?? null
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const doc = await col.findOne({ checkoutSessionId: sessionId }, { projection: { _id: 0 } })
  return doc ?? null
}

export async function attachCheckoutSession(registrationId: string, sessionId: string) {
  const db = await getDb()
  if (!db) {
    const found = registrationsById.get(registrationId)
    if (!found) return null
    found.checkoutSessionId = sessionId
    registrationIdByCheckoutSessionId.set(sessionId, registrationId)
    return found
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const updated = await col.findOneAndUpdate(
    { _id: registrationId },
    { $set: { checkoutSessionId: sessionId } },
    { returnDocument: 'after', projection: { _id: 0 } }
  )
  return updated ?? null
}

export async function markRegistrationPaid(registrationId: string) {
  const db = await getDb()
  const paidAt = new Date().toISOString()
  if (!db) {
    const found = registrationsById.get(registrationId)
    if (!found) return null
    found.status = 'paid'
    found.paidAt = paidAt
    return found
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const updated = await col.findOneAndUpdate(
    { _id: registrationId },
    { $set: { status: 'paid', paidAt } },
    { returnDocument: 'after', projection: { _id: 0 } }
  )
  return updated ?? null
}

export async function markRegistrationCancelled(registrationId: string) {
  const db = await getDb()
  if (!db) {
    const found = registrationsById.get(registrationId)
    if (!found) return null
    found.status = 'cancelled'
    return found
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const updated = await col.findOneAndUpdate(
    { _id: registrationId },
    { $set: { status: 'cancelled' } },
    { returnDocument: 'after', projection: { _id: 0 } }
  )
  return updated ?? null
}

export async function markRegistrationFailed(registrationId: string) {
  const db = await getDb()
  if (!db) {
    const found = registrationsById.get(registrationId)
    if (!found) return null
    found.status = 'failed'
    return found
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const updated = await col.findOneAndUpdate(
    { _id: registrationId },
    { $set: { status: 'failed' } },
    { returnDocument: 'after', projection: { _id: 0 } }
  )
  return updated ?? null
}

export async function listRegistrationsByEmail(email: string): Promise<RegistrationRecord[]> {
  const db = await getDb()
  if (!db) {
    return [...registrationsById.values()]
      .filter((r) => r.email.toLowerCase() === email.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const docs = await col
    .find({ email }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray()
  return docs ?? []
}

export async function listRegistrationsByEventId(eventId: string): Promise<RegistrationRecord[]> {
  const db = await getDb()
  if (!db) {
    return [...registrationsById.values()]
      .filter((r) => r.eventId === eventId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const docs = await col
    .find({ eventId }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray()
  return docs ?? []
}

export async function getLatestRegistrationForEventByEmail(params: {
  eventId: string
  email: string
}): Promise<RegistrationRecord | null> {
  const db = await getDb()
  if (!db) {
    const matches = [...registrationsById.values()]
      .filter((r) => r.eventId === params.eventId)
      .filter((r) => r.email.toLowerCase() === params.email.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return matches[0] ?? null
  }

  const col = db.collection<RegistrationDoc>(COLLECTION)
  const doc = await col.findOne(
    { eventId: params.eventId, email: params.email },
    { projection: { _id: 0 }, sort: { createdAt: -1 } },
  )
  return doc ?? null
}
