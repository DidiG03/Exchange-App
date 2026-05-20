import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL } from './schema'
import {
  migrateRateChangeLogTable,
  migrateTransactionCreatorColumns,
  migrateTransactionVoidColumns,
  migrateTransactionsTable,
  migrateUserRoles
} from './migrate'
import { DEFAULT_RATE_SEEDS, isSupportedCurrency } from '../shared/currencies'
import type {
  CreateTransactionInput,
  DateFilter,
  ExchangeRate,
  GetRateHistoryOptions,
  LoginResult,
  RateChangeLogEntry,
  RegisterUserInput,
  UpdateAdminCredentialsInput,
  SaveRateInput,
  SupportedCurrency,
  Transaction,
  User,
  UserListEntry,
  UserRole
} from './types'

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123' }
const DEFAULT_RATES: SaveRateInput[] = DEFAULT_RATE_SEEDS

const TRANSACTION_COLUMNS = `
  id, type, currency, to_currency, amount_given, amount_received, rate_applied, created_at,
  created_by_user_id, created_by_username,
  voided_at, voided_by_user_id, voided_by_username, void_reason
`.trim()

const USER_COLUMNS = 'id, username, role, created_at'

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
  migrateTransactionVoidColumns(db)
  migrateRateChangeLogTable(db)
  migrateUserRoles(db)
  migrateTransactionCreatorColumns(db)
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
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(DEFAULT_ADMIN.username, passwordHash, 'admin')
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function assertValidNewUsername(username: string): string {
  const normalized = normalizeUsername(username)
  if (normalized.length < 3 || normalized.length > 32) {
    throw new Error('Username must be 3–32 characters')
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error('Username may only contain letters, numbers, and underscores')
  }
  return normalized
}

function assertValidPassword(password: string): void {
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters')
  }
  if (password.length > 128) {
    throw new Error('Password must be 128 characters or fewer')
  }
}

export function getUserById(id: number): User | null {
  const database = getDb()
  const row = database
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(id) as User | undefined
  return row ?? null
}

export function listUsers(): UserListEntry[] {
  const database = getDb()
  return database
    .prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY username ASC`)
    .all() as UserListEntry[]
}

export function createUser(input: RegisterUserInput): UserListEntry {
  const username = assertValidNewUsername(input.username)
  assertValidPassword(input.password)

  const database = getDb()
  const existing = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username)

  if (existing) {
    throw new Error('Username is already taken')
  }

  const passwordHash = bcrypt.hashSync(input.password, 10)
  const result = database
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, passwordHash, 'staff')

  return database
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(result.lastInsertRowid) as UserListEntry
}

export function assertAdmin(user: User): void {
  if (user.role !== 'admin') {
    throw new Error('Only administrators can perform this action')
  }
}

export function updateAdminCredentials(
  userId: number,
  input: UpdateAdminCredentialsInput
): User {
  const user = getUserById(userId)
  if (!user) {
    throw new Error('User not found')
  }
  assertAdmin(user)

  const database = getDb()
  const row = database
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(userId) as { password_hash: string } | undefined

  if (!row || !bcrypt.compareSync(input.current_password, row.password_hash)) {
    throw new Error('Current password is incorrect')
  }

  const newUsernameRaw = input.new_username?.trim()
  const newPasswordRaw = input.new_password?.trim()
  const hasNewUsername = Boolean(newUsernameRaw)
  const hasNewPassword = Boolean(newPasswordRaw)

  if (!hasNewUsername && !hasNewPassword) {
    throw new Error('Enter a new username and/or new password')
  }

  let nextUsername = user.username
  if (hasNewUsername) {
    nextUsername = assertValidNewUsername(newUsernameRaw!)
    if (nextUsername !== user.username) {
      const taken = database
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(nextUsername, userId)
      if (taken) {
        throw new Error('Username is already taken')
      }
    }
  }

  let nextPasswordHash: string | null = null
  if (hasNewPassword) {
    assertValidPassword(newPasswordRaw!)
    nextPasswordHash = bcrypt.hashSync(newPasswordRaw!, 10)
  }

  const usernameChanged = nextUsername !== user.username
  const passwordChanged = nextPasswordHash !== null

  if (!usernameChanged && !passwordChanged) {
    throw new Error('New username and password match the current credentials')
  }

  if (usernameChanged && passwordChanged) {
    database
      .prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
      .run(nextUsername, nextPasswordHash, userId)
  } else if (usernameChanged) {
    database.prepare('UPDATE users SET username = ? WHERE id = ?').run(nextUsername, userId)
  } else {
    database
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(nextPasswordHash, userId)
  }

  return getUserById(userId)!
}

export function deleteUser(targetUserId: number, requestingAdminId: number): void {
  const admin = getUserById(requestingAdminId)
  if (!admin) {
    throw new Error('User not found')
  }
  assertAdmin(admin)

  if (targetUserId === requestingAdminId) {
    throw new Error('You cannot delete your own account')
  }

  const target = getUserById(targetUserId)
  if (!target) {
    throw new Error('User not found')
  }

  if (target.role === 'admin') {
    throw new Error('Administrator accounts cannot be deleted')
  }

  const database = getDb()
  const result = database.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(targetUserId, 'staff')

  if (result.changes === 0) {
    throw new Error('User could not be deleted')
  }
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
  const normalized = normalizeUsername(username)
  const row = database
    .prepare(`SELECT id, username, password_hash, role FROM users WHERE username = ?`)
    .get(normalized) as
    | { id: number; username: string; password_hash: string; role: UserRole }
    | undefined

  if (!row) {
    return { success: false, error: 'Invalid username or password' }
  }

  const valid = bcrypt.compareSync(password, row.password_hash)
  if (!valid) {
    return { success: false, error: 'Invalid username or password' }
  }

  return {
    success: true,
    user: { id: row.id, username: row.username, role: row.role }
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

export function saveRate(
  input: SaveRateInput,
  operator: { userId: number; username: string }
): ExchangeRate {
  if (!isSupportedCurrency(input.currency)) {
    throw new Error('Unsupported currency')
  }
  if (input.buy_rate <= 0 || input.sell_rate <= 0) {
    throw new Error('Rates must be greater than zero')
  }

  const database = getDb()
  const now = new Date().toISOString()
  const previous = getRate(input.currency)

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

  database
    .prepare(
      `INSERT INTO rate_change_log (
         currency, previous_buy_rate, previous_sell_rate,
         new_buy_rate, new_sell_rate, changed_by_user_id, changed_by_username, changed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.currency,
      previous?.buy_rate ?? null,
      previous?.sell_rate ?? null,
      input.buy_rate,
      input.sell_rate,
      operator.userId,
      operator.username,
      now
    )

  return database
    .prepare(
      'SELECT currency, buy_rate, sell_rate, updated_at FROM exchange_rates WHERE currency = ?'
    )
    .get(input.currency) as ExchangeRate
}

