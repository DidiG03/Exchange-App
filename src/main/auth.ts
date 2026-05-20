import { SESSION_EXPIRED_CODE } from '../shared/auth-constants'
import { validateSession, type Session } from './session'

export class SessionExpiredError extends Error {
  readonly code = SESSION_EXPIRED_CODE

  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

export function requireSession(token: unknown): Session {
  const session = validateSession(token)
  if (!session) {
    throw new SessionExpiredError()
  }
  return session
}

export function isSessionExpiredError(error: unknown): boolean {
  return (
    error instanceof SessionExpiredError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === SESSION_EXPIRED_CODE)
  )
}
