#!/usr/bin/env node
/**
 * Database initialization script for better-sqlite3
 * Run with: node scripts/init-db.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('file:', '')
  : path.join(__dirname, '..', 'dev.db');

console.log(`Initializing database at: ${dbPath}`);

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
const schema = `
-- Platform-specific user accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  address TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  total_volume REAL NOT NULL DEFAULT 0,
  win_rate REAL,
  is_watchlisted INTEGER NOT NULL DEFAULT 0,
  watchlist_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(platform, address)
);

CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
CREATE INDEX IF NOT EXISTS idx_accounts_watchlisted ON accounts(is_watchlisted);

-- All detected trades
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  market_id TEXT NOT NULL,
  market_ticker TEXT,
  account_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  price REAL NOT NULL,
  size REAL NOT NULL,
  usd_value REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  detected_at INTEGER NOT NULL,
  is_suspicious INTEGER NOT NULL DEFAULT 0,
  insider_probability REAL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trades_platform ON trades(platform);
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_suspicious ON trades(is_suspicious);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_detected_at ON trades(detected_at);

-- Flagged accounts watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  reason TEXT NOT NULL,
  probability REAL NOT NULL,
  flagged_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, is_active)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_platform ON watchlist(platform);
CREATE INDEX IF NOT EXISTS idx_watchlist_active ON watchlist(is_active);

-- System activity logs
CREATE TABLE IF NOT EXISTS detection_logs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detection_logs_platform ON detection_logs(platform);
CREATE INDEX IF NOT EXISTS idx_detection_logs_type ON detection_logs(type);
CREATE INDEX IF NOT EXISTS idx_detection_logs_timestamp ON detection_logs(timestamp);

-- API action logs - kept for 72h only
CREATE TABLE IF NOT EXISTS api_logs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  error_message TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_logs_platform ON api_logs(platform);
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs(timestamp);

-- Auto-trade records
CREATE TABLE IF NOT EXISTS auto_trades (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  trigger_trade_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  amount REAL NOT NULL,
  probability REAL NOT NULL,
  status TEXT NOT NULL,
  executed_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (trigger_trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auto_trades_platform ON auto_trades(platform);
CREATE INDEX IF NOT EXISTS idx_auto_trades_status ON auto_trades(status);
CREATE INDEX IF NOT EXISTS idx_auto_trades_created_at ON auto_trades(created_at);

-- System configuration
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  platform TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(key, platform)
);

CREATE INDEX IF NOT EXISTS idx_config_platform ON config(platform);

-- Notification configuration
CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  platform TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_type ON notification_settings(type);
CREATE INDEX IF NOT EXISTS idx_notification_settings_active ON notification_settings(is_active);
`;

// Execute schema
try {
  db.exec(schema);
  console.log('Database schema created successfully!');

  // Insert default configuration
  const now = Date.now();
  const defaults = [
    ['polymarket_min_market_liquidity', '10000', 'polymarket'],
    ['polymarket_big_trade_usd_threshold', '1000', 'polymarket'],
    ['polymarket_big_trade_percent_threshold', '2', 'polymarket'],
    ['polymarket_polling_interval', '10', 'polymarket'],
    ['polymarket_enabled', 'true', 'polymarket'],
    ['kalshi_min_market_liquidity', '10000', 'kalshi'],
    ['kalshi_big_trade_usd_threshold', '1000', 'kalshi'],
    ['kalshi_big_trade_percent_threshold', '2', 'kalshi'],
    ['kalshi_polling_interval', '10', 'kalshi'],
    ['kalshi_enabled', 'true', 'kalshi'],
    ['auto_trade_enabled', 'false', null],
    ['auto_trade_amount', '1', null],
    ['auto_trade_probability_threshold', '70', null],
    ['data_retention_days', '365', null],
    ['notification_method', 'telegram', null],
  ];

  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO config (key, value, platform, updated_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const [key, value, platform] of defaults) {
    insertConfig.run(key, value, platform, now);
  }

  console.log('Default configuration inserted!');
  console.log('\nDatabase initialization complete!');
  console.log(`Database file: ${dbPath}`);

} catch (error) {
  console.error('Error initializing database:', error);
  process.exit(1);
} finally {
  db.close();
}
