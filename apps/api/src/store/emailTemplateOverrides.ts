import { getDb } from '../db'

export type EmailTemplateKey =
  | 'event_invite'
  | 'event_confirmation'
  | 'event_reminder'
  | 'event_thank_you'

export type EmailTemplateOverride = {
  key: EmailTemplateKey
  subject: string | null
  html: string | null
  text: string | null
  updatedAtIso: string
}

type EmailTemplateDoc = {
  _id: EmailTemplateKey
  subject?: string | null
  html?: string | null
  text?: string | null
  updatedAtIso: string
}

const COLLECTION = 'email_template_overrides'

const inMemory = new Map<EmailTemplateKey, EmailTemplateOverride>()

function toOverride(doc: EmailTemplateDoc): EmailTemplateOverride {
  return {
    key: doc._id,
    subject: doc.subject ?? null,
    html: doc.html ?? null,
    text: doc.text ?? null,
    updatedAtIso: doc.updatedAtIso,
  }
}

export async function listEmailTemplateOverrides(): Promise<EmailTemplateOverride[]> {
  const db = await getDb()
  if (!db) return Array.from(inMemory.values())

  const docs = (await db
    .collection<EmailTemplateDoc>(COLLECTION)
    .find({}, { projection: { subject: 1, html: 1, text: 1, updatedAtIso: 1 } })
    .toArray()) as EmailTemplateDoc[]

  return docs.map(toOverride)
}

export async function getEmailTemplateOverride(key: EmailTemplateKey): Promise<EmailTemplateOverride | null> {
  const db = await getDb()
  if (!db) return inMemory.get(key) ?? null

  const doc = await db
    .collection<EmailTemplateDoc>(COLLECTION)
    .findOne({ _id: key }, { projection: { subject: 1, html: 1, text: 1, updatedAtIso: 1 } })

  return doc ? toOverride(doc) : null
}

export async function upsertEmailTemplateOverride(
  key: EmailTemplateKey,
  patch: { subject?: string | null; html?: string | null; text?: string | null },
): Promise<EmailTemplateOverride | null> {
  const next: EmailTemplateOverride = {
    key,
    subject: patch.subject ?? null,
    html: patch.html ?? null,
    text: patch.text ?? null,
    updatedAtIso: new Date().toISOString(),
  }

  const hasAny = Boolean((next.subject && next.subject.trim()) || (next.html && next.html.trim()) || (next.text && next.text.trim()))

  const db = await getDb()
  if (!db) {
    if (!hasAny) {
      inMemory.delete(key)
      return null
    }
    inMemory.set(key, next)
    return next
  }

  if (!hasAny) {
    await db.collection<EmailTemplateDoc>(COLLECTION).deleteOne({ _id: key })
    return null
  }

  await db.collection<EmailTemplateDoc>(COLLECTION).updateOne(
    { _id: key },
    {
      $set: {
        subject: next.subject,
        html: next.html,
        text: next.text,
        updatedAtIso: next.updatedAtIso,
      },
    },
    { upsert: true },
  )

  return next
}

export async function deleteEmailTemplateOverride(key: EmailTemplateKey): Promise<void> {
  const db = await getDb()
  if (!db) {
    inMemory.delete(key)
    return
  }
  await db.collection<EmailTemplateDoc>(COLLECTION).deleteOne({ _id: key })
}
