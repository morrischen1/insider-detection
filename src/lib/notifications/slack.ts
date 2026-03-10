/**
 * Slack Notification Service
 */

interface SlackConfig {
  webhookUrl: string;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

export async function sendSlackNotification(
  config: SlackConfig,
  blocks: SlackBlock[]
): Promise<{ success: boolean; error?: string }> {
  const { webhookUrl } = config;

  if (!webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
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

export function formatSlackBlocks(payload: {
  type: 'detection' | 'autotrade' | 'error' | 'info';
  platform: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): SlackBlock[] {
  const emojis = {
    detection: ':rotating_light:',
    autotrade: ':moneybag:',
    error: ':x:',
    info: ':information_source:',
  };

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emojis[payload.type]} ${payload.title}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Platform:* ${payload.platform.toUpperCase()}\n${payload.message}`,
      },
    },
  ];

  if (payload.data && Object.keys(payload.data).length > 0) {
    blocks.push({
      type: 'section',
      fields: Object.entries(payload.data).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${value}`,
      })),
    });
  }

  blocks.push({
    type: 'context',
    text: {
      type: 'mrkdwn',
      text: `_Time: ${new Date().toISOString()}_`,
    },
  });

  return blocks;
}
