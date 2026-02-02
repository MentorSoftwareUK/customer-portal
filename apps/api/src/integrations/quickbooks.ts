import { env } from '../env'

export function requireQuickBooksClientCredentials() {
  if (!env.QUICKBOOKS_CLIENT_ID || !env.QUICKBOOKS_CLIENT_SECRET) {
    throw new Error('Missing QuickBooks client credentials')
  }

  return {
    clientId: env.QUICKBOOKS_CLIENT_ID,
    clientSecret: env.QUICKBOOKS_CLIENT_SECRET,
  }
}
