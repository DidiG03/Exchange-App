import type Database from 'better-sqlite3'

export function migrateTransactionsTable(database: Database.Database): void {
  const tableSql = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
    .get() as { sql: string } | undefined

  if (!tableSql?.sql) return
  if (tableSql.sql.includes("'cross'")) return

  database.exec(`
    CREATE TABLE transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'cross')),
      currency TEXT NOT NULL,
      to_currency TEXT,
      amount_given REAL NOT NULL,
      amount_received REAL NOT NULL,
      rate_applied REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO transactions_new (
      id, type, currency, to_currency, amount_given, amount_received, rate_applied, created_at
    )
    SELECT
      id, type, currency, NULL, amount_given, amount_received, rate_applied, created_at
    FROM transactions;

    DROP TABLE transactions;
    ALTER TABLE transactions_new RENAME TO transactions;

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
  `)
}

export function migrateTransactionVoidColumns(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))

  if (!names.has('voided_at')) {
    database.exec('ALTER TABLE transactions ADD COLUMN voided_at TEXT')
  }
  if (!names.has('voided_by_user_id')) {
    database.exec('ALTER TABLE transactions ADD COLUMN voided_by_user_id INTEGER')
  }
  if (!names.has('voided_by_username')) {
    database.exec('ALTER TABLE transactions ADD COLUMN voided_by_username TEXT')
  }
  if (!names.has('void_reason')) {
    database.exec('ALTER TABLE transactions ADD COLUMN void_reason TEXT')
  }
}

export function migrateUserRoles(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))

  if (!names.has('role')) {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'")
  }

  database.exec("UPDATE users SET role = 'admin' WHERE username = 'admin' AND role != 'admin'")
  database.exec("UPDATE users SET role = 'staff' WHERE role IS NULL OR role = ''")
}

export function migrateTransactionCreatorColumns(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))

  if (!names.has('created_by_user_id')) {
    database.exec('ALTER TABLE transactions ADD COLUMN created_by_user_id INTEGER')
  }
  if (!names.has('created_by_username')) {
    database.exec('ALTER TABLE transactions ADD COLUMN created_by_username TEXT')
  }
}

export function migrateRateChangeLogTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS rate_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL,
      previous_buy_rate REAL,
      previous_sell_rate REAL,
      new_buy_rate REAL NOT NULL,
      new_sell_rate REAL NOT NULL,
      changed_by_user_id INTEGER NOT NULL,
      changed_by_username TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rate_change_log_changed_at ON rate_change_log (changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rate_change_log_currency ON rate_change_log (currency, changed_at DESC);
  `)

  const columns = database.prepare('PRAGMA table_info(rate_change_log)').all() as { name: string }[]
  const names = new Set(columns.map((column) => column.name))

  if (!names.has('from_currency')) {
    database.exec('ALTER TABLE rate_change_log ADD COLUMN from_currency TEXT')
  }
  if (!names.has('to_currency')) {
    database.exec('ALTER TABLE rate_change_log ADD COLUMN to_currency TEXT')
  }

  database.exec(`
    UPDATE rate_change_log
    SET from_currency = currency, to_currency = 'ALL'
    WHERE from_currency IS NULL OR to_currency IS NULL
  `)
}

export function migrateExchangePairRatesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS exchange_pair_rates (
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      buy_rate REAL NOT NULL,
      sell_rate REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (from_currency, to_currency)
    );

    CREATE INDEX IF NOT EXISTS idx_exchange_pair_rates_updated ON exchange_pair_rates (updated_at DESC);
  `)
}
