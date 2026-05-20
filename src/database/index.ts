import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL } from './schema'
import { migrateTransactionsTable } from './migrate'
import type {
  CreateTransactionInput,
  DateFilter,
  ExchangeRate,
  LoginResult,
  SaveRateInput,
  SupportedCurrency,
  Transaction,
  User
} from './types'

const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['EUR', 'GBP', 'USD']
const DEFAULT_ADMIN = { username: 'admin', password: 'admin123' }

/** Starter rates (ALL per 1 unit) — update on the Rates screen with your bureau's prices. */
const DEFAULT_RATES: SaveRateInput[] = [
  { currency: 'EUR', buy_rate: 98.5, sell_rate: 102.5 },
  { currency: 'GBP', buy_rate: 115, sell_rate: 120 },
  { currency: 'USD', buy_rate: 92, sell_rate: 96 }
]

let db: Database.Database | null = null

function getDbPath(): string {
  return join(app.getPath('userData'), 'exchange-bureau.db')
}

export function initDatabase(): void {
  if (db) return

  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA_SQL)
  migrateTransactionsTable(db)
  seedAdminUser()
  seedDefaultRates()
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

function seedAdminUser(): void {
  const database = getDb()
  const existing = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(DEFAULT_ADMIN.username)

  if (existing) return

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10)
  database
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(DEFAULT_ADMIN.username, passwordHash)
}

function seedDefaultRates(): void {
  const database = getDb()
  const now = new Date().toISOString()
  const exists = database.prepare(
    'SELECT currency FROM exchange_rates WHERE currency = ?'
  )
  const insert = database.prepare(
    `INSERT INTO exchange_rates (currency, buy_rate, sell_rate, updated_at)
     VALUES (?, ?, ?, ?)`
  )

  for (const rate of DEFAULT_RATES) {
    if (exists.get(rate.currency)) continue
    insert.run(rate.currency, rate.buy_rate, rate.sell_rate, now)
  }
}

export function login(username: string, password: string): LoginResult {
  const database = getDb()
  const row = database
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; password_hash: string } | undefined

  if (!row) {
    return { success: false, error: 'Invalid username or password' }
  }

  const valid = bcrypt.compareSync(password, row.password_hash)
  if (!valid) {
    return { success: false, error: 'Invalid username or password' }
  }

  return {
    success: true,
    user: { id: row.id, username: row.username }
  }
}

export function getAllRates(): ExchangeRate[] {
  const database = getDb()
  const rows = database
    .prepare(
      'SELECT currency, buy_rate, sell_rate, updated_at FROM exchange_rates ORDER BY currency ASC'
    )
    .all() as ExchangeRate[]

  return rows
}

export function saveRate(input: SaveRateInput): ExchangeRate {
  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    throw new Error('Unsupported currency')
  }
  if (input.buy_rate <= 0 || input.sell_rate <= 0) {
    throw new Error('Rates must be greater than zero')
  }

  const database = getDb()
  const now = new Date().toISOString()

  database
    .prepare(
      `INSERT INTO exchange_rates (currency, buy_rate, sell_rate, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(currency) DO UPDATE SET
         buy_rate = excluded.buy_rate,
         sell_rate = excluded.sell_rate,
         updated_at = excluded.updated_at`
    )
    .run(input.currency, input.buy_rate, input.sell_rate, now)

  return database
    .prepare(
      'SELECT currency, buy_rate, sell_rate, updated_at FROM exchange_rates WHERE currency = ?'
    )
    .get(input.currency) as ExchangeRate
}

export function getRate(currency: SupportedCurrency): ExchangeRate | null {
  const database = getDb()
  const row = database
    .prepare(
      'SELECT currency, buy_rate, sell_rate, updated_at FROM exchange_rates WHERE currency = ?'
    )
    .get(currency) as ExchangeRate | undefined

  return row ?? null
}

export function createTransaction(input: CreateTransactionInput): Transaction {
  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    throw new Error('Unsupported currency')
  }
  if (input.type === 'cross') {
    if (!input.to_currency || !SUPPORTED_CURRENCIES.includes(input.to_currency)) {
      throw new Error('Select a valid target currency')
    }
    if (input.to_currency === input.currency) {
      throw new Error('From and to currencies must be different')
    }
  }
  if (input.amount_given <= 0 || input.amount_received <= 0 || input.rate_applied <= 0) {
    throw new Error('Invalid transaction amounts')
  }

  const database = getDb()
  const result = database
    .prepare(
      `INSERT INTO transactions (type, currency, to_currency, amount_given, amount_received, rate_applied)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.type,
      input.currency,
      input.type === 'cross' ? input.to_currency! : null,
      input.amount_given,
      input.amount_received,
      input.rate_applied
    )

  return database
    .prepare(
      `SELECT id, type, currency, to_currency, amount_given, amount_received, rate_applied, created_at
       FROM transactions WHERE id = ?`
    )
    .get(result.lastInsertRowid) as Transaction
}

function dateFilterClause(filter: DateFilter): { sql: string; params: string[] } {
  switch (filter) {
    case 'today':
      return {
        sql: "date(created_at) = date('now', 'localtime')",
        params: []
      }
    case 'week':
      return {
        sql: "datetime(created_at) >= datetime('now', 'localtime', '-7 days')",
        params: []
      }
    default:
      return { sql: '1=1', params: [] }
  }
}

export function getTransactions(filter: DateFilter = 'all'): Transaction[] {
  const database = getDb()
  const { sql } = dateFilterClause(filter)

  return database
    .prepare(
      `SELECT id, type, currency, to_currency, amount_given, amount_received, rate_applied, created_at
       FROM transactions
       WHERE ${sql}
       ORDER BY datetime(created_at) DESC`
    )
    .all() as Transaction[]
}

export type { User, ExchangeRate, Transaction, LoginResult, SaveRateInput, CreateTransactionInput, DateFilter, SupportedCurrency, TransactionType }
