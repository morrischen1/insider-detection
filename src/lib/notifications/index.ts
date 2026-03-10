/**
 * Notification System
 * Unified notification handling for multiple channels
 */

import { notificationSettings } from '@/lib/db';
import { logger } from '@/lib/logger/system';
import { sendTelegramNotification, formatTelegramMessage } from './telegram';
import { sendDiscordNotification, formatDiscordEmbed } from './discord';
import { sendSlackNotification, formatSlackBlocks } from './slack';

import type { Platform, NotificationType, NotificationPayload } from '@/types';

// Track recent API errors to prevent spam
let lastApiErrorNotification: Date | null = null;
const API_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes

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
    if (payload.type === 'error' && payload.data?.apiError) {
      const now = new Date();
      if (lastApiErrorNotification) {
        const timeSinceLast = now.getTime() - lastApiErrorNotification.getTime();
        if (timeSinceLast < API_ERROR_COOLDOWN) {
          console.log('Skipping API error notification due to cooldown');
          return { success: true }; // Don't send but don't error
        }
      }
      lastApiErrorNotification = now;
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
      await logger.info(payload.platform, `Notification sent via ${type}`, {
        title: payload.title,
        type: payload.type,
      });
    } else {
      await logger.error(payload.platform, `Failed to send notification via ${type}`, {
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

// Export all notification functions
export {
  sendTelegramNotification,
  formatTelegramMessage,
  sendDiscordNotification,
  formatDiscordEmbed,
  sendSlackNotification,
  formatSlackBlocks,
};
