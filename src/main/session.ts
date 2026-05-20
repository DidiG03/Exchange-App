import { randomBytes } from 'crypto'
import { getUserById } from '../database'
import type { User, UserRole } from '../database/types'
import { SESSION_TTL_MS } from '../shared/auth-constants'
import { clearPersistedSession, loadPersistedSession, persistSession } from './session-store'

export { SESSION_EXPIRED_CODE } from '../shared/auth-constants'

export interface Session {
  token: string
  userId: number
  username: string
  role: UserRole
  expiresAt: number
}

export interface SessionStatus {
  valid: boolean
  user?: User
  expiresAt?: number
  remainingMs?: number
}

const sessions = new Map<string, Session>()

function isExpired(session: Session): boolean {
  return Date.now() >= session.expiresAt
}

function registerSession(session: Session): Session {
  sessions.set(session.token, session)
  persistSession(session)
  return session
}

function enrichSession(session: Session): Session | null {
  if (session.role === 'admin' || session.role === 'staff') {
    return session
  }

  const user = getUserById(session.userId)
  if (!user) {
    return null
  }

  const enriched: Session = {
    ...session,
    username: user.username,
    role: user.role
  }
  sessions.set(enriched.token, enriched)
  persistSession(enriched)
  return enriched
}

function sessionToUser(session: Session): User {
  return {
    id: session.userId,
    username: session.username,
    role: session.role
  }
}

export function createSession(user: User): Session {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  return registerSession({
    token,
    userId: user.id,
    username: user.username,
    role: user.role,
    expiresAt
  })
}

export function validateSession(token: unknown): Session | null {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return null
  }

  let session = sessions.get(token)
  if (!session) {
    const persisted = loadPersistedSession()
    if (!persisted || persisted.token !== token) {
      return null
    }
    session = persisted
  }

  if (isExpired(session)) {
    destroySession(token)
    return null
  }

  const enriched = enrichSession(session)
  if (!enriched) {
    destroySession(token)
    return null
  }

  sessions.set(enriched.token, enriched)
  return enriched
}

export function updateSessionUser(token: unknown, user: User): Session | null {
  const session = validateSession(token)
  if (!session || session.userId !== user.id) {
    return null
  }

  const updated: Session = {
    ...session,
    username: user.username,
    role: user.role
  }
  return registerSession(updated)
}

export function destroySession(token: unknown): void {
  if (typeof token === 'string') {
    sessions.delete(token)
  }
  clearPersistedSession()
}

export function getSessionStatus(token: unknown): SessionStatus {
  const session = validateSession(token)
  if (!session) {
    return { valid: false }
  }

  return {
    valid: true,
    user: sessionToUser(session),
    expiresAt: session.expiresAt,
    remainingMs: session.expiresAt - Date.now()
  }
}

export function restorePersistedSession(): Session | null {
  const persisted = loadPersistedSession()
  if (!persisted) {
    return null
  }

  if (isExpired(persisted)) {
    clearPersistedSession()
    sessions.delete(persisted.token)
    return null
  }

  const enriched = enrichSession(persisted)
  if (!enriched) {
    clearPersistedSession()
    sessions.delete(persisted.token)
    return null
  }

  sessions.set(enriched.token, enriched)
  return enriched
}

export function purgeExpiredSessions(): void {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now >= session.expiresAt) {
      sessions.delete(token)
    }
  }

  const persisted = loadPersistedSession()
  if (persisted && now >= persisted.expiresAt) {
    clearPersistedSession()
  }
}

export function clearAllSessions(): void {
  sessions.clear()
  clearPersistedSession()
}
