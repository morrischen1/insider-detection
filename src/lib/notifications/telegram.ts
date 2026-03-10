/**
 * Telegram Notification Service
 */

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface TelegramMessage {
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

export async function sendTelegramNotification(
  config: TelegramConfig,
  message: TelegramMessage
): Promise<{ success: boolean; error?: string }> {
  const { botToken, chatId } = config;

  if (!botToken || !chatId) {
    return { success: false, error: 'Telegram credentials not configured' };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message.text,
          parse_mode: message.parse_mode || 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );

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

export function formatTelegramMessage(payload: {
  type: 'detection' | 'autotrade' | 'error' | 'info';
  platform: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): string {
  const emoji = {
    detection: '🚨',
    autotrade: '💰',
    error: '❌',
    info: 'ℹ️',
  };

  let text = `${emoji[payload.type]} <b>${payload.title}</b>\n\n`;
  text += `Platform: ${payload.platform.toUpperCase()}\n`;
  text += `${payload.message}\n`;

  if (payload.data) {
    text += '\n<b>Details:</b>\n';
    for (const [key, value] of Object.entries(payload.data)) {
      text += `• ${key}: ${value}\n`;
    }
  }

  text += `\n<i>Time: ${new Date().toISOString()}</i>`;

  return text;
}
