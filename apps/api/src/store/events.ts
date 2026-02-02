import { getDb } from '../db'
import { env } from '../env'
import type { EventDto } from '../routes/events'

const COLLECTION = 'events'

export const demoEvents: EventDto[] = [
  {
    id: '1',
    title: 'Lunch & Learn: Getting started',
    description: 'A practical walkthrough of the portal, event registrations, and where to find resources.',
    type: 'Lunch & Learn',
    startAt: '2026-01-18T12:00:00Z',
    dateLabel: 'Thu 18 Jan · 12:00',
    timezoneLabel: 'UK time',
    status: 'published',
    completed: false,
    eligibility: 'both',
    eligibilityLabel: 'Customers & non-customers',
    provision: 'all',
    provisionLabel: 'All provision types',
    priceForNonCustomers: 25,
    durationMins: 60,
    commentsCount: 8,
    registeredCount: 12,
    attendeesCount: 9,
    noShowCount: 3,
    emailStats: {
      sent: 120,
      delivered: 118,
      bounced: 2,
      ctr: 18.4,
    },
    hostName: 'Molly Taylor',
    hostTitle: 'Customer Success Manager',
    platform: 'Teams',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/placeholder',
  },
  {
    id: '2',
    title: 'Webinar: Reporting basics',
    description: 'Learn the core reports, export options, and a simple monthly review workflow.',
    type: 'Webinar',
    startAt: '2026-01-29T10:00:00Z',
    dateLabel: 'Mon 29 Jan · 10:00',
    timezoneLabel: 'UK time',
    status: 'draft',
    completed: false,
    eligibility: 'customer',
    eligibilityLabel: 'Customers only',
    provision: 'childrens-home',
    provisionLabel: 'Children’s homes',
    priceForNonCustomers: null,
    durationMins: 45,
    commentsCount: 12,
    registeredCount: 24,
    attendeesCount: 0,
    noShowCount: 0,
    emailStats: {
      sent: 0,
      delivered: 0,
      bounced: 0,
      ctr: 0,
    },
    hostName: 'Chris Stone',
    hostTitle: 'Mentor Training Lead',
    platform: 'Riverside',
    joinUrl: 'https://riverside.fm/studio/placeholder',
  },
  {
    id: '3',
    title: 'Podcast: Implementation stories',
    description: 'Real-world implementation tips, pitfalls to avoid, and what success looks like.',
    type: 'Podcast',
    startAt: '2026-02-02T11:00:00Z',
    dateLabel: 'Fri 2 Feb · 11:00',
    timezoneLabel: 'UK time',
    status: 'published',
    completed: false,
    eligibility: 'non-customer',
    eligibilityLabel: 'Non-customers',
    provision: 'supported-accommodation',
    provisionLabel: 'Supported accommodation',
    priceForNonCustomers: 15,
    durationMins: 30,
    commentsCount: 3,
    registeredCount: 7,
    attendeesCount: 0,
    noShowCount: 0,
    emailStats: {
      sent: 0,
      delivered: 0,
      bounced: 0,
      ctr: 0,
    },
    hostName: 'Hannah Patel',
    hostTitle: 'Implementation Specialist',
    platform: 'Teams',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/placeholder',
  },
  {
    id: '4',
    title: 'Webinar: Outcomes and audit readiness',
    description: 'A checklist-driven session to prepare for audits with consistent evidence and reporting.',
    type: 'Webinar',
    startAt: '2026-02-12T14:00:00Z',
    dateLabel: 'Thu 12 Feb · 14:00',
    timezoneLabel: 'UK time',
    status: 'published',
    completed: false,
    eligibility: 'customer',
    eligibilityLabel: 'Customers only',
    provision: 'all',
    provisionLabel: 'All provision types',
    priceForNonCustomers: null,
    durationMins: 60,
    commentsCount: 5,
    registeredCount: 16,
    attendeesCount: 0,
    noShowCount: 0,
    emailStats: {
      sent: 0,
      delivered: 0,
      bounced: 0,
      ctr: 0,
    },
    hostName: 'Support Team',
    hostTitle: 'Mentor',
    platform: 'Teams',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/placeholder',
  },
  {
    id: '5',
    title: 'Lunch & Learn: Best practice templates',
    description: 'What to download, how to version templates, and how teams keep them consistent.',
    type: 'Lunch & Learn',
    startAt: '2026-03-04T12:00:00Z',
    dateLabel: 'Wed 4 Mar · 12:00',
    timezoneLabel: 'UK time',
    status: 'published',
    completed: false,
    eligibility: 'both',
    eligibilityLabel: 'Customers & non-customers',
    provision: 'over-18',
    provisionLabel: '18+ provision',
    priceForNonCustomers: 25,
    durationMins: 60,
    commentsCount: 9,
    registeredCount: 18,
    attendeesCount: 0,
    noShowCount: 0,
    emailStats: {
      sent: 0,
      delivered: 0,
      bounced: 0,
      ctr: 0,
    },
    hostName: 'Molly Taylor',
    hostTitle: 'Customer Success Manager',
    platform: 'Teams',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/placeholder',
  },
  {
    id: '6',
    title: 'Webinar: Using meetings effectively',
    description: 'Get the most from training and success meetings with agendas and follow-ups.',
    type: 'Webinar',
    startAt: '2026-03-18T10:00:00Z',
    dateLabel: 'Wed 18 Mar · 10:00',
    timezoneLabel: 'UK time',
    status: 'published',
    completed: false,
    eligibility: 'customer',
    eligibilityLabel: 'Customers only',
    provision: 'all',
    provisionLabel: 'All provision types',
    priceForNonCustomers: null,
    durationMins: 45,
    commentsCount: 2,
    registeredCount: 6,
    attendeesCount: 0,
    noShowCount: 0,
    emailStats: {
      sent: 0,
      delivered: 0,
      bounced: 0,
      ctr: 0,
    },
    hostName: 'Mentor Training',
    hostTitle: 'Team',
    platform: 'Riverside',
    joinUrl: 'https://riverside.fm/studio/placeholder',
  },
]

