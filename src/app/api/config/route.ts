import { NextResponse } from 'next/server';
import { config } from '@/lib/db';
import type { Platform, PlatformConfig, GlobalConfig } from '@/types';

export async function GET() {
  try {
    const configData = {
      global: config.getGlobalConfig(),
      platforms: {
        polymarket: config.getPlatformConfig('polymarket'),
        kalshi: config.getPlatformConfig('kalshi'),
      },
    };

    return NextResponse.json({
      success: true,
      data: configData,
      timestamp: new Date(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { platform, updates } = body as {
      platform?: Platform;
      updates: Partial<PlatformConfig> | Partial<GlobalConfig>;
    };

    if (platform) {
      config.setPlatformConfig(platform, updates as Partial<PlatformConfig>);
    } else {
      config.setGlobalConfig(updates as Partial<GlobalConfig>);
    }

    return NextResponse.json({
      success: true,
      message: 'Configuration updated',
      timestamp: new Date(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}