export function getRateChangeHistory(
  options: GetRateHistoryOptions = {}
): RateChangeLogEntry[] {
  const database = getDb()
  const filter = options.filter ?? 'all'
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500)
  const { sql: dateSql } = dateFilterClause(filter, 'changed_at')

  const clauses = [dateSql]
  const params: (string | number)[] = []

  if (options.currency) {
    clauses.push('currency = ?')
    params.push(options.currency)
  }

  params.push(limit)

  return database
    .prepare(
      `SELECT id, currency, previous_buy_rate, previous_sell_rate,
              new_buy_rate, new_sell_rate, changed_by_user_id, changed_by_username, changed_at
       FROM rate_change_log
       WHERE ${clauses.join(' AND ')}
       ORDER BY datetime(changed_at) DESC
       LIMIT ?`
    )
    .all(...params) as RateChangeLogEntry[]
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

export function createTransaction(
  input: CreateTransactionInput,
  operator: { userId: number; username: string }
): Transaction {
  if (!isSupportedCurrency(input.currency)) {
    throw new Error('Unsupported currency')
  }
  if (input.type === 'cross') {
    if (!input.to_currency || !isSupportedCurrency(input.to_currency)) {
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
      `INSERT INTO transactions (
         type, currency, to_currency, amount_given, amount_received, rate_applied,
         created_by_user_id, created_by_username
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.type,
      input.currency,
      input.type === 'cross' ? input.to_currency! : null,
      input.amount_given,
      input.amount_received,
      input.rate_applied,
      operator.userId,
      operator.username
    )

  return getTransactionById(Number(result.lastInsertRowid))!
}

export function getTransactionById(id: number): Transaction | null {
  const database = getDb()
  const row = database
    .prepare(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ?`)
    .get(id) as Transaction | undefined
  return row ?? null
}

export function voidTransaction(
  transactionId: number,
  operator: { userId: number; username: string },
  reason: string
): Transaction {
  const trimmed = reason.trim()
  if (trimmed.length < 3) {
    throw new Error('Void reason must be at least 3 characters')
  }
  if (trimmed.length > 500) {
    throw new Error('Void reason must be 500 characters or fewer')
  }

  const existing = getTransactionById(transactionId)
  if (!existing) {
    throw new Error('Transaction not found')
  }
  if (existing.voided_at) {
    throw new Error('Transaction is already voided')
  }

  const database = getDb()
  const now = new Date().toISOString()
  const result = database
    .prepare(
      `UPDATE transactions
       SET voided_at = ?, voided_by_user_id = ?, voided_by_username = ?, void_reason = ?
       WHERE id = ? AND voided_at IS NULL`
    )
    .run(now, operator.userId, operator.username, trimmed, transactionId)

  if (result.changes === 0) {
    throw new Error('Transaction could not be voided')
  }

  return getTransactionById(transactionId)!
}

function dateFilterClause(
  filter: DateFilter,
  column = 'created_at'
): { sql: string; params: string[] } {
  switch (filter) {
    case 'today':
      return {
        sql: `date(${column}) = date('now', 'localtime')`,
        params: []
      }
    case 'week':
      return {
        sql: `datetime(${column}) >= datetime('now', 'localtime', '-7 days')`,
        params: []
      }
    default:
      return { sql: '1=1', params: [] }
  }
}

export function getTransactions(filter: DateFilter = 'all'): Transaction[] {
  const database = getDb()
  const { sql } = dateFilterClause(filter, 'created_at')

  return database
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM transactions
       WHERE ${sql}
       ORDER BY datetime(created_at) DESC`
    )
    .all() as Transaction[]
}

export function isTransactionVoided(tx: Transaction): boolean {
  return tx.voided_at !== null && tx.voided_at !== undefined
}

export type {
  User,
  UserRole,
  UserListEntry,
  RegisterUserInput,
  UpdateAdminCredentialsInput,
  ExchangeRate,
  Transaction,
  LoginResult,
  SaveRateInput,
  CreateTransactionInput,
  VoidTransactionInput,
  RateChangeLogEntry,
  GetRateHistoryOptions,
  DateFilter,
  SupportedCurrency,
  TransactionType
}
