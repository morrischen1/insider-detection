/**
 * API Logger (Optimized)
 * Logs API calls to the database and sends error notifications
 * 
 * Optimizations:
 * - Bounded map for error notification tracking
 * - Automatic cleanup with proper resource management
 * - Reduced memory footprint
 */

import { apiLogs, db } from '@/lib/db';
import { sendNotification } from '@/lib/notifications';
import { BoundedMap } from '@/lib/utils/memory';
import type { Platform } from '@/types';

// Configuration
const MAX_ERROR_NOTIFICATIONS_TRACKED = 100;
const ERROR_NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface ApiLogEntry {
  platform: Platform;
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  errorMessage?: string | null;
}

// Track recent error notifications to prevent spam - Bounded to prevent memory leak
const recentErrorNotifications = new BoundedMap<string, Date>(
  MAX_ERROR_NOTIFICATIONS_TRACKED,
  ERROR_NOTIFICATION_COOLDOWN * 2
);

// Cleanup interval reference
let cleanupInterval: NodeJS.Timeout | null = null;

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

    // Log errors to detection_logs as well (so they show in dashboard)
    if (entry.status >= 400 || entry.errorMessage) {
      // Log to detection_logs for dashboard visibility
      try {
        const id = crypto.randomUUID();
        db.prepare(`
          INSERT INTO detection_logs (id, platform, type, message, details, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          id,
          entry.platform,
          'error',
          `API Error: ${entry.method} ${entry.endpoint} - Status ${entry.status}`,
          JSON.stringify({
            endpoint: entry.endpoint,
            method: entry.method,
            status: entry.status,
            errorMessage: entry.errorMessage,
            responseTime: entry.responseTime,
          }),
          Date.now()
        );
      } catch (e) {
        console.error('Failed to log API error to detection_logs:', e);
      }
      
      // Send notification via webhook
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
  if (recentErrorNotifications.has(errorKey)) {
    return;
  }
  
  recentErrorNotifications.set(errorKey, now);
  
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

  // Build query with proper pagination
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
  
  // Get total count first
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
  const countStmt = db.prepare(countSql);
  const totalResult = countStmt.get(...sqlParams) as { count: number };
  const total = totalResult.count;
  
  // Now get paginated results
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  sqlParams.push(limit, offset);

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
    logs,
    total,
    hasMore: total > offset + limit,
  };
}

// Clean up API logs older than specified hours
export function cleanupApiLogs(hours: number = 72): number {
  return apiLogs.deleteOld(hours);
}

// Get API statistics - Optimized with single queries
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
  const whereClause = platform ? 'WHERE platform = ?' : '';
  const params: any[] = platform ? [platform] : [];

  // Get all stats in a single transaction for consistency
  const getStats = db.transaction(() => {
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
    const last24hWhere = platform 
      ? 'WHERE platform = ? AND timestamp >= ?' 
      : 'WHERE timestamp >= ?';
    const last24hParams = platform ? [platform, last24h] : [last24h];
    const last24hStmt = db.prepare(`SELECT COUNT(*) as count FROM api_logs ${last24hWhere}`);
    const last24hResult = last24hStmt.get(...last24hParams) as { count: number };

    // Get recent errors - limit to 50 for memory efficiency
    const errorsStmt = db.prepare(`SELECT endpoint, error_message FROM api_logs ${errorWhere} ORDER BY timestamp DESC LIMIT 50`);
    const errors = errorsStmt.all(...errorParams) as Array<{ endpoint: string; error_message: string | null }>;

    // Process errors into map
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
      errorCount,
      last24hResult,
      errorMap,
      endpointStats,
      errorCountsMap,
    };
  });

  const stats = getStats();

  return {
    totalCalls: stats.totalCalls,
    avgResponseTime: stats.avgResponseTime,
    errorRate: stats.totalCalls > 0 ? (stats.errorCount / stats.totalCalls) * 100 : 0,
    errors: Array.from(stats.errorMap.entries()).map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      lastError: data.lastError,
    })),
    last24h: stats.last24hResult.count,
    byEndpoint: stats.endpointStats.map(stat => ({
      endpoint: stat.endpoint,
      count: stat.count,
      avgResponseTime: stat.avg_response_time || 0,
      errorCount: stats.errorCountsMap.get(stat.endpoint) || 0,
    })),
  };
}

// Start periodic cleanup
export function startApiLogCleanup(): void {
  if (cleanupInterval) return;

  // Run cleanup every hour
  cleanupInterval = setInterval(() => {
    try {
      const count = cleanupApiLogs();
      if (count > 0) {
        console.log(`Cleaned up ${count} old API logs`);
      }
      
      // Also cleanup error notifications map
      const removed = recentErrorNotifications.cleanup();
      if (removed > 0) {
        console.log(`Cleaned up ${removed} old error notification entries`);
      }
    } catch (error) {
      console.error('Failed to cleanup API logs:', error);
    }
  }, CLEANUP_INTERVAL_MS);
  
  // Don't prevent the process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

// Stop cleanup and release resources
export function stopApiLogCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  recentErrorNotifications.clear();
}

// Alias for shutdown handler compatibility
export function cleanup(): void {
  stopApiLogCleanup();
}

// Initialize cleanup on module load
startApiLogCleanup();
