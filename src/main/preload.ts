import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateTransactionInput,
  DateFilter,
  ExchangeRate,
  ExchangePairRate,
  GetRateHistoryOptions,
  LiveRatesSnapshot,
  LoginResult,
  RateChangeLogEntry,
  RegisterUserInput,
  UpdateAdminCredentialsInput,
  SaveExchangeRateInput,
  SaveRateInput,
  User,
  SessionStatus,
  SupportedCurrency,
  Transaction,
  UserListEntry
} from '../database/types'
import type { PrintResult, NetworkPrinterDevice, NetworkPrinterTestResult, PrinterSettings } from '../shared/printer-types'
import type { ReceiptLanguage } from '../shared/receipt-language'
import { SESSION_EXPIRED_CODE } from '../shared/auth-constants'

export interface ExchangeApi {
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  restoreSession: () => Promise<SessionStatus>
  getSessionStatus: () => Promise<SessionStatus>
  listUsers: () => Promise<
    | { success: true; data: UserListEntry[] }
    | { success: false; error: string; code?: string }
  >
  createUser: (
    input: RegisterUserInput
  ) => Promise<
    | { success: true; data: UserListEntry }
    | { success: false; error: string; code?: string }
  >
  updateAdminCredentials: (
    input: UpdateAdminCredentialsInput
  ) => Promise<
    | { success: true; data: User }
    | { success: false; error: string; code?: string }
  >
  deleteUser: (
    userId: number
  ) => Promise<{ success: true } | { success: false; error: string; code?: string }>
  onSessionExpired: (callback: () => void) => () => void
  getLiveRates: () => Promise<LiveRatesSnapshot | SessionExpiredResponse>
  onRatesUpdated: (callback: (snapshot: LiveRatesSnapshot) => void) => () => void
  getAllRates: () => Promise<ExchangeRate[] | SessionExpiredResponse>
  saveRate: (
    input: SaveRateInput
  ) => Promise<
    | { success: true; data: ExchangeRate }
    | { success: false; error: string; code?: string }
  >
  saveExchangeRate: (
    input: SaveExchangeRateInput
  ) => Promise<
    | { success: true; data: ExchangeRate | ExchangePairRate }
    | { success: false; error: string; code?: string }
  >
  getRate: (currency: SupportedCurrency) => Promise<ExchangeRate | null | SessionExpiredResponse>
  getRateChangeHistory: (
    options?: GetRateHistoryOptions
  ) => Promise<RateChangeLogEntry[] | SessionExpiredResponse>
  createTransaction: (
    input: CreateTransactionInput
  ) => Promise<
    | { success: true; data: Transaction }
    | { success: false; error: string; code?: string }
  >
  getTransactions: (filter?: DateFilter) => Promise<Transaction[] | SessionExpiredResponse>
  voidTransaction: (
    transactionId: number,
    reason: string
  ) => Promise<
    | { success: true; data: Transaction }
    | { success: false; error: string; code?: string }
  >
  getPrinterSettings: () => Promise<PrinterSettings | SessionExpiredResponse>
  savePrinterSettings: (
    settings: PrinterSettings
  ) => Promise<
    | { success: true; data: PrinterSettings }
    | { success: false; error: string; code?: string }
  >
  listPrinters: () => Promise<string[] | SessionExpiredResponse>
  listNetworkPrinters: (
    knownHost?: string
  ) => Promise<NetworkPrinterDevice[] | SessionExpiredResponse>
  testNetworkPrinter: (
    host: string,
    port: number
  ) => Promise<NetworkPrinterTestResult | SessionExpiredResponse>
  testLocalPrinter: (
    printerName: string
  ) => Promise<PrintResult | SessionExpiredResponse>
  printReceipt: (
    transaction: Transaction,
    language?: ReceiptLanguage
  ) => Promise<PrintResult | SessionExpiredResponse>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  installUpdate: () => Promise<{ success: boolean }>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
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

  listUsers: () => invokeWithSession('users:list'),
  createUser: (input) => invokeWithSession('users:create', input),
  updateAdminCredentials: (input) => invokeWithSession('users:updateAdminCredentials', input),
  deleteUser: (userId) => invokeWithSession('users:delete', userId),

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

  getLiveRates: () => invokeWithSession<LiveRatesSnapshot>('rates:getLive'),
  onRatesUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: LiveRatesSnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on('rates:updated', listener)
    return () => {
      ipcRenderer.removeListener('rates:updated', listener)
    }
  },
  getAllRates: () => invokeWithSession<ExchangeRate[]>('rates:getAll'),
  saveRate: (input) => invokeWithSession('rates:save', input),
  saveExchangeRate: (input) => invokeWithSession('rates:saveExchange', input),
  getRate: (currency) => invokeWithSession('rates:get', currency),
  getRateChangeHistory: (options) => invokeWithSession('rates:getHistory', options ?? {}),
  createTransaction: (input) => invokeWithSession('transactions:create', input),
  getTransactions: (filter) => invokeWithSession('transactions:getAll', filter),
  voidTransaction: (transactionId, reason) =>
    invokeWithSession('transactions:void', transactionId, reason),
  getPrinterSettings: () => invokeWithSession<PrinterSettings>('printer:getSettings'),
  savePrinterSettings: (settings) => invokeWithSession('printer:saveSettings', settings),
  listPrinters: () => invokeWithSession<string[]>('printer:list'),
  listNetworkPrinters: (knownHost) =>
    invokeWithSession<NetworkPrinterDevice[]>('printer:listNetwork', knownHost),
  testNetworkPrinter: (host, port) =>
    invokeWithSession<NetworkPrinterTestResult>('printer:testNetwork', host, port),
  testLocalPrinter: (printerName) =>
    invokeWithSession<PrintResult>('printer:testLocal', printerName),
  printReceipt: (transaction, language = 'sq') =>
    invokeWithSession<PrintResult>('printer:printReceipt', transaction, language),
  getUpdateState: () => ipcRenderer.invoke('update:getState'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
      callback(state)
    }
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
