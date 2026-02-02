import 'dotenv/config'
import { MongoClient } from 'mongodb'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
if (!token) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN in environment.')
  process.exit(1)
}

const mongoUri = process.env.MONGODB_URI
const mongoDb = process.env.MONGODB_DB || 'mentor_cp'
if (!mongoUri) {
  console.error('Missing MONGODB_URI in environment.')
  process.exit(1)
}

function parseDate(value) {
  if (!value) return null
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
    const d = new Date(asNumber)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateLabel(date) {
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `${day} · ${time}`
}

function pickPlatform(joinUrl) {
  const url = (joinUrl || '').toLowerCase()
  if (url.includes('teams.microsoft.com')) return 'Teams'
  if (url.includes('riverside.fm')) return 'Riverside'
  return 'TBD'
}

async function hubspotFetch(path) {
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    const error = new Error(`HubSpot request failed: ${res.status} ${res.statusText} - ${text}`)
    error.status = res.status
    throw error
  }

  return res.json()
}

async function listMarketingEvents() {
  const paths = ['/marketing/v3/marketing-events/', '/marketing/v3/marketing-events/events']
  let lastError = null

  for (const path of paths) {
    try {
      const data = await hubspotFetch(path)
      const results = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.events)
          ? data.events
          : []
      if (results.length > 0) return results
      return []
    } catch (err) {
      lastError = err
      if (err?.status === 404) continue
      throw err
    }
  }

  throw lastError || new Error('No marketing events endpoints responded.')
}

function normalizeEvent(raw) {
  const customProps = Array.isArray(raw?.customProperties) ? raw.customProperties : []
  const customMap = customProps.reduce((acc, item) => {
    if (!item?.name) return acc
    acc[item.name] = item.value
    return acc
  }, {})

  const webinarHost = customMap.webinar_host || customMap.webinarHost || null
  const provisionRaw = String(customMap.provision_type || customMap.provisionType || 'All').toLowerCase()
  let provision = 'all'
  let provisionLabel = 'All provision types'
  if (provisionRaw.includes('child')) {
    provision = 'childrens-home'
    provisionLabel = 'Children’s homes'
  } else if (provisionRaw.includes('supported')) {
    provision = 'supported-accommodation'
    provisionLabel = 'Supported accommodation'
  } else if (provisionRaw.includes('18') || provisionRaw.includes('over')) {
    provision = 'over-18'
    provisionLabel = '18+ provision'
  }

  const slidesRaw = customMap.webinar_slides || customMap.webinar_slides_url || ''
  const slides = String(slidesRaw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((url, index) => ({ label: `Slide deck ${index + 1}`, url }))

  const recordingUrl =
    customMap.webinar_recording_youtube ||
    customMap.webinar_recording_url ||
    customMap.webinar_recording ||
    null

  const emailStats = {
    sent: Number(customMap.email_sent ?? customMap.emailSent ?? '') || undefined,
    delivered: Number(customMap.email_delivered ?? customMap.emailDelivered ?? '') || undefined,
    bounced: Number(customMap.email_bounced ?? customMap.emailBounced ?? '') || undefined,
    ctr: Number(customMap.email_ctr ?? customMap.emailCtr ?? '') || undefined,
  }

  const title = raw?.eventName || raw?.name || raw?.title || 'Webinar'
  const description = raw?.eventDescription || raw?.description || ''
  const start =
    parseDate(raw?.startDateTime) ||
    parseDate(raw?.startDate) ||
    parseDate(raw?.startTime) ||
    parseDate(raw?.startTimestamp) ||
    parseDate(raw?.start)
  const end =
    parseDate(raw?.endDateTime) ||
    parseDate(raw?.endDate) ||
    parseDate(raw?.endTime) ||
    parseDate(raw?.endTimestamp) ||
    parseDate(raw?.end)

  return {
    id: String(raw?.id ?? raw?.eventId ?? raw?.objectId ?? title),
    title,
    description,
    startAt: start?.toISOString() ?? new Date().toISOString(),
    dateLabel: start ? formatDateLabel(start) : 'TBD',
    timezoneLabel: raw?.timeZone || raw?.timezone || 'UK time',
    status: raw?.eventStatus || raw?.eventStatusV2 || 'upcoming',
    completed: Boolean(raw?.eventCompleted),
    durationMins: start && end ? Math.max(15, Math.round((end - start) / 60000)) : 60,
    hostName: webinarHost || raw?.eventOrganizer || raw?.organizer || raw?.hostName || 'Mentor',
    hostTitle: raw?.hostTitle || undefined,
    joinUrl: raw?.eventUrl || raw?.eventLink || raw?.url || null,
    platform: pickPlatform(raw?.eventUrl || raw?.eventLink || raw?.url || ''),
    type: /webinar/i.test(title) || /webinar/i.test(raw?.eventType || '') ? 'Webinar' : 'Other',
    provision,
    provisionLabel,
    registeredCount: Number(raw?.registrants ?? 0) || 0,
    attendeesCount: Number(raw?.attendees ?? 0) || 0,
    noShowCount: Number(raw?.noShows ?? 0) || 0,
    webinarSlides: slides.length ? slides : undefined,
    webinarRecordingUrl: recordingUrl || null,
    emailStats: Object.values(emailStats).some((v) => v != null) ? emailStats : undefined,
  }
}

function isUpcoming(event) {
  const start = parseDate(event?.startAt)
  if (!start) return false
  return start.getTime() > Date.now() - 60 * 60 * 1000
}

function isWebinar(event) {
  const title = String(event?.title ?? '')
  const type = String(event?.type ?? '')
  return /webinar/i.test(title) || /webinar/i.test(type)
}

async function main() {
  const rawEvents = await listMarketingEvents()
  if (!rawEvents.length) {
    console.error('No marketing events returned from HubSpot.')
    process.exit(1)
  }

  const normalized = rawEvents.map(normalizeEvent)
  const upcoming = normalized.filter(isUpcoming)
  const webinarCandidates = (upcoming.length ? upcoming : normalized).filter(isWebinar)
  const sorted = (webinarCandidates.length ? webinarCandidates : upcoming.length ? upcoming : normalized).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )

  const nextEvent = sorted[0]
  if (!nextEvent) {
    console.error('No upcoming webinar events found to sync.')
    process.exit(1)
  }

  const eventDoc = {
    ...nextEvent,
    eligibility: 'customer',
    eligibilityLabel: 'Customers only',
    priceForNonCustomers: null,
    commentsCount: 0,
  }

  const client = new MongoClient(mongoUri)
  await client.connect()
  const db = client.db(mongoDb)
  const col = db.collection('events')

  await col.deleteMany({})
  await col.insertOne({ ...eventDoc, _id: eventDoc.id })

  await client.close()

  console.log(`Synced 1 event from HubSpot: ${eventDoc.title}`)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
