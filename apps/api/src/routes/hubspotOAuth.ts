import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env'
import { getDb } from '../db'
import { requireAdmin } from '../auth/requireAdmin'

const HUBSPOT_AUTH_BASE_URL = 'https://app-eu1.hubspot.com/oauth'
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const HUBSPOT_TOKEN_INFO_URL = 'https://api.hubapi.com/oauth/v1/access-tokens'

/**
 * OAuth routes for HubSpot Knowledge Base API access
 * - /authorize: Redirects admin to HubSpot OAuth consent screen
 * - /callback: Receives authorization code and exchanges for tokens
 */
export const hubspotOAuthRoutes: FastifyPluginAsync = async (app) => {
  // Protect all routes except /callback (which is a browser redirect from HubSpot).
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/callback')) return
    const ok = await requireAdmin(req, reply)
    if (!ok) return reply
  })

  /**
   * GET /api/hubspot/oauth/authorize
   * Initiates OAuth flow by redirecting to HubSpot
   */
  app.get('/authorize', async (request, reply) => {
    const clientId = env.HUBSPOT_OAUTH_CLIENT_ID
    const redirectUri = env.HUBSPOT_OAUTH_REDIRECT_URI

    if (!clientId || !redirectUri) {
      return reply.status(500).send({
        error: 'OAUTH_NOT_CONFIGURED',
        message: 'HubSpot OAuth credentials not configured',
      })
    }

    // Build authorization URL with Knowledge Base scopes
    const scopes = [
      'oauth',
      'cms.knowledge_base.articles.read',
      'cms.knowledge_base.articles.write',
      'cms.knowledge_base.articles.publish',
      'cms.knowledge_base.settings.read',
      'cms.knowledge_base.settings.write',
    ]

    const authUrl = new URL(`${HUBSPOT_AUTH_BASE_URL}/authorize`)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes.join(' '))

    reply.redirect(authUrl.toString())
  })

  /**
   * GET /api/hubspot/oauth/callback
   * Handles OAuth callback from HubSpot
   */
  app.get('/callback', async (request, reply) => {
    const QuerySchema = z.object({
      code: z.string().min(1),
      error: z.string().optional(),
    })

    const parsed = QuerySchema.safeParse(request.query)

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_CALLBACK',
        message: 'Missing authorization code',
      })
    }

    const { code, error } = parsed.data

    if (error) {
      return reply.status(400).send({
        error: 'OAUTH_ERROR',
        message: `HubSpot returned error: ${error}`,
      })
    }

    // Exchange code for tokens
    try {
      const clientId = env.HUBSPOT_OAUTH_CLIENT_ID
      const clientSecret = env.HUBSPOT_OAUTH_CLIENT_SECRET
      const redirectUri = env.HUBSPOT_OAUTH_REDIRECT_URI

      if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('OAuth credentials not configured')
      }

      const tokenResponse = await fetch(HUBSPOT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('[hubspot-oauth] Token exchange failed:', errorText)
        throw new Error(`Token exchange failed: ${tokenResponse.status}`)
      }

      const TokenResponseSchema = z.object({
        access_token: z.string(),
        refresh_token: z.string(),
        expires_in: z.number(),
      })

      const tokens = TokenResponseSchema.parse(await tokenResponse.json())

      // Store tokens in database
      await storeHubSpotOAuthTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      })

      console.log('[hubspot-oauth] Successfully stored OAuth tokens')

      // Redirect to admin settings page with success message
      const portalUrl = env.PORTAL_BASE_URL || 'http://localhost:5173'
      return reply.redirect(`${portalUrl}/admin/settings?hubspot_connected=true`)
    } catch (error) {
      console.error('[hubspot-oauth] Callback error:', error)
      return reply.status(500).send({
        error: 'TOKEN_EXCHANGE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * DELETE /api/hubspot/oauth/disconnect
   * Removes stored OAuth tokens
   */
  app.delete('/disconnect', async (request, reply) => {
    try {
      await clearHubSpotOAuthTokens()
      return reply.send({ success: true })
    } catch (error) {
      console.error('[hubspot-oauth] Disconnect error:', error)
      return reply.status(500).send({
        error: 'DISCONNECT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/hubspot/oauth/status
   * Check if OAuth tokens are configured
   */
  app.get('/status', async (request, reply) => {
    try {
      const tokens = await getHubSpotOAuthTokens()
      return reply.send({
        connected: !!tokens,
        expiresAt: tokens?.expiresAt || null,
      })
    } catch (error) {
      return reply.send({ connected: false, expiresAt: null })
    }
  })

  app.get('/debug', async (request, reply) => {
    if (env.NODE_ENV !== 'development') {
      return reply.status(404).send({ error: 'NOT_FOUND' })
    }

    const tokens = await getHubSpotOAuthTokens()
    if (!tokens?.accessToken) {
      return reply.status(400).send({ error: 'NO_TOKEN', message: 'No OAuth access token found.' })
    }

    const res = await fetch(`${HUBSPOT_TOKEN_INFO_URL}/${encodeURIComponent(tokens.accessToken)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = await res.json().catch(() => ({}))
    return reply.status(res.status).send(payload)
  })
}

// Token storage in MongoDB settings collection, with in-memory fallback.
type HubSpotOAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

let inMemoryTokens: HubSpotOAuthTokens | null = null

async function storeHubSpotOAuthTokens(tokens: HubSpotOAuthTokens) {
  const db = await getDb()
  if (!db) {
    // In-memory fallback — tokens will survive until the process restarts.
    inMemoryTokens = tokens
    console.warn('[hubspot-oauth] MongoDB not configured; tokens stored in memory only.')
    return
  }
  await db.collection('settings').updateOne(
    { _id: 'hubspot_oauth' } as any,
    {
      $set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  )
}

export async function getHubSpotOAuthTokens(): Promise<HubSpotOAuthTokens | null> {
  const db = await getDb()
  if (!db) return inMemoryTokens
  const doc = await db.collection('settings').findOne({ _id: 'hubspot_oauth' } as any)
  
  if (!doc || !doc.accessToken || !doc.refreshToken) {
    return null
  }

  return {
    accessToken: doc.accessToken,
    refreshToken: doc.refreshToken,
    expiresAt: doc.expiresAt,
  }
}

export async function refreshHubSpotOAuthToken(): Promise<string> {
  const tokens = await getHubSpotOAuthTokens()
  
  if (!tokens) {
    throw new Error('No OAuth tokens found. Please connect HubSpot first.')
  }

  const clientId = env.HUBSPOT_OAUTH_CLIENT_ID
  const clientSecret = env.HUBSPOT_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('OAuth credentials not configured')
  }

  const tokenResponse = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('[hubspot-oauth] Token refresh failed:', errorText)
    throw new Error(`Token refresh failed: ${tokenResponse.status}`)
  }

  const TokenResponseSchema = z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
  })

  const newTokens = TokenResponseSchema.parse(await tokenResponse.json())

  await storeHubSpotOAuthTokens({
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token,
    expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
  })

  console.log('[hubspot-oauth] Successfully refreshed access token')

  return newTokens.access_token
}

async function clearHubSpotOAuthTokens() {
  const db = await getDb()
  if (!db) {
    inMemoryTokens = null
    return
  }
  await db.collection('settings').deleteOne({ _id: 'hubspot_oauth' } as any)
}
