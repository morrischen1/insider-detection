import { NextResponse } from 'next/server';
import {
  executeAutoTrade,
  getAutoTradeHistory,
  getAutoTradeStats,
} from '@/lib/autotrade/executor';
import type { Platform, AutoTradeStatus } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;
    const status = searchParams.get('status') as AutoTradeStatus | null;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const stats = searchParams.get('stats') === 'true';

    if (stats) {
      const statsData = getAutoTradeStats(platform || undefined);
      return NextResponse.json({
        success: true,
        data: statsData,
        timestamp: new Date(),
      });
    }

    const result = getAutoTradeHistory({
      platform: platform || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.trades,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { platform, marketId, outcome, amount, triggerTradeId, probability } = body;

    const result = await executeAutoTrade({
      platform,
      marketId,
      outcome,
      amount,
      triggerTradeId,
      probability,
    });

    return NextResponse.json({
      success: result.success,
      data: result.success
        ? { autoTradeId: result.autoTradeId, executedAt: result.executedAt }
        : { error: result.errorMessage },
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
