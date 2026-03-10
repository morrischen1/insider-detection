import { NextResponse } from 'next/server';
import { trades, accounts } from '@/lib/db';
import type { Platform } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;
    const suspicious = searchParams.get('suspicious');
    const limit = parseInt(searchParams.get('limit') || '50');

    const suspiciousOnly = suspicious === 'true';

    // Get trades
    const tradesList = trades.getRecent(limit, platform || undefined, suspiciousOnly);

    // Enrich with account data
    const enrichedTrades = tradesList.map(trade => {
      const account = accounts.findById(trade.accountId);
      return {
        ...trade,
        account: account ? {
          address: account.address,
          isWatchlisted: account.isWatchlisted,
          winRate: account.winRate,
        } : null,
      };
    });

    const total = trades.count(platform || undefined, suspiciousOnly);

    return NextResponse.json({
      success: true,
      data: enrichedTrades,
      total,
      page: 1,
      pageSize: limit,
      hasMore: enrichedTrades.length === limit,
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
