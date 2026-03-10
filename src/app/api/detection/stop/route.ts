import { NextResponse } from 'next/server';
import { stopDetection, stopAllDetection } from '@/lib/detection/engine';
import type { Platform } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { platform } = body as { platform?: Platform };

    if (platform) {
      await stopDetection(platform);
      return NextResponse.json({
        success: true,
        message: `Detection stopped for ${platform}`,
        timestamp: new Date(),
      });
    } else {
      await stopAllDetection();
      return NextResponse.json({
        success: true,
        message: 'Detection stopped for all platforms',
        timestamp: new Date(),
      });
    }
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
