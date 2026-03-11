import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Platform,
  Outcome,
  LogType,
  AutoTradeStatus,
  NotificationType,
  AccountInfo,
  TradeInfo,
  WatchlistEntry,
  LogEntry,
  RecentDetection,
  DashboardStats,
  PlatformConfig,
  GlobalConfig,
  NotificationConfig,
} from '@/types';

// Database path
const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('file:', '')
  : path.join(process.cwd(), 'dev.db');

// Create database connection
const db = new Database(dbPath);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================
// Auto-initialize database schema
// ============================================
let schemaInitialized = false;

function initializeSchema() {
  if (schemaInitialized) return;
  
  const schema = `
    // ... all the CREATE TABLE statements ...
  `;

  try {
    db.exec(schema);
    console.log('Database schema initialized successfully');
    schemaInitialized = true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
  }
}

// Run schema initialization
initializeSchema();


// ============================================
// Helper functions
// ============================================

function dateToUnix(date: Date | string | number): number {
  if (typeof date === 'number') return date;
  if (typeof date === 'string') return new Date(date).getTime();
  return date.getTime();
}

function unixToDate(unix: number): Date {
  return new Date(unix);
}

function parseJSON<T>(str: string | null | undefined): T | undefined {
  if (!str) return undefined;
  try {
    return JSON.parse(str) as T;
  } catch {
    return undefined;
  }
}

// ============================================
// Account operations
// ============================================

