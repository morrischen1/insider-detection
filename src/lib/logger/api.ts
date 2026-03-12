/**
 * API Logger
 * Logs API calls to the database and sends error notifications
 */

import { apiLogs, db } from '@/lib/db';
import { sendNotification } from '@/lib/notifications';
import type { Platform } from '@/types';

// Track recent error notifications to prevent spam
const recentErrorNotifications = new Map<string, Date>();
const ERROR_NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

interface ApiLogEntry {
  platform: Platform;
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  errorMessage?: string | null;
}

export function logApiCall(entry: ApiLogEntry): void {
  try {
    apiLogs.create({
      platform: entry.platform,
      endpoint: entry.endpoint,
      method: entry.method,
      status: entry.status,
      responseTime: entry.responseTime,
      errorMessage: entry.errorMessage,
    });

    // Send notification for API errors
    if (entry.status >= 400 || entry.errorMessage) {
      sendApiErrorNotification(entry);
    }
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
}

/**
 * Send notification for API errors via webhook
 */
async function sendApiErrorNotification(entry: ApiLogEntry): Promise<void> {
  const errorKey = `${entry.platform}-${entry.endpoint}`;
  const now = new Date();
  
  // Check cooldown to prevent spam
  const lastNotification = recentErrorNotifications.get(errorKey);
  if (lastNotification && now.getTime() - lastNotification.getTime() < ERROR_NOTIFICATION_COOLDOWN) {
    return;
  }
  
  recentErrorNotifications.set(errorKey, now);
  
  // Clean up old entries
  for (const [key, timestamp] of recentErrorNotifications.entries()) {
    if (now.getTime() - timestamp.getTime() > ERROR_NOTIFICATION_COOLDOWN * 2) {
      recentErrorNotifications.delete(key);
    }
  }
  
  try {
    await sendNotification({
      type: 'error',
      platform: entry.platform,
      title: 'API Error Detected',
      message: `Endpoint: ${entry.method} ${entry.endpoint}\nStatus: ${entry.status}\nError: ${entry.errorMessage || 'Unknown error'}\nResponse Time: ${entry.responseTime}ms`,
      data: {
        apiError: true,
        endpoint: entry.endpoint,
        method: entry.method,
        status: entry.status,
        errorMessage: entry.errorMessage,
        responseTime: entry.responseTime,
      },
      timestamp: now,
    });
  } catch (error) {
    console.error('Failed to send API error notification:', error);
  }
}

// Get API logs with filtering
export function getApiLogs(params: {
  platform?: Platform;
  endpoint?: string;
  status?: number;
  limit?: number;
  offset?: number;
}): { logs: Array<{ id: string; platform: string; endpoint: string; method: string; status: number; responseTime: number; errorMessage?: string; timestamp: Date }>; total: number; hasMore: boolean } {
  const { limit = 100, offset = 0 } = params;

  // Get all logs and filter in memory for now
  let sql = 'SELECT * FROM api_logs';
  const conditions: string[] = [];
  const sqlParams: any[] = [];

  if (params.platform) {
    conditions.push('platform = ?');
    sqlParams.push(params.platform);
  }
  if (params.endpoint) {
    conditions.push('endpoint LIKE ?');
    sqlParams.push(`%${params.endpoint}%`);
  }
  if (params.status) {
    conditions.push('status = ?');
    sqlParams.push(params.status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  sqlParams.push(limit + offset);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...sqlParams) as any[];

  const logs = rows.map(row => ({
    id: row.id,
    platform: row.platform,
    endpoint: row.endpoint,
    method: row.method,
    status: row.status,
    responseTime: row.response_time,
    errorMessage: row.error_message,
    timestamp: new Date(row.timestamp),
  }));

  return {
    logs: logs.slice(offset),
    total: logs.length,
    hasMore: logs.length > limit,
  };
}

// Clean up API logs older than 72 hours
export function cleanupApiLogs(): number {
  return apiLogs.deleteOld(72);
}

// Get API statistics
export function getApiStats(platform?: Platform): {
  totalCalls: number;
  avgResponseTime: number;
  errorRate: number;
  errors: Array<{
    endpoint: string;
    count: number;
    lastError: string;
  }>;
  last24h: number;
  byEndpoint: Array<{
    endpoint: string;
    count: number;
    avgResponseTime: number;
    errorCount: number;
  }>;
} {
  // Build query conditions
  let whereClause = '';
  const params: any[] = [];
  if (platform) {
    whereClause = 'WHERE platform = ?';
    params.push(platform);
  }

  // Get total calls
  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM api_logs ${whereClause}`);
  const totalResult = totalStmt.get(...params) as { count: number };
  const totalCalls = totalResult.count;

  // Get average response time
  const avgStmt = db.prepare(`SELECT AVG(response_time) as avg FROM api_logs ${whereClause}`);
  const avgResult = avgStmt.get(...params) as { avg: number | null };
  const avgResponseTime = avgResult.avg || 0;

  // Get error count
  const errorWhere = platform ? 'WHERE platform = ? AND status >= 400' : 'WHERE status >= 400';
  const errorParams = platform ? [platform] : [];
  const errorStmt = db.prepare(`SELECT COUNT(*) as count FROM api_logs ${errorWhere}`);
  const errorResult = errorStmt.get(...errorParams) as { count: number };
  const errorCount = errorResult.count;

  // Get last 24h count
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const last24hStmt = db.prepare(`SELECT COUNT(*) as count FROM api_logs ${whereClause ? whereClause + ' AND' : 'WHERE'} timestamp >= ?`);
  const last24hResult = last24hStmt.get(...params, last24h) as { count: number };

  // Get recent errors
  const errorsStmt = db.prepare(`SELECT endpoint, error_message FROM api_logs ${errorWhere} ORDER BY timestamp DESC LIMIT 50`);
  const errors = errorsStmt.all(...errorParams) as Array<{ endpoint: string; error_message: string | null }>;

  // Process errors
  const errorMap = new Map<string, { count: number; lastError: string }>();
  for (const error of errors) {
    const existing = errorMap.get(error.endpoint);
    if (existing) {
      existing.count++;
    } else {
      errorMap.set(error.endpoint, {
        count: 1,
        lastError: error.error_message || 'Unknown error',
      });
    }
  }

  // Get endpoint stats
  const endpointStmt = db.prepare(`
    SELECT endpoint, COUNT(*) as count, AVG(response_time) as avg_response_time
    FROM api_logs ${whereClause}
    GROUP BY endpoint
  `);
  const endpointStats = endpointStmt.all(...params) as Array<{
    endpoint: string;
    count: number;
    avg_response_time: number | null;
  }>;

  // Get error counts per endpoint
  const endpointErrorStmt = db.prepare(`
    SELECT endpoint, COUNT(*) as count
    FROM api_logs ${errorWhere}
    GROUP BY endpoint
  `);
  const endpointErrors = endpointErrorStmt.all(...errorParams) as Array<{
    endpoint: string;
    count: number;
  }>;

  const errorCountsMap = new Map(endpointErrors.map(e => [e.endpoint, e.count]));

  return {
    totalCalls,
    avgResponseTime,
    errorRate: totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
    errors: Array.from(errorMap.entries()).map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      lastError: data.lastError,
    })),
    last24h: last24hResult.count,
    byEndpoint: endpointStats.map(stat => ({
      endpoint: stat.endpoint,
      count: stat.count,
      avgResponseTime: stat.avg_response_time || 0,
      errorCount: errorCountsMap.get(stat.endpoint) || 0,
    })),
  };
}

// Run cleanup on interval
let cleanupInterval: NodeJS.Timeout | null = null;

export function startApiLogCleanup(): void {
  if (cleanupInterval) return;

  // Run cleanup every hour
  cleanupInterval = setInterval(() => {
    try {
      const count = cleanupApiLogs();
      console.log(`Cleaned up ${count} old API logs`);
    } catch (error) {
      console.error('Failed to cleanup API logs:', error);
    }
  }, 60 * 60 * 1000);
}

export function stopApiLogCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
