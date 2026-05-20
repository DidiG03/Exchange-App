import { BrowserWindow, ipcMain } from 'electron'
import {
  createTransaction,
  getAllRates,
  getRate,
  getTransactions,
  login,
  saveRate
} from '../database'
import type { ExchangeRate } from '../database/types'
import type {
  CreateTransactionInput,
  DateFilter,
  SaveRateInput,
  SupportedCurrency
} from '../database/types'
import { isSessionExpiredError, requireSession, SessionExpiredError } from './auth'
import { SESSION_EXPIRED_CODE } from '../shared/auth-constants'
import {
  getPrinterSettings,
  listSystemPrinters,
  printTransactionReceipt,
  savePrinterSettings
} from './printer'
import {
  createSession,
  destroySession,
  getSessionStatus,
  purgeExpiredSessions,
  restorePersistedSession
} from './session'
import type { PrinterSettings } from '../shared/printer-types'
import type { Transaction } from '../database/types'

function broadcastLiveRates(): void {
  const rates = getAllRates()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('rates:updated', rates)
    }
  }
}

function toIpcError(error: unknown): { code: string; message: string } {
  if (isSessionExpiredError(error)) {
    return { code: SESSION_EXPIRED_CODE, message: error.message }
  }
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Request failed'
  }
}

function withSession<T>(token: unknown, handler: () => T): T | { code: string; message: string } {
  try {
    requireSession(token)
    return handler()
  } catch (error) {
    return toIpcError(error)
  }
}

const IPC_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:status',
  'auth:restore',
  'rates:getAll',
  'rates:getLive',
  'rates:save',
  'rates:get',
  'transactions:create',
  'transactions:getAll',
  'printer:getSettings',
  'printer:saveSettings',
  'printer:list',
  'printer:printReceipt'
] as const

let purgeInterval: ReturnType<typeof setInterval> | null = null

export function registerIpcHandlers(): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  if (!purgeInterval) {
    purgeInterval = setInterval(() => purgeExpiredSessions(), 5 * 60 * 1000)
    purgeInterval.unref()
  }

  ipcMain.handle('auth:login', (_event, username: string, password: string) => {
    const result = login(username, password)
    if (!result.success || !result.user) {
      return result
    }

    const session = createSession(result.user)
    return {
      success: true,
      user: result.user,
      expiresAt: session.expiresAt,
      sessionToken: session.token
    }
  })

  ipcMain.handle('auth:logout', (_event, token: unknown) => {
    destroySession(token)
    return { success: true }
  })

  ipcMain.handle('auth:status', (_event, token: unknown) => {
    return getSessionStatus(token)
  })

  ipcMain.handle('auth:restore', () => {
    const session = restorePersistedSession()
    if (!session) {
      return { valid: false }
    }

    return {
      valid: true,
      user: { id: session.userId, username: session.username },
      expiresAt: session.expiresAt,
      remainingMs: session.expiresAt - Date.now(),
      sessionToken: session.token
    }
  })

  ipcMain.handle('rates:getAll', (_event, token: unknown) => {
    const result = withSession(token, () => getAllRates())
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('rates:getLive', (_event, token: unknown) => {
    const result = withSession(token, () => getAllRates() as ExchangeRate[])
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('rates:save', (_event, token: unknown, input: SaveRateInput) => {
    try {
      requireSession(token)
      const data = saveRate(input)
      broadcastLiveRates()
      return { success: true, data }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save rate'
      }
    }
  })

  ipcMain.handle('rates:get', (_event, token: unknown, currency: SupportedCurrency) => {
    const result = withSession(token, () => getRate(currency))
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle(
    'transactions:create',
    (_event, token: unknown, input: CreateTransactionInput) => {
      try {
        requireSession(token)
        return { success: true, data: createTransaction(input) }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to log transaction'
        }
      }
    }
  )

  ipcMain.handle('transactions:getAll', (_event, token: unknown, filter: DateFilter = 'all') => {
    const result = withSession(token, () => getTransactions(filter))
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('printer:getSettings', (_event, token: unknown) => {
    const result = withSession(token, () => getPrinterSettings())
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('printer:saveSettings', (_event, token: unknown, settings: PrinterSettings) => {
    try {
      requireSession(token)
      return { success: true, data: savePrinterSettings(settings) }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save printer settings'
      }
    }
  })

  ipcMain.handle('printer:list', (_event, token: unknown) => {
    const result = withSession(token, () => listSystemPrinters())
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('printer:printReceipt', async (_event, token: unknown, tx: Transaction) => {
    try {
      requireSession(token)
      return await printTransactionReceipt(tx)
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to print receipt'
      }
    }
  })
}
