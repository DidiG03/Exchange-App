export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency TEXT PRIMARY KEY,
  buy_rate REAL NOT NULL,
  sell_rate REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'cross')),
  currency TEXT NOT NULL,
  to_currency TEXT,
  amount_given REAL NOT NULL,
  amount_received REAL NOT NULL,
  rate_applied REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER,
  created_by_username TEXT,
  voided_at TEXT,
  voided_by_user_id INTEGER,
  voided_by_username TEXT,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);

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
`
