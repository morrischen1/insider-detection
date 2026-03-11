/**
 * Notification System
 * Supports Telegram, Discord, Slack, and custom webhooks
 */

import { notificationSettings } from './db';
import type { NotificationType, NotificationPayload } from '@/types';

interface NotificationConfig {
  telegram?: { botToken: string; chatId: string };
  discord?: { webhookUrl: string };
  slack?: { webhookUrl: string };
  webhook?: { url: string; headers?: Record<string, string> };
}

export function configureNotification(data: {
  type: NotificationType;
  config: NotificationConfig[NotificationType];
  isActive?: boolean;
}): void {
  notificationSettings.set({
    type: data.type,
    config: data.config,
    isActive: data.isActive ?? true,
  });
}

export function getNotificationSettings() {
  return notificationSettings.getAll();
}

export function getActiveNotification(): { type: NotificationType; config: any } | null {
  return notificationSettings.getActive();
}

export async function sendNotification(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  const activeNotification = getActiveNotification();
  if (!activeNotification) {
    return { success: false, error: 'No active notification settings configured' };
  }
  const { type, config } = activeNotification;
  try {
    switch (type) {
      case 'telegram': return await sendTelegramNotification(config, payload);
      case 'discord': return await sendDiscordNotification(config, payload);
      case 'slack': return await sendSlackNotification(config, payload);
      case 'webhook': return await sendWebhookNotification(config, payload);
      default: return { success: false, error: `Unknown notification type: ${type}` };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function testNotification(type: NotificationType): Promise<{ success: boolean; error?: string }> {
  const settings = notificationSettings.get(type);
  if (!settings) {
    return { success: false, error: 'No active notification settings configured' };
  }
  const testPayload: NotificationPayload = {
    type: 'info', platform: 'polymarket',
    title: 'Test Notification',
    message: 'This is a test notification from Insider Detection System.',
    timestamp: new Date(),
  };
  try {
    switch (type) {
      case 'telegram': return await sendTelegramNotification(settings.config, testPayload);
      case 'discord': return await sendDiscordNotification(settings.config, testPayload);
      case 'slack': return await sendSlackNotification(settings.config, testPayload);
      case 'webhook': return await sendWebhookNotification(settings.config, testPayload);
      default: return { success: false, error: `Unknown notification type: ${type}` };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function sendTelegramNotification(config: { botToken: string; chatId: string }, payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Telegram bot token or chat ID not configured' };
  }
  const text = `🔔 *${payload.title}*\n\n${payload.message}\n\n*Platform:* ${payload.platform.toUpperCase()}\n*Type:* ${payload.type.toUpperCase()}`;
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'Markdown' }),
  });
  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Telegram API error: ${error}` };
  }
  return { success: true };
}

async function sendDiscordNotification(config: { webhookUrl: string }, payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  if (!config.webhookUrl) {
    return { success: false, error: 'Discord webhook URL not configured' };
  }
  const color = payload.type === 'detection' ? 0xff0000 : payload.type === 'autotrade' ? 0x00ff00 : 0x0099ff;
  const embed = {
    title: payload.title,
    description: payload.message,
    color,
    fields: [
      { name: 'Platform', value: payload.platform.toUpperCase(), inline: true },
      { name: 'Type', value: payload.type.toUpperCase(), inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Discord API error: ${error}` };
  }
  return { success: true };
}

async function sendSlackNotification(config: { webhookUrl: string }, payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  if (!config.webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }
  const block = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: payload.title } },
      { type: 'section', text: { type: 'mrkdwn', text: payload.message }, fields: [
        { type: 'mrkdwn', text: `*Platform:*\n${payload.platform.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Type:*\n${payload.type.toUpperCase()}` },
      ]},
    ],
  };
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(block),
  });
  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Slack API error: ${error}` };
  }
  return { success: true };
}

async function sendWebhookNotification(config: { url: string; headers?: Record<string, string> }, payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
  if (!config.url) {
    return { success: false, error: 'Webhook URL not configured' };
  }
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...config.headers },
    body: JSON.stringify({ ...payload, timestamp: new Date(payload.timestamp).toISOString() }),
  });
  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Webhook error: ${error}` };
  }
  return { success: true };
}
