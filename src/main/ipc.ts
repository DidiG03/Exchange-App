import { BrowserWindow, ipcMain } from 'electron'
import {
  assertAdmin,
  createTransaction,
  createUser,
  deleteUser,
  updateAdminCredentials,
  getAllRates,
  getLiveRatesSnapshot,
  getRate,
  getRateChangeHistory,
  getTransactions,
  getUserById,
  listUsers,
  login,
  saveExchangeRate,
  saveRate,
  voidTransaction
} from '../database'
import type {
  CreateTransactionInput,
  DateFilter,
  GetRateHistoryOptions,
  LiveRatesSnapshot,
  RegisterUserInput,
  SaveExchangeRateInput,
  SaveRateInput,
  SupportedCurrency,
  Transaction,
  UpdateAdminCredentialsInput
} from '../database/types'
import { isSessionExpiredError, requireSession, SessionExpiredError } from './auth'
import { SESSION_EXPIRED_CODE } from '../shared/auth-constants'
import {
  getPrinterSettings,
  listNetworkPrinters,
  listSystemPrinters,
  printTransactionReceipt,
  savePrinterSettings,
  testLocalPrinter,
  testNetworkPrinter
} from './printer'
import {
  createSession,
  destroySession,
  getSessionStatus,
  purgeExpiredSessions,
  restorePersistedSession,
  updateSessionUser
} from './session'
import { checkForUpdates, getUpdateState, quitAndInstall } from './updater'
import type { PrinterSettings } from '../shared/printer-types'

function broadcastLiveRates(): void {
  const snapshot = getLiveRatesSnapshot()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('rates:updated', snapshot)
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
  'users:list',
  'users:create',
  'users:updateAdminCredentials',
  'users:delete',
  'rates:getAll',
  'rates:getLive',
  'rates:save',
  'rates:saveExchange',
  'rates:get',
  'rates:getHistory',
  'transactions:create',
  'transactions:getAll',
  'transactions:void',
  'printer:getSettings',
  'printer:saveSettings',
  'printer:list',
  'printer:listNetwork',
  'printer:testNetwork',
  'printer:testLocal',
  'printer:printReceipt',
  'update:getState',
  'update:check',
  'update:install'
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
      user: { id: session.userId, username: session.username, role: session.role },
      expiresAt: session.expiresAt,
      remainingMs: session.expiresAt - Date.now(),
      sessionToken: session.token
    }
  })

  ipcMain.handle('users:list', (_event, token: unknown) => {
    try {
      const session = requireSession(token)
      const user = getUserById(session.userId)
      if (!user) {
        return { success: false, error: 'User not found' }
      }
      assertAdmin(user)
      return { success: true, data: listUsers() }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list users'
      }
    }
  })

  ipcMain.handle('users:create', (_event, token: unknown, input: RegisterUserInput) => {
    try {
      const session = requireSession(token)
      const user = getUserById(session.userId)
      if (!user) {
        return { success: false, error: 'User not found' }
      }
      assertAdmin(user)
      const data = createUser(input)
      return { success: true, data }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user'
      }
    }
  })

  ipcMain.handle(
    'users:updateAdminCredentials',
    (_event, token: unknown, input: UpdateAdminCredentialsInput) => {
      try {
        const session = requireSession(token)
        const data = updateAdminCredentials(session.userId, input)
        updateSessionUser(token, data)
        return { success: true, data }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update credentials'
        }
      }
    }
  )

  ipcMain.handle('users:delete', (_event, token: unknown, targetUserId: number) => {
    try {
      const session = requireSession(token)
      const user = getUserById(session.userId)
      if (!user) {
        return { success: false, error: 'User not found' }
      }
      assertAdmin(user)
      deleteUser(targetUserId, session.userId)
      return { success: true }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete user'
      }
    }
  })

  ipcMain.handle('rates:getAll', (_event, token: unknown) => {
    const result = withSession(token, () => getAllRates())
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('rates:getLive', (_event, token: unknown) => {
    const result = withSession(token, () => getLiveRatesSnapshot())
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle('rates:save', (_event, token: unknown, input: SaveRateInput) => {
    try {
      const session = requireSession(token)
      const data = saveRate(input, {
        userId: session.userId,
        username: session.username
      })
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

  ipcMain.handle('rates:saveExchange', (_event, token: unknown, input: SaveExchangeRateInput) => {
    try {
      const session = requireSession(token)
      const data = saveExchangeRate(input, {
        userId: session.userId,
        username: session.username
      })
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

  ipcMain.handle('rates:getHistory', (_event, token: unknown, options?: GetRateHistoryOptions) => {
    const result = withSession(token, () => getRateChangeHistory(options ?? {}))
    if (result && typeof result === 'object' && 'code' in result) return result
    return result
  })

  ipcMain.handle(
    'transactions:create',
    (_event, token: unknown, input: CreateTransactionInput) => {
      try {
        const session = requireSession(token)
        const data = createTransaction(input, {
          userId: session.userId,
          username: session.username
        })
        return { success: true, data }
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

  ipcMain.handle(
    'transactions:void',
    (_event, token: unknown, transactionId: number, reason: string) => {
      try {
        const session = requireSession(token)
        const data = voidTransaction(transactionId, {
          userId: session.userId,
          username: session.username
        }, reason)
        return { success: true, data }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to void transaction'
        }
      }
    }
  )

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

  ipcMain.handle('printer:list', async (_event, token: unknown) => {
    try {
      requireSession(token)
      return await listSystemPrinters()
    } catch (error) {
      return toIpcError(error)
    }
  })

  ipcMain.handle('printer:listNetwork', async (_event, token: unknown, knownHost?: unknown) => {
    try {
      requireSession(token)
      const host = typeof knownHost === 'string' ? knownHost : undefined
      return await listNetworkPrinters(host)
    } catch (error) {
      return toIpcError(error)
    }
  })

  ipcMain.handle(
    'printer:testNetwork',
    async (_event, token: unknown, host: unknown, port: unknown) => {
      try {
        requireSession(token)
        if (typeof host !== 'string') {
          return { success: false, error: 'Printer IP is required.' }
        }
        const printerPort = typeof port === 'number' ? port : Number(port)
        return await testNetworkPrinter(host, printerPort || 9100)
      } catch (error) {
        return toIpcError(error)
      }
    }
  )

  ipcMain.handle(
    'printer:testLocal',
    async (_event, token: unknown, printerName: unknown) => {
      try {
        requireSession(token)
        if (typeof printerName !== 'string') {
          return { success: false, error: 'Printer name is required.' }
        }
        return await testLocalPrinter(printerName)
      } catch (error) {
        return toIpcError(error)
      }
    }
  )

  ipcMain.handle(
    'printer:printReceipt',
    async (_event, token: unknown, tx: Transaction, language: unknown) => {
      try {
        requireSession(token)
        const receiptLanguage = language === 'en' ? 'en' : 'sq'
        return await printTransactionReceipt(tx, receiptLanguage)
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          return { success: false, code: SESSION_EXPIRED_CODE, error: error.message }
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to print receipt'
        }
      }
    }
  )

  ipcMain.handle('update:getState', () => getUpdateState())

  ipcMain.handle('update:check', async () => checkForUpdates())

  ipcMain.handle('update:install', async () => {
    await quitAndInstall()
    return { success: true }
  })
}
