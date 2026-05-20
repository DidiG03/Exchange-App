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
