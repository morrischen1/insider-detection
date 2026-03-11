import { NextResponse } from 'next/server';
import { getLogs, exportLogs } from '@/lib/logger/system';
import { getApiLogs } from '@/lib/logger/api';
import type { Platform, LogType } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const platform = searchParams.get('platform') as Platform | null;
    const logType = searchParams.get('logType') as 'detection' | 'api' | null;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const export_ = searchParams.get('export') === 'true';

    if (logType === 'api' || type === 'api') {
      // Return API logs
      const result = getApiLogs({
        platform: platform || undefined,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: result.logs,
        total: result.total,
        hasMore: result.hasMore,
        timestamp: new Date(),
      });
    }

    if (export_) {
      const data = exportLogs({
        platform: platform || undefined,
        type: type as LogType | undefined,
      });

      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="logs.json"',
        },
      });
    }

    // Return detection logs
    const result = getLogs({
      platform: platform || undefined,
      type: type as LogType | undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.logs,
      total: result.total,
      hasMore: result.hasMore,
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
