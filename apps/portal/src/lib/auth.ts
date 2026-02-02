const USER_TOKEN_KEY = 'accessToken'
const ADMIN_TOKEN_KEY = 'adminAccessToken'

function readToken(key: string): string | null {
  try {
    const t = localStorage.getItem(key)
    return t && t.trim() ? t : null
  } catch {
    return null
  }
}

function writeToken(key: string, token: string): void {
  try {
    localStorage.setItem(key, token)
  } catch {
    // ignore
  }
}

function removeToken(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function getUserAccessToken(): string | null {
  return readToken(USER_TOKEN_KEY)
}

export function setUserAccessToken(token: string): void {
  writeToken(USER_TOKEN_KEY, token)
}

export function clearUserAccessToken(): void {
  removeToken(USER_TOKEN_KEY)
}

export function getAdminAccessToken(): string | null {
  return readToken(ADMIN_TOKEN_KEY)
}

export function setAdminAccessToken(token: string): void {
  writeToken(ADMIN_TOKEN_KEY, token)
}

export function clearAdminAccessToken(): void {
  removeToken(ADMIN_TOKEN_KEY)
}

export function clearAllTokens(): void {
  clearUserAccessToken()
  clearAdminAccessToken()
}

// Non-validated decode for display only.
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  if (typeof exp !== 'number') return false
  // exp is seconds since epoch
  return Date.now() >= exp * 1000
}

export function handleUnauthorized(context: 'user' | 'admin' = 'user'): void {
  if (context === 'admin') {
    clearAdminAccessToken()
    try {
      if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login'
      }
    } catch {
      // ignore
    }
    return
  }

  clearUserAccessToken()
  try {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  } catch {
    // ignore
  }
}
