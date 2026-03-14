/**
 * System Logger (Optimized)
 * Logs system activity to the database and sends error notifications
 * 
 * Optimizations:
 * - Bounded map for error notification tracking
 * - Periodic cleanup of old entries
 * - Resource cleanup on shutdown
 * - No circular dependencies
 */

import { detectionLogs } from '@/lib/db';
import { BoundedMap } from '@/lib/utils/memory';
import type { Platform, LogType } from '@/types';

// Configuration
const MAX_ERROR_NOTIFICATIONS_TRACKED = 100;
const SYSTEM_ERROR_NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Track recent system error notifications to prevent spam - Bounded to prevent memory leak
const recentSystemErrorNotifications = new BoundedMap<string, Date>(
  MAX_ERROR_NOTIFICATIONS_TRACKED,
  SYSTEM_ERROR_NOTIFICATION_COOLDOWN * 2
);

// Cleanup interval reference
let cleanupInterval: NodeJS.Timeout | null = null;

interface LogEntryInternal {
  platform: Platform;
  type: LogType;
  message: string;
  details?: Record<string, unknown>;
}

export function logDetection(entry: LogEntryInternal): void {
  try {
    detectionLogs.create({
      platform: entry.platform,
      type: entry.type,
      message: entry.message,
      details: entry.details,
    });
  } catch (error) {
    console.error('Failed to log detection:', error);
  }
}

// Convenience logger functions
export const logger = {
  info: (platform: Platform, message: string, details?: Record<string, unknown>) =>
    logDetection({ platform, type: 'info', message, details }),

  warning: (platform: Platform, message: string, details?: Record<string, unknown>) =>
    logDetection({ platform, type: 'warning', message, details }),

  error: (platform: Platform, message: string, details?: Record<string, unknown>) =>
    logDetection({ platform, type: 'error', message, details }),

  detection: (platform: Platform, message: string, details?: Record<string, unknown>) =>
    logDetection({ platform, type: 'detection', message, details }),

  autotrade: (platform: Platform, message: string, details?: Record<string, unknown>) =>
    logDetection({ platform, type: 'autotrade', message, details }),
};

// Get logs with filtering
export function getLogs(params: {
  platform?: Platform;
  type?: LogType;
  limit?: number;
  offset?: number;
}): { logs: Array<{ id: string; platform: string; type: string; message: string; details?: Record<string, unknown>; timestamp: Date }>; total: number; hasMore: boolean } {
  const { platform, type, limit = 100, offset = 0 } = params;

  const logs = detectionLogs.getRecent(limit + offset, platform, type);
  const paginatedLogs = logs.slice(offset, offset + limit);

  return {
    logs: paginatedLogs,
    total: logs.length,
    hasMore: logs.length > offset + limit,
  };
}

// Clean up old logs based on retention policy
export function cleanupOldLogs(retentionDays: number = 365): number {
  return detectionLogs.deleteOld(retentionDays);
}

// Export logs as JSON - Limited to prevent memory issues
export function exportLogs(params: {
  platform?: Platform;
  type?: LogType;
  limit?: number;
}): string {
  const limit = Math.min(params.limit || 1000, 5000); // Cap at 5000 to prevent memory issues
  const logs = detectionLogs.getRecent(limit, params.platform, params.type);
  return JSON.stringify(logs, null, 2);
}

// Get log statistics - Optimized with reasonable limit
export function getLogStats(platform?: Platform): {
  total: number;
  byType: Record<LogType, number>;
  last24h: number;
  last7d: number;
} {
  // Use a reasonable limit for stats calculation
  const logs = detectionLogs.getRecent(5000, platform);

  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const last7d = now - 7 * 24 * 60 * 60 * 1000;

  const byType: Record<LogType, number> = {
    info: 0,
    warning: 0,
    error: 0,
    detection: 0,
    autotrade: 0,
  };

  let last24hCount = 0;
  let last7dCount = 0;

  for (const log of logs) {
    byType[log.type as LogType]++;
    const logTime = log.timestamp.getTime();
    if (logTime >= last24h) last24hCount++;
    if (logTime >= last7d) last7dCount++;
  }

  return {
    total: logs.length,
    byType,
    last24h: last24hCount,
    last7d: last7dCount,
  };
}

/**
 * Start periodic cleanup of old notification tracking entries
 */
export function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const removed = recentSystemErrorNotifications.cleanup();
    if (removed > 0) {
      console.log(`Cleaned up ${removed} old error notification entries`);
    }
  }, CLEANUP_INTERVAL);
  
  // Don't prevent the process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Stop cleanup and release resources
 */
export function cleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  recentSystemErrorNotifications.clear();
}

// Auto-start cleanup
startCleanup();
