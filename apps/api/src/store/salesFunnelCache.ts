import { getDb } from '../db'
import type { SalesFunnelDto } from '../routes/adminSalesFunnel'

const COLLECTION = 'sales_funnel_cache'

export interface SalesFunnelCacheDoc {
  _id: string // monthKey e.g. "2026-02"
  data: SalesFunnelDto
  updatedAt: Date
}

/**
 * Return the cached funnel data for a month, or null if not cached.
 */
export async function getCachedFunnel(
  monthKey: string,
): Promise<SalesFunnelCacheDoc | null> {
  const db = await getDb()
  if (!db) return null
  return db
    .collection<SalesFunnelCacheDoc>(COLLECTION)
    .findOne({ _id: monthKey })
}

/**
 * Upsert funnel data for a month.
 */
export async function setCachedFunnel(
  monthKey: string,
  data: SalesFunnelDto,
): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.collection<SalesFunnelCacheDoc>(COLLECTION).updateOne(
    { _id: monthKey },
    { $set: { _id: monthKey, data, updatedAt: new Date() } },
    { upsert: true },
  )
}