export const accounts = {
  create(data: {
    platform: Platform;
    address: string;
    firstSeen?: Date;
    totalTrades?: number;
    totalVolume?: number;
    winRate?: number;
    isWatchlisted?: boolean;
    watchlistReason?: string;
  }): { id: string } {
    const id = uuidv4();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO accounts (id, platform, address, first_seen, total_trades, total_volume, win_rate, is_watchlisted, watchlist_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.platform,
      data.address,
      dateToUnix(data.firstSeen || new Date()),
      data.totalTrades || 0,
      data.totalVolume || 0,
      data.winRate ?? null,
      data.isWatchlisted ? 1 : 0,
      data.watchlistReason ?? null,
      now,
      now
    );
    return { id };
  },

  findById(id: string): AccountInfo | null {
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      platform: row.platform,
      address: row.address,
      firstSeen: unixToDate(row.first_seen),
      totalTrades: row.total_trades,
      totalVolume: row.total_volume,
      winRate: row.win_rate ?? undefined,
      isWatchlisted: row.is_watchlisted === 1,
      watchlistReason: row.watchlist_reason ?? undefined,
    };
  },

  findByPlatformAddress(platform: Platform, address: string): AccountInfo | null {
    const stmt = db.prepare('SELECT * FROM accounts WHERE platform = ? AND address = ?');
    const row = stmt.get(platform, address) as any;
    if (!row) return null;
    return {
      id: row.id,
      platform: row.platform,
      address: row.address,
      firstSeen: unixToDate(row.first_seen),
      totalTrades: row.total_trades,
      totalVolume: row.total_volume,
      winRate: row.win_rate ?? undefined,
      isWatchlisted: row.is_watchlisted === 1,
      watchlistReason: row.watchlist_reason ?? undefined,
    };
  },

  upsert(data: {
    platform: Platform;
    address: string;
    firstSeen?: Date;
    totalTrades?: number;
    totalVolume?: number;
    winRate?: number;
    isWatchlisted?: boolean;
    watchlistReason?: string;
  }): { id: string } {
    const existing = this.findByPlatformAddress(data.platform, data.address);
    if (existing) {
      const now = Date.now();
      const stmt = db.prepare(`
        UPDATE accounts
        SET total_trades = ?, total_volume = ?, win_rate = ?, is_watchlisted = ?, watchlist_reason = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        data.totalTrades ?? 0,
        data.totalVolume ?? 0,
        data.winRate ?? null,
        data.isWatchlisted ? 1 : 0,
        data.watchlistReason ?? null,
        now,
        existing.id
      );
      return { id: existing.id };
    }
    return this.create(data);
  },

  updateStats(id: string, data: { totalTrades?: number; totalVolume?: number; winRate?: number }): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE accounts SET total_trades = ?, total_volume = ?, win_rate = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(data.totalTrades, data.totalVolume, data.winRate ?? null, now, id);
  },

  setWatchlisted(id: string, isWatchlisted: boolean, reason?: string): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE accounts SET is_watchlisted = ?, watchlist_reason = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(isWatchlisted ? 1 : 0, reason ?? null, now, id);
  },

  getWatchlisted(platform?: Platform): AccountInfo[] {
    let stmt;
    if (platform) {
      stmt = db.prepare('SELECT * FROM accounts WHERE platform = ? AND is_watchlisted = 1');
      return (stmt.all(platform) as any[]).map(row => ({
        id: row.id,
        platform: row.platform,
        address: row.address,
        firstSeen: unixToDate(row.first_seen),
        totalTrades: row.total_trades,
        totalVolume: row.total_volume,
        winRate: row.win_rate ?? undefined,
        isWatchlisted: true,
        watchlistReason: row.watchlist_reason ?? undefined,
      }));
    }
    stmt = db.prepare('SELECT * FROM accounts WHERE is_watchlisted = 1');
    return (stmt.all() as any[]).map(row => ({
      id: row.id,
      platform: row.platform,
      address: row.address,
      firstSeen: unixToDate(row.first_seen),
      totalTrades: row.total_trades,
      totalVolume: row.total_volume,
      winRate: row.win_rate ?? undefined,
      isWatchlisted: true,
      watchlistReason: row.watchlist_reason ?? undefined,
    }));
  },

  count(platform?: Platform): number {
    if (platform) {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE platform = ?');
      return (stmt.get(platform) as any).count;
    }
    const stmt = db.prepare('SELECT COUNT(*) as count FROM accounts');
    return (stmt.get() as any).count;
  },
};

// ============================================
// Trade operations
// ============================================

export const trades = {
  create(data: {
    platform: Platform;
    marketId: string;
    marketTicker?: string;
    accountId: string;
    outcome: Outcome;
    price: number;
    size: number;
    usdValue: number;
    timestamp: Date;
    isSuspicious?: boolean;
    insiderProbability?: number;
  }): { id: string } {
    const id = uuidv4();
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO trades (id, platform, market_id, market_ticker, account_id, outcome, price, size, usd_value, timestamp, detected_at, is_suspicious, insider_probability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.platform,
      data.marketId,
      data.marketTicker ?? null,
      data.accountId,
      data.outcome,
      data.price,
      data.size,
      data.usdValue,
      dateToUnix(data.timestamp),
      now,
      data.isSuspicious ? 1 : 0,
      data.insiderProbability ?? null
    );
    return { id };
  },

  findById(id: string): TradeInfo & { detectedAt: Date; isSuspicious: boolean; insiderProbability?: number } | null {
    const stmt = db.prepare('SELECT * FROM trades WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      marketId: row.market_id,
      marketTicker: row.market_ticker ?? undefined,
      outcome: row.outcome,
      price: row.price,
      size: row.size,
      usdValue: row.usd_value,
      timestamp: unixToDate(row.timestamp),
      accountId: row.account_id,
      detectedAt: unixToDate(row.detected_at),
      isSuspicious: row.is_suspicious === 1,
      insiderProbability: row.insider_probability ?? undefined,
    };
  },

  getRecent(limit: number = 50, platform?: Platform, suspiciousOnly?: boolean): (TradeInfo & { detectedAt: Date; isSuspicious: boolean; insiderProbability?: number })[] {
    let sql = 'SELECT * FROM trades';
    const params: any[] = [];

    if (platform) {
      sql += ' WHERE platform = ?';
      params.push(platform);
      if (suspiciousOnly) {
        sql += ' AND is_suspicious = 1';
      }
    } else if (suspiciousOnly) {
      sql += ' WHERE is_suspicious = 1';
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      marketId: row.market_id,
      marketTicker: row.market_ticker ?? undefined,
      outcome: row.outcome,
      price: row.price,
      size: row.size,
      usdValue: row.usd_value,
      timestamp: unixToDate(row.timestamp),
      accountId: row.account_id,
      detectedAt: unixToDate(row.detected_at),
      isSuspicious: row.is_suspicious === 1,
      insiderProbability: row.insider_probability ?? undefined,
    }));
  },

  getRecentDetections(limit: number = 20): RecentDetection[] {
    const stmt = db.prepare(`
      SELECT t.*, a.address as account_address
      FROM trades t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.is_suspicious = 1
      ORDER BY t.timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      platform: row.platform,
      marketId: row.market_id,
      marketTicker: row.market_ticker ?? undefined,
      outcome: row.outcome,
      usdValue: row.usd_value,
      insiderProbability: row.insider_probability ?? 0,
      timestamp: unixToDate(row.timestamp),
      accountAddress: row.account_address,
    }));
  },

  count(platform?: Platform, suspiciousOnly?: boolean): number {
    let sql = 'SELECT COUNT(*) as count FROM trades';
    const params: any[] = [];

    if (platform) {
      sql += ' WHERE platform = ?';
      params.push(platform);
      if (suspiciousOnly) {
        sql += ' AND is_suspicious = 1';
      }
    } else if (suspiciousOnly) {
      sql += ' WHERE is_suspicious = 1';
    }

    const stmt = db.prepare(sql);
    return (stmt.get(...params) as any).count;
  },

  deleteOld(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stmt = db.prepare('DELETE FROM trades WHERE detected_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  },
};

// ============================================
// Watchlist operations
// ============================================

export const watchlist = {
  add(data: {
    accountId: string;
    platform: Platform;
    reason: string;
    probability: number;
  }): { id: string } {
    const id = uuidv4();
    const now = Date.now();

    // Deactivate existing active watchlist entries for this account
    const deactivateStmt = db.prepare('UPDATE watchlist SET is_active = 0 WHERE account_id = ? AND is_active = 1');
    deactivateStmt.run(data.accountId);

    // Insert new entry
    const stmt = db.prepare(`
      INSERT INTO watchlist (id, account_id, platform, reason, probability, flagged_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(id, data.accountId, data.platform, data.reason, data.probability, now);

    // Update account
    accounts.setWatchlisted(data.accountId, true, data.reason);

    return { id };
  },

  remove(id: string): void {
    const stmt = db.prepare('SELECT account_id FROM watchlist WHERE id = ?');
    const row = stmt.get(id) as any;
    if (row) {
      const updateStmt = db.prepare('UPDATE watchlist SET is_active = 0 WHERE id = ?');
      updateStmt.run(id);
      accounts.setWatchlisted(row.account_id, false);
    }
  },

  getAll(activeOnly: boolean = true): WatchlistEntry[] {
    let sql = `
      SELECT w.*, a.address as account_address
      FROM watchlist w
      JOIN accounts a ON w.account_id = a.id
    `;
    if (activeOnly) {
      sql += ' WHERE w.is_active = 1';
    }
    sql += ' ORDER BY w.flagged_at DESC';

    const stmt = db.prepare(sql);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      platform: row.platform,
      accountAddress: row.account_address,
      reason: row.reason,
      probability: row.probability,
      flaggedAt: unixToDate(row.flagged_at),
      isActive: row.is_active === 1,
    }));
  },

  count(activeOnly: boolean = true): number {
    let sql = 'SELECT COUNT(*) as count FROM watchlist';
    if (activeOnly) {
      sql += ' WHERE is_active = 1';
    }
    const stmt = db.prepare(sql);
    return (stmt.get() as any).count;
  },
};

// ============================================
// Detection logs operations
// ============================================

export const detectionLogs = {
  create(data: {
    platform: Platform;
    type: LogType;
    message: string;
    details?: Record<string, unknown>;
  }): { id: string } {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO detection_logs (id, platform, type, message, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.platform, data.type, data.message, data.details ? JSON.stringify(data.details) : null, Date.now());
    return { id };
  },

  getRecent(limit: number = 100, platform?: Platform, type?: LogType): LogEntry[] {
    let sql = 'SELECT * FROM detection_logs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      platform: row.platform,
      type: row.type,
      message: row.message,
      details: parseJSON(row.details),
      timestamp: unixToDate(row.timestamp),
    }));
  },

  deleteOld(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stmt = db.prepare('DELETE FROM detection_logs WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  },
};

// ============================================
// API logs operations
// ============================================

export const apiLogs = {
  create(data: {
    platform: Platform;
    endpoint: string;
    method: string;
    status: number;
    responseTime: number;
    errorMessage?: string;
  }): { id: string } {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO api_logs (id, platform, endpoint, method, status, response_time, error_message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.platform, data.endpoint, data.method, data.status, data.responseTime, data.errorMessage ?? null, Date.now());
    return { id };
  },

  deleteOld(hours: number = 72): number {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const stmt = db.prepare('DELETE FROM api_logs WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  },

  getErrors(limit: number = 50): any[] {
    const stmt = db.prepare('SELECT * FROM api_logs WHERE status >= 400 ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit) as any[];
  },
};

// ============================================
// Auto-trade operations
// ============================================

export const autoTrades = {
  create(data: {
    platform: Platform;
    triggerTradeId: string;
    marketId: string;
    outcome: Outcome;
    amount: number;
    probability: number;
    status: AutoTradeStatus;
  }): { id: string } {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO auto_trades (id, platform, trigger_trade_id, market_id, outcome, amount, probability, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.platform, data.triggerTradeId, data.marketId, data.outcome, data.amount, data.probability, data.status, Date.now());
    return { id };
  },

  updateStatus(id: string, status: AutoTradeStatus, errorMessage?: string): void {
    const executedAt = status === 'executed' ? Date.now() : null;
    const stmt = db.prepare(`
      UPDATE auto_trades SET status = ?, executed_at = ?, error_message = ? WHERE id = ?
    `);
    stmt.run(status, executedAt, errorMessage ?? null, id);
  },

  getRecent(limit: number = 50, platform?: Platform): any[] {
    let sql = 'SELECT * FROM auto_trades';
    const params: any[] = [];

    if (platform) {
      sql += ' WHERE platform = ?';
      params.push(platform);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    return stmt.all(...params) as any[];
  },

  countToday(): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const stmt = db.prepare('SELECT COUNT(*) as count FROM auto_trades WHERE created_at >= ?');
    return (stmt.get(todayStart.getTime()) as any).count;
  },

  countByStatus(status: AutoTradeStatus): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM auto_trades WHERE status = ?');
    return (stmt.get(status) as any).count;
  },
};

// ============================================
// Configuration operations
// ============================================

export const config = {
  get(key: string, platform?: Platform): string | undefined {
    let stmt;
    if (platform) {
      stmt = db.prepare('SELECT value FROM config WHERE key = ? AND platform = ?');
      const row = stmt.get(key, platform) as any;
      return row?.value;
    }
    stmt = db.prepare('SELECT value FROM config WHERE key = ? AND platform IS NULL');
    const row = stmt.get(key) as any;
    return row?.value;
  },

  set(key: string, value: string, platform?: Platform): void {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO config (key, value, platform, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key, platform) DO UPDATE SET value = ?, updated_at = ?
    `);
    stmt.run(key, value, platform ?? null, now, value, now);
  },

  getPlatformConfig(platform: Platform): PlatformConfig {
    return {
      minMarketLiquidity: parseInt(this.get('min_market_liquidity', platform) || '10000'),
      bigTradeUsdThreshold: parseInt(this.get('big_trade_usd_threshold', platform) || '1000'),
      bigTradePercentThreshold: parseFloat(this.get('big_trade_percent_threshold', platform) || '2'),
      pollingInterval: parseInt(this.get('polling_interval', platform) || '10'),
      enabled: this.get('enabled', platform) === 'true',
    };
  },

  setPlatformConfig(platform: Platform, data: Partial<PlatformConfig>): void {
    if (data.minMarketLiquidity !== undefined) {
      this.set('min_market_liquidity', data.minMarketLiquidity.toString(), platform);
    }
    if (data.bigTradeUsdThreshold !== undefined) {
      this.set('big_trade_usd_threshold', data.bigTradeUsdThreshold.toString(), platform);
    }
    if (data.bigTradePercentThreshold !== undefined) {
      this.set('big_trade_percent_threshold', data.bigTradePercentThreshold.toString(), platform);
    }
    if (data.pollingInterval !== undefined) {
      this.set('polling_interval', data.pollingInterval.toString(), platform);
    }
    if (data.enabled !== undefined) {
      this.set('enabled', data.enabled.toString(), platform);
    }
  },

  getGlobalConfig(): GlobalConfig {
    return {
      autoTradeEnabled: this.get('auto_trade_enabled') === 'true',
      autoTradeAmount: parseFloat(this.get('auto_trade_amount') || '1'),
      autoTradeProbabilityThreshold: parseFloat(this.get('auto_trade_probability_threshold') || '70'),
      dataRetentionDays: parseInt(this.get('data_retention_days') || '365'),
      notificationMethod: (this.get('notification_method') || 'telegram') as NotificationType,
    };
  },

  setGlobalConfig(data: Partial<GlobalConfig>): void {
    if (data.autoTradeEnabled !== undefined) {
      this.set('auto_trade_enabled', data.autoTradeEnabled.toString());
    }
    if (data.autoTradeAmount !== undefined) {
      this.set('auto_trade_amount', data.autoTradeAmount.toString());
    }
    if (data.autoTradeProbabilityThreshold !== undefined) {
      this.set('auto_trade_probability_threshold', data.autoTradeProbabilityThreshold.toString());
    }
    if (data.dataRetentionDays !== undefined) {
      this.set('data_retention_days', data.dataRetentionDays.toString());
    }
    if (data.notificationMethod !== undefined) {
      this.set('notification_method', data.notificationMethod);
    }
  },

  getAll(): Record<string, { value: string; platform?: string }> {
    const stmt = db.prepare('SELECT key, value, platform FROM config');
    const rows = stmt.all() as any[];
    const result: Record<string, { value: string; platform?: string }> = {};
    for (const row of rows) {
      const key = row.platform ? `${row.platform}_${row.key}` : row.key;
      result[key] = { value: row.value, platform: row.platform ?? undefined };
    }
    return result;
  },
};

// ============================================
// Notification settings operations
// ============================================

export const notificationSettings = {
  set(data: {
    type: NotificationType;
    config: NotificationConfig[NotificationType];
    isActive?: boolean;
    platform?: Platform;
  }): { id: string } {
    const id = uuidv4();
    const now = Date.now();

    // Deactivate existing of same type
    const deactivateStmt = db.prepare('UPDATE notification_settings SET is_active = 0 WHERE type = ? AND (platform = ? OR (platform IS NULL AND ? IS NULL))');
    deactivateStmt.run(data.type, data.platform ?? null, data.platform ?? null);

    // Insert new
    const stmt = db.prepare(`
      INSERT INTO notification_settings (id, type, config, is_active, platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.type, JSON.stringify(data.config), data.isActive !== false ? 1 : 0, data.platform ?? null, now, now);

    return { id };
  },

  get(type: NotificationType, platform?: Platform): { id: string; config: any; isActive: boolean } | null {
    let stmt;
    if (platform) {
      stmt = db.prepare('SELECT * FROM notification_settings WHERE type = ? AND platform = ? AND is_active = 1');
      const row = stmt.get(type, platform) as any;
      if (!row) return null;
      return {
        id: row.id,
        config: parseJSON(row.config),
        isActive: row.is_active === 1,
      };
    }
    stmt = db.prepare('SELECT * FROM notification_settings WHERE type = ? AND platform IS NULL AND is_active = 1');
    const row = stmt.get(type) as any;
    if (!row) return null;
    return {
      id: row.id,
      config: parseJSON(row.config),
      isActive: row.is_active === 1,
    };
  },

  getActive(): { type: NotificationType; config: any; platform?: Platform } | null {
    const stmt = db.prepare('SELECT * FROM notification_settings WHERE is_active = 1 LIMIT 1');
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      type: row.type,
      config: parseJSON(row.config),
      platform: row.platform ?? undefined,
    };
  },

  getAll(): { id: string; type: NotificationType; config: any; isActive: boolean; platform?: Platform }[] {
    const stmt = db.prepare('SELECT * FROM notification_settings ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      config: parseJSON(row.config),
      isActive: row.is_active === 1,
      platform: row.platform ?? undefined,
    }));
  },
};

// ============================================
// Dashboard stats
// ============================================

export function getDashboardStats(): DashboardStats {
  const totalTrades = trades.count();
  const suspiciousTrades = trades.count(undefined, true);
  const watchlistCount = watchlist.count(true);
  const autoTradesToday = autoTrades.countToday();

  // Calculate average insider probability
  const stmt = db.prepare('SELECT AVG(insider_probability) as avg FROM trades WHERE is_suspicious = 1 AND insider_probability IS NOT NULL');
  const avgResult = stmt.get() as any;

  return {
    totalTrades,
    suspiciousTrades,
    watchlistCount,
    autoTradesToday,
    detectionRate: totalTrades > 0 ? (suspiciousTrades / totalTrades) * 100 : 0,
    avgInsiderProbability: avgResult?.avg ?? 0,
  };
}

// ============================================
// Cleanup operations
// ============================================

export function cleanup(retentionDays: number): { tradesDeleted: number; logsDeleted: number; apiLogsDeleted: number } {
  const tradesDeleted = trades.deleteOld(retentionDays);
  const logsDeleted = detectionLogs.deleteOld(retentionDays);
  const apiLogsDeleted = apiLogs.deleteOld(72); // API logs always 72h

  return { tradesDeleted, logsDeleted, apiLogsDeleted };
}

// Export database for direct access if needed
export { db };
