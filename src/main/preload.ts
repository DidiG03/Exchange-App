import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateTransactionInput,
  DateFilter,
  ExchangeRate,
  LoginResult,
  SaveRateInput,
  SessionStatus,
  SupportedCurrency,
  Transaction
} from '../database/types'
import type { PrintResult, PrinterSettings } from '../shared/printer-types'
import { SESSION_EXPIRED_CODE } from '../shared/auth-constants'

export interface ExchangeApi {
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  restoreSession: () => Promise<SessionStatus>
  getSessionStatus: () => Promise<SessionStatus>
  onSessionExpired: (callback: () => void) => () => void
  getLiveRates: () => Promise<ExchangeRate[] | SessionExpiredResponse>
  onRatesUpdated: (callback: (rates: ExchangeRate[]) => void) => () => void
  getAllRates: () => Promise<ExchangeRate[] | SessionExpiredResponse>
  saveRate: (
    input: SaveRateInput
  ) => Promise<
    | { success: true; data: ExchangeRate }
    | { success: false; error: string; code?: string }
  >
  getRate: (currency: SupportedCurrency) => Promise<ExchangeRate | null | SessionExpiredResponse>
  createTransaction: (
    input: CreateTransactionInput
  ) => Promise<
    | { success: true; data: Transaction }
    | { success: false; error: string; code?: string }
  >
  getTransactions: (filter?: DateFilter) => Promise<Transaction[] | SessionExpiredResponse>
  getPrinterSettings: () => Promise<PrinterSettings | SessionExpiredResponse>
  savePrinterSettings: (
    settings: PrinterSettings
  ) => Promise<
    | { success: true; data: PrinterSettings }
    | { success: false; error: string; code?: string }
  >
  listPrinters: () => Promise<string[] | SessionExpiredResponse>
  printReceipt: (transaction: Transaction) => Promise<PrintResult | SessionExpiredResponse>
}

type SessionExpiredResponse = { code: typeof SESSION_EXPIRED_CODE; message: string }

let sessionToken: string | null = null
const sessionExpiredListeners = new Set<() => void>()

function notifySessionExpired(): void {
  sessionToken = null
  for (const listener of sessionExpiredListeners) {
    listener()
  }
}

function isSessionExpiredResponse(value: unknown): value is SessionExpiredResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === SESSION_EXPIRED_CODE
  )
}

async function invokeWithSession<T>(channel: string, ...args: unknown[]): Promise<T | SessionExpiredResponse> {
  if (!sessionToken) {
    return {
      code: SESSION_EXPIRED_CODE,
      message: 'Not authenticated'
    }
  }

  const result = await ipcRenderer.invoke(channel, sessionToken, ...args)

  if (isSessionExpiredResponse(result)) {
    notifySessionExpired()
    return result
  }

  if (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    result.success === false &&
    'code' in result &&
    result.code === SESSION_EXPIRED_CODE
  ) {
    notifySessionExpired()
    return {
      code: SESSION_EXPIRED_CODE,
      message: 'error' in result && typeof result.error === 'string' ? result.error : 'Session expired'
    }
  }

  return result as T
}

const api: ExchangeApi = {
  login: async (username, password) => {
    const result = await ipcRenderer.invoke('auth:login', username, password)
    if (result.success && result.sessionToken) {
      sessionToken = result.sessionToken
      return {
        success: true,
        user: result.user,
        expiresAt: result.expiresAt
      }
    }
    sessionToken = null
    return { success: false, error: result.error ?? 'Login failed' }
  },

  logout: async () => {
    if (sessionToken) {
      await ipcRenderer.invoke('auth:logout', sessionToken)
    }
    sessionToken = null
  },

  restoreSession: async () => {
    const result = await ipcRenderer.invoke('auth:restore')
    if (result.valid && result.sessionToken) {
      sessionToken = result.sessionToken
      return {
        valid: true,
        user: result.user,
        expiresAt: result.expiresAt,
        remainingMs: result.remainingMs
      }
    }
    sessionToken = null
    return { valid: false }
  },

  getSessionStatus: async () => {
    if (!sessionToken) {
      return { valid: false }
    }
    const status = await ipcRenderer.invoke('auth:status', sessionToken)
    if (!status.valid) {
      sessionToken = null
    }
    return status
  },

  onSessionExpired: (callback) => {
    sessionExpiredListeners.add(callback)
    return () => sessionExpiredListeners.delete(callback)
  },

  getLiveRates: () => invokeWithSession<ExchangeRate[]>('rates:getLive'),
  onRatesUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, rates: ExchangeRate[]): void => {
      callback(rates)
    }
    ipcRenderer.on('rates:updated', listener)
    return () => {
      ipcRenderer.removeListener('rates:updated', listener)
    }
  },
  getAllRates: () => invokeWithSession<ExchangeRate[]>('rates:getAll'),
  saveRate: (input) => invokeWithSession('rates:save', input),
  getRate: (currency) => invokeWithSession('rates:get', currency),
  createTransaction: (input) => invokeWithSession('transactions:create', input),
  getTransactions: (filter) => invokeWithSession('transactions:getAll', filter),
  getPrinterSettings: () => invokeWithSession<PrinterSettings>('printer:getSettings'),
  savePrinterSettings: (settings) => invokeWithSession('printer:saveSettings', settings),
  listPrinters: () => invokeWithSession<string[]>('printer:list'),
  printReceipt: (transaction) => invokeWithSession<PrintResult>('printer:printReceipt', transaction)
}

contextBridge.exposeInMainWorld('api', api)
