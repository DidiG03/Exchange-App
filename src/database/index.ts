import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SCHEMA_SQL } from './schema'
import {
  migrateRateChangeLogTable,
  migrateExchangePairRatesTable,
  migrateTransactionCreatorColumns,
  migrateTransactionVoidColumns,
  migrateTransactionsTable,
  migrateUserRoles
} from './migrate'
import { BASE_CURRENCY, DEFAULT_RATE_SEEDS, isCurrencyCode, isSupportedCurrency } from '../shared/currencies'
import type {
  CreateTransactionInput,
  DateFilter,
  GetTransactionsFilter,
  ExchangePairRate,
  ExchangeRate,
  GetRateHistoryOptions,
  LiveRatesSnapshot,
  LoginResult,
  RateChangeLogEntry,
  RegisterUserInput,
  UpdateAdminCredentialsInput,
  SaveExchangeRateInput,
  SaveRateInput,
  SupportedCurrency,
  Transaction,
  User,
  UserListEntry,
  UserRole
} from './types'
import type { CurrencyCode } from '../shared/currencies'

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
  migrateExchangePairRatesTable(db)
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

export function getAllPairRates(): ExchangePairRate[] {
  const database = getDb()
  return database
    .prepare(
      `SELECT from_currency, to_currency, buy_rate, sell_rate, updated_at
       FROM exchange_pair_rates
       ORDER BY from_currency ASC, to_currency ASC`
    )
    .all() as ExchangePairRate[]
}

export function getLiveRatesSnapshot(): LiveRatesSnapshot {
  return {
    all: getAllRates(),
    pairs: getAllPairRates()
  }
}

export function getPairRate(
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency
): ExchangePairRate | null {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT from_currency, to_currency, buy_rate, sell_rate, updated_at
       FROM exchange_pair_rates
       WHERE from_currency = ? AND to_currency = ?`
    )
    .get(fromCurrency, toCurrency) as ExchangePairRate | undefined

  return row ?? null
}

function logRateChange(
  database: Database.Database,
  entry: {
    currency: SupportedCurrency
    from_currency: CurrencyCode
    to_currency: CurrencyCode
    previous_buy_rate: number | null
    previous_sell_rate: number | null
    new_buy_rate: number
    new_sell_rate: number
    changed_by_user_id: number
    changed_by_username: string
    changed_at: string
  }
): void {
  database
    .prepare(
      `INSERT INTO rate_change_log (
         currency, from_currency, to_currency,
         previous_buy_rate, previous_sell_rate,
         new_buy_rate, new_sell_rate, changed_by_user_id, changed_by_username, changed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.currency,
      entry.from_currency,
      entry.to_currency,
      entry.previous_buy_rate,
      entry.previous_sell_rate,
      entry.new_buy_rate,
      entry.new_sell_rate,
      entry.changed_by_user_id,
      entry.changed_by_username,
      entry.changed_at
    )
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

  logRateChange(database, {
    currency: input.currency,
    from_currency: input.currency,
    to_currency: BASE_CURRENCY,
    previous_buy_rate: previous?.buy_rate ?? null,
    previous_sell_rate: previous?.sell_rate ?? null,
    new_buy_rate: input.buy_rate,
    new_sell_rate: input.sell_rate,
    changed_by_user_id: operator.userId,
    changed_by_username: operator.username,
    changed_at: now
  })

  return database
    .prepare(
      'SELECT currency, buy_rate, sell_rate, updated_at FROM exchange_rates WHERE currency = ?'
    )
    .get(input.currency) as ExchangeRate
}

export function savePairRate(
  input: Omit<ExchangePairRate, 'updated_at'>,
  operator: { userId: number; username: string }
): ExchangePairRate {
  if (!isSupportedCurrency(input.from_currency) || !isSupportedCurrency(input.to_currency)) {
    throw new Error('Unsupported currency pair')
  }
  if (input.from_currency === input.to_currency) {
    throw new Error('From and to currencies must be different')
  }
  if (input.buy_rate <= 0 || input.sell_rate <= 0) {
    throw new Error('Rates must be greater than zero')
  }

  const database = getDb()
  const now = new Date().toISOString()
  const previous = getPairRate(input.from_currency, input.to_currency)

  database
    .prepare(
      `INSERT INTO exchange_pair_rates (from_currency, to_currency, buy_rate, sell_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(from_currency, to_currency) DO UPDATE SET
         buy_rate = excluded.buy_rate,
         sell_rate = excluded.sell_rate,
         updated_at = excluded.updated_at`
    )
    .run(
      input.from_currency,
      input.to_currency,
      input.buy_rate,
      input.sell_rate,
      now
    )

  logRateChange(database, {
    currency: input.from_currency,
    from_currency: input.from_currency,
    to_currency: input.to_currency,
    previous_buy_rate: previous?.buy_rate ?? null,
    previous_sell_rate: previous?.sell_rate ?? null,
    new_buy_rate: input.buy_rate,
    new_sell_rate: input.sell_rate,
    changed_by_user_id: operator.userId,
    changed_by_username: operator.username,
    changed_at: now
  })

  return database
    .prepare(
      `SELECT from_currency, to_currency, buy_rate, sell_rate, updated_at
       FROM exchange_pair_rates
       WHERE from_currency = ? AND to_currency = ?`
    )
    .get(input.from_currency, input.to_currency) as ExchangePairRate
}

