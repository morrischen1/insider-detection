/**
 * Notification System (Optimized)
 * Unified notification handling for multiple channels
 * 
 * Optimizations:
 * - Bounded tracking for API error notifications
 * - Proper cooldown management
 */

import { notificationSettings } from '@/lib/db';
import { logger } from '@/lib/logger/system';
import { sendTelegramNotification, formatTelegramMessage } from './telegram';
import { sendDiscordNotification, formatDiscordEmbed } from './discord';
import { sendSlackNotification, formatSlackBlocks } from './slack';
import { BoundedMap } from '@/lib/utils/memory';

import type { Platform, NotificationType, NotificationPayload } from '@/types';

// Configuration
const MAX_API_ERROR_TRACKING = 50;
const API_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Track recent API errors to prevent spam - Bounded to prevent memory leak
const recentApiErrors = new BoundedMap<string, Date>(
  MAX_API_ERROR_TRACKING,
  API_ERROR_COOLDOWN * 2
);

/**
 * Get active notification settings
 */
function getActiveNotificationSettings(): {
  type: NotificationType;
  config: Record<string, string>;
} | null {
  try {
    const settings = notificationSettings.getActive();

    if (!settings) {
      return null;
    }

    return {
      type: settings.type,
      config: settings.config,
    };
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return null;
  }
}

/**
 * Check if we should send an API error notification (with cooldown)
 */
function shouldSendApiErrorNotification(payload: NotificationPayload): boolean {
  if (payload.type !== 'error' || !payload.data?.apiError) {
    return true;
  }

  // Create a key from the error details
  const errorKey = `${payload.platform}-${payload.data.endpoint || 'unknown'}`;
  const now = new Date();

  // Check cooldown
  if (recentApiErrors.has(errorKey)) {
    return false;
  }

  // Record this error
  recentApiErrors.set(errorKey, now);
  return true;
}

/**
 * Send notification via configured channel
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = getActiveNotificationSettings();

    if (!settings) {
      console.log('No active notification settings configured');
      return { success: false, error: 'No notification settings configured' };
    }

    const { type, config } = settings;

    // For API errors, check cooldown to prevent spam
    if (!shouldSendApiErrorNotification(payload)) {
      return { success: true }; // Don't send but don't error
    }

    let result: { success: boolean; error?: string };

    switch (type) {
      case 'telegram':
        result = await sendTelegramNotification(
          {
            botToken: config.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
            chatId: config.chatId || process.env.TELEGRAM_CHAT_ID || '',
          },
          { text: formatTelegramMessage(payload) }
        );
        break;

      case 'discord':
        result = await sendDiscordNotification(
          { webhookUrl: config.webhookUrl || process.env.DISCORD_WEBHOOK_URL || '' },
          formatDiscordEmbed(payload)
        );
        break;

      case 'slack':
        result = await sendSlackNotification(
          { webhookUrl: config.webhookUrl || process.env.SLACK_WEBHOOK_URL || '' },
          formatSlackBlocks(payload)
        );
        break;

      case 'webhook':
        result = await sendWebhookNotification(
          {
            url: config.url || process.env.CUSTOM_WEBHOOK_URL || '',
            headers: config.headers ? (typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers) : {},
          },
          payload
        );
        break;

      default:
        return { success: false, error: `Unknown notification type: ${type}` };
    }

    if (result.success) {
      // Log success (fire and forget - logger doesn't return a promise)
      logger.info(payload.platform, `Notification sent via ${type}`, {
        title: payload.title,
        type: payload.type,
      });
    } else {
      logger.error(payload.platform, `Failed to send notification via ${type}`, {
        error: result.error,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send notification via custom webhook
 */
async function sendWebhookNotification(
  config: {
    url: string;
    headers?: Record<string, string>;
  },
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  const { url, headers = {} } = config;

  if (!url) {
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        ...payload,
        timestamp: payload.timestamp.toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Configure notification settings
 */
export function configureNotification(params: {
  type: NotificationType;
  config: Record<string, string>;
  platform?: Platform;
}): void {
  notificationSettings.set({
    type: params.type,
    config: params.config as any,
    isActive: true,
    platform: params.platform,
  });
}

/**
 * Get notification settings
 */
export function getNotificationSettings(): Array<{
  id: string;
  type: NotificationType;
  config: Record<string, string>;
  isActive: boolean;
  platform?: Platform;
}> {
  const settings = notificationSettings.getAll();

  return settings.map(s => ({
    id: s.id,
    type: s.type,
    config: s.config,
    isActive: s.isActive,
    platform: s.platform,
  }));
}

/**
 * Test notification
 */
export async function testNotification(type: NotificationType): Promise<{
  success: boolean;
  error?: string;
}> {
  const platform: Platform = 'polymarket';

  return sendNotification({
    type: 'info',
    platform,
    title: 'Test Notification',
    message: 'This is a test notification from the Insider Trade Detection System.',
    timestamp: new Date(),
  });
}

/**
 * Cleanup resources - Call this on shutdown
 */
export function cleanup(): void {
  recentApiErrors.clear();
  console.log('Notification system cleanup completed');
}

/**
 * Get notification tracking stats for monitoring
 */
export function getNotificationStats(): {
  trackedErrors: number;
  maxTracked: number;
} {
  return {
    trackedErrors: recentApiErrors.size,
    maxTracked: MAX_API_ERROR_TRACKING,
  };
}

// Export all notification functions
export {
  sendTelegramNotification,
  formatTelegramMessage,
  sendDiscordNotification,
  formatDiscordEmbed,
  sendSlackNotification,
  formatSlackBlocks,
};
