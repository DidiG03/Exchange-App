import type { SupportedCurrency } from '../shared/currencies'

export type { SupportedCurrency }

export type TransactionType = 'buy' | 'sell' | 'cross'

export type DateFilter = 'today' | 'week' | 'all'

export type UserRole = 'admin' | 'staff'

export interface User {
  id: number
  username: string
  role: UserRole
}

export interface UserListEntry {
  id: number
  username: string
  role: UserRole
  created_at: string
}

export interface RegisterUserInput {
  username: string
  password: string
}

export interface UpdateAdminCredentialsInput {
  current_password: string
  new_username?: string
  new_password?: string
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
  created_by_user_id: number | null
  created_by_username: string | null
  voided_at: string | null
  voided_by_user_id: number | null
  voided_by_username: string | null
  void_reason: string | null
}

export interface VoidTransactionInput {
  transaction_id: number
  reason: string
}

export interface RateChangeLogEntry {
  id: number
  currency: SupportedCurrency
  previous_buy_rate: number | null
  previous_sell_rate: number | null
  new_buy_rate: number
  new_sell_rate: number
  changed_by_user_id: number
  changed_by_username: string
  changed_at: string
}

export interface GetRateHistoryOptions {
  currency?: SupportedCurrency
  filter?: DateFilter
  limit?: number
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

