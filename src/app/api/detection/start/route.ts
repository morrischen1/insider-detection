import { NextResponse } from 'next/server';
import { startDetection, startAllDetection } from '@/lib/detection/engine';
import type { Platform } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { platform } = body as { platform?: Platform };

    if (platform) {
      await startDetection(platform);
      return NextResponse.json({
        success: true,
        message: `Detection started for ${platform}`,
        timestamp: new Date(),
      });
    } else {
      await startAllDetection();
      return NextResponse.json({
        success: true,
        message: 'Detection started for all platforms',
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
