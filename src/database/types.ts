export type SupportedCurrency = 'EUR' | 'GBP' | 'USD'

export type TransactionType = 'buy' | 'sell' | 'cross'

export type DateFilter = 'today' | 'week' | 'all'

export interface User {
  id: number
  username: string
}

export interface ExchangeRate {
  currency: SupportedCurrency
  buy_rate: number
  sell_rate: number
  updated_at: string
}

export interface Transaction {
  id: number
  type: TransactionType
  currency: SupportedCurrency
  to_currency: SupportedCurrency | null
  amount_given: number
  amount_received: number
  rate_applied: number
  created_at: string
}

export interface LoginResult {
  success: boolean
  user?: User
  expiresAt?: number
  error?: string
}

export interface SessionStatus {
  valid: boolean
  user?: User
  expiresAt?: number
  remainingMs?: number
}

export interface SaveRateInput {
  currency: SupportedCurrency
  buy_rate: number
  sell_rate: number
}

export interface CreateTransactionInput {
  type: TransactionType
  currency: SupportedCurrency
  to_currency?: SupportedCurrency
  amount_given: number
  amount_received: number
  rate_applied: number
}