type EventDoc = EventDto & { _id: string }

export async function seedDemoEventsIfEmpty() {
  const db = await getDb()
  if (!db) return

  const col = db.collection<EventDoc>(COLLECTION)
  const count = await col.countDocuments()
  if (count > 0) return

  await col.insertMany(demoEvents.map((e) => ({ ...e, _id: e.id })))
}

export async function listEventsStore(): Promise<EventDto[]> {
  const db = await getDb()
  if (!db) return env.DEMO_EVENTS_ENABLED ? demoEvents : []

  const col = db.collection<EventDoc>(COLLECTION)
  const docs = await col.find({}, { projection: { _id: 0 } }).sort({ startAt: 1 }).toArray()
  return docs
}

export async function getEventByIdStore(id: string): Promise<EventDto | null> {
  const db = await getDb()
  if (!db) return env.DEMO_EVENTS_ENABLED ? demoEvents.find((e) => e.id === id) ?? null : null

  const col = db.collection<EventDoc>(COLLECTION)
  const doc = await col.findOne({ _id: id }, { projection: { _id: 0 } })
  return doc ?? null
}

export async function updateEventStore(id: string, patch: Partial<EventDto>): Promise<EventDto | null> {
  const db = await getDb()
  if (!db) {
    if (!env.DEMO_EVENTS_ENABLED) return null
    const idx = demoEvents.findIndex((e) => e.id === id)
    if (idx === -1) return null
    demoEvents[idx] = { ...demoEvents[idx], ...patch }
    return demoEvents[idx]
  }

  const col = db.collection<EventDoc>(COLLECTION)
  const res = await col.findOneAndUpdate(
    { _id: id },
    { $set: patch },
    { projection: { _id: 0 }, returnDocument: 'after' },
  )
  return res.value ?? null
}

export async function cancelEventStore(id: string): Promise<EventDto | null> {
  return updateEventStore(id, { status: 'cancelled' })
}
