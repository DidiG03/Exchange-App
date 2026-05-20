import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Session } from './session'

const SESSION_FILE = '.session'

function getSessionFilePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, SESSION_FILE)
}

export function persistSession(session: Session): void {
  writeFileSync(getSessionFilePath(), JSON.stringify(session), { encoding: 'utf8', mode: 0o600 })
}

export function loadPersistedSession(): Session | null {
  const filePath = getSessionFilePath()
  if (!existsSync(filePath)) {
    return null
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Session
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.userId !== 'number' ||
      typeof parsed.username !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      clearPersistedSession()
      return null
    }
    return parsed
  } catch {
    clearPersistedSession()
    return null
  }
}

export function clearPersistedSession(): void {
  const filePath = getSessionFilePath()
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
