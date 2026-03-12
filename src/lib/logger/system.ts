/**
 * System Logger
 * Logs system activity to the database and sends error notifications
 */

import { detectionLogs } from '@/lib/db';
import { sendNotification } from '@/lib/notifications';
import type { Platform, LogType } from '@/types';

// Track recent system error notifications to prevent spam
const recentSystemErrorNotifications = new Map<string, Date>();
const SYSTEM_ERROR_NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

interface LogEntry {
  platform: Platform;
  type: LogType;
  message: string;
  details?: Record<string, unknown>;
}

export function logDetection(entry: LogEntry): void {
  try {
    detectionLogs.create({
      platform: entry.platform,
      type: entry.type,
      message: entry.message,
      details: entry.details,
    });

    // Send notification for system errors
    if (entry.type === 'error') {
      sendSystemErrorNotification(entry);
    }
  } catch (error) {
    console.error('Failed to log detection:', error);
  }
}

/**
 * Send notification for system errors via webhook
 */
async function sendSystemErrorNotification(entry: LogEntry): Promise<void> {
  const errorKey = `${entry.platform}-${entry.message.slice(0, 50)}`;
  const now = new Date();
  
  // Check cooldown to prevent spam
  const lastNotification = recentSystemErrorNotifications.get(errorKey);
  if (lastNotification && now.getTime() - lastNotification.getTime() < SYSTEM_ERROR_NOTIFICATION_COOLDOWN) {
    return;
  }
  
  recentSystemErrorNotifications.set(errorKey, now);
  
  // Clean up old entries
  for (const [key, timestamp] of recentSystemErrorNotifications.entries()) {
    if (now.getTime() - timestamp.getTime() > SYSTEM_ERROR_NOTIFICATION_COOLDOWN * 2) {
      recentSystemErrorNotifications.delete(key);
    }
  }
  
  try {
    await sendNotification({
      type: 'error',
      platform: entry.platform,
      title: 'System Error Detected',
      message: `${entry.message}${entry.details ? `\nDetails: ${JSON.stringify(entry.details)}` : ''}`,
      data: {
        systemError: true,
        message: entry.message,
        details: entry.details,
      },
      timestamp: now,
    });
  } catch (error) {
    console.error('Failed to send system error notification:', error);
  }
}

// Convenience functions
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

// Export logs as JSON
export function exportLogs(params: {
  platform?: Platform;
  type?: LogType;
}): string {
  const logs = detectionLogs.getRecent(10000, params.platform, params.type);
  return JSON.stringify(logs, null, 2);
}

// Get log statistics
export function getLogStats(platform?: Platform): {
  total: number;
  byType: Record<LogType, number>;
  last24h: number;
  last7d: number;
} {
  const logs = detectionLogs.getRecent(10000, platform);

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
