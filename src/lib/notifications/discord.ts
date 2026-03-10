/**
 * Discord Notification Service
 */

interface DiscordConfig {
  webhookUrl: string;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export async function sendDiscordNotification(
  config: DiscordConfig,
  embed: DiscordEmbed
): Promise<{ success: boolean; error?: string }> {
  const { webhookUrl } = config;

  if (!webhookUrl) {
    return { success: false, error: 'Discord webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
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

export function formatDiscordEmbed(payload: {
  type: 'detection' | 'autotrade' | 'error' | 'info';
  platform: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): DiscordEmbed {
  const colors = {
    detection: 0xff0000, // Red
    autotrade: 0x00ff00, // Green
    error: 0xff6600, // Orange
    info: 0x0099ff, // Blue
  };

  const embed: DiscordEmbed = {
    title: payload.title,
    description: payload.message,
    color: colors[payload.type],
    timestamp: new Date().toISOString(),
    footer: {
      text: `${payload.platform.toUpperCase()} Insider Detection`,
    },
  };

  if (payload.data) {
    embed.fields = Object.entries(payload.data).map(([key, value]) => ({
      name: key,
      value: String(value),
      inline: false,
    }));
  }

  return embed;
}
