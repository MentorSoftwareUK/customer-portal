import { SignJWT, jwtVerify } from 'jose'
import { createSecretKey } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { env } from '../env'

export type AuthViewerType = 'customer' | 'non-customer'

export type AuthTokenPayload = {
  email: string
  viewerType: AuthViewerType
  hubspotContactId: string | null
  isLiveCustomer: boolean | null
  provisionType: 'supported-accommodation' | 'childrens-home' | 'over-18' | null
  productVersion: 'v2' | 'v3' | null
  jobTitle: string | null
  buyingRole: string | null
  canEditCompany: boolean
  isAdmin: boolean
  adminRoles?: string[]
}

const ISSUER = 'mentor-cp'

function getJwtKey() {
  return createSecretKey(Buffer.from(env.AUTH_JWT_SECRET, 'utf8'))
}

export async function signAccessToken(payload: AuthTokenPayload) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + env.AUTH_TOKEN_TTL_HOURS * 60 * 60

  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(payload.email)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getJwtKey())
}

export async function verifyAccessToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtKey(), { issuer: ISSUER })

  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!email) throw new Error('Invalid token payload')

  return {
    email,
    viewerType: payload.viewerType === 'customer' ? 'customer' : 'non-customer',
    hubspotContactId: typeof payload.hubspotContactId === 'string' ? payload.hubspotContactId : null,
    isLiveCustomer: typeof payload.isLiveCustomer === 'boolean' ? payload.isLiveCustomer : null,
    provisionType:
      payload.provisionType === 'supported-accommodation' ||
      payload.provisionType === 'childrens-home' ||
      payload.provisionType === 'over-18'
        ? payload.provisionType
        : null,
    productVersion: payload.productVersion === 'v2' || payload.productVersion === 'v3' ? payload.productVersion : null,
    jobTitle: typeof payload.jobTitle === 'string' ? payload.jobTitle : null,
    buyingRole: typeof payload.buyingRole === 'string' ? payload.buyingRole : null,
    canEditCompany: payload.canEditCompany === true,
    isAdmin: payload.isAdmin === true,
    adminRoles: Array.isArray(payload.adminRoles)
      ? payload.adminRoles.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim().toLowerCase())
      : [],
  }
}

export function getBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') return null
  if (!token?.trim()) return null
  return token.trim()
}
