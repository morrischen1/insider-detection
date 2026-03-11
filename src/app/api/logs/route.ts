import { NextResponse } from 'next/server';
import { detectionLogs } from '@/lib/db';
import type { Platform, LogType } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as LogType | null;
    const platform = searchParams.get('platform') as Platform | null;
    const limit = parseInt(searchParams.get('limit') || '100');

    const logs = detectionLogs.getRecent(limit, platform || undefined, type || undefined);

    return NextResponse.json({
      success: true,
      data: logs,
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