export function saveExchangeRate(
  input: SaveExchangeRateInput,
  operator: { userId: number; username: string }
): ExchangeRate | ExchangePairRate {
  if (!isCurrencyCode(input.from_currency) || !isCurrencyCode(input.to_currency)) {
    throw new Error('Unsupported currency')
  }
  if (input.from_currency === input.to_currency) {
    throw new Error('From and to currencies must be different')
  }
  if (input.buy_rate <= 0 || input.sell_rate <= 0) {
    throw new Error('Rates must be greater than zero')
  }

  const involvesAll =
    input.from_currency === BASE_CURRENCY || input.to_currency === BASE_CURRENCY

  if (involvesAll) {
    const foreignCurrency =
      input.from_currency === BASE_CURRENCY ? input.to_currency : input.from_currency
    if (!isSupportedCurrency(foreignCurrency)) {
      throw new Error('Unsupported currency')
    }
    return saveRate(
      {
        currency: foreignCurrency,
        buy_rate: input.buy_rate,
        sell_rate: input.sell_rate
      },
      operator
    )
  }

  if (
    !isSupportedCurrency(input.from_currency) ||
    !isSupportedCurrency(input.to_currency)
  ) {
    throw new Error('Unsupported currency pair')
  }

  return savePairRate(
    {
      from_currency: input.from_currency,
      to_currency: input.to_currency,
      buy_rate: input.buy_rate,
      sell_rate: input.sell_rate
    },
    operator
  )
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

  if (options.from_currency) {
    clauses.push('from_currency = ?')
    params.push(options.from_currency)
  }

  if (options.to_currency) {
    clauses.push('to_currency = ?')
    params.push(options.to_currency)
  }

  params.push(limit)

  return database
    .prepare(
      `SELECT id, currency, from_currency, to_currency, previous_buy_rate, previous_sell_rate,
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

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeGetTransactionsFilter(
  input: DateFilter | GetTransactionsFilter | unknown
): GetTransactionsFilter {
  if (typeof input === 'string') {
    if (input === 'today' || input === 'week' || input === 'all') {
      return { preset: input }
    }
    return { preset: 'all' }
  }

  if (!input || typeof input !== 'object') {
    return { preset: 'all' }
  }

  const raw = input as GetTransactionsFilter
  const from = typeof raw.from === 'string' ? raw.from.trim() : ''
  const to = typeof raw.to === 'string' ? raw.to.trim() : ''

  if (DATE_INPUT_RE.test(from) && DATE_INPUT_RE.test(to)) {
    if (from <= to) {
      return { from, to }
    }
    return { from: to, to: from }
  }

  const preset = raw.preset
  if (preset === 'today' || preset === 'week' || preset === 'all') {
    return { preset }
  }

  return { preset: 'all' }
}

function transactionDateClause(
  filter: GetTransactionsFilter,
  column = 'created_at'
): { sql: string; params: string[] } {
  if (filter.from && filter.to) {
    return {
      sql: `date(${column}) >= date(?) AND date(${column}) <= date(?)`,
      params: [filter.from, filter.to]
    }
  }

  return dateFilterClause(filter.preset ?? 'all', column)
}

export function getTransactions(
  filter: DateFilter | GetTransactionsFilter = 'all'
): Transaction[] {
  const database = getDb()
  const normalized = normalizeGetTransactionsFilter(filter)
  const { sql, params } = transactionDateClause(normalized, 'created_at')

  return database
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM transactions
       WHERE ${sql}
       ORDER BY datetime(created_at) DESC`
    )
    .all(...params) as Transaction[]
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
  GetTransactionsFilter,
  SupportedCurrency,
  TransactionType
}
