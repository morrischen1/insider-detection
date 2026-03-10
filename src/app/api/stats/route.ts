import { NextResponse } from 'next/server';
import { trades, accounts, watchlist, autoTrades, detectionLogs, apiLogs, config } from '@/lib/db';
import type { Platform } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;

    // Get trade stats
    const totalTrades = trades.count(platform || undefined);
    const suspiciousTrades = trades.count(platform || undefined, true);

    // Get account stats
    const accountCount = accounts.count(platform || undefined);
    const watchlistCount = watchlist.count(true);

    // Get auto-trade stats
    const autoTradesToday = autoTrades.countToday();

    // Get recent detections
    const recentDetections = trades.getRecentDetections(10);

    // Get top suspicious accounts
    const watchlisted = accounts.getWatchlisted(platform || undefined);

    // Get log counts
    const logCount = detectionLogs.getRecent(1000, platform || undefined).length;
    const apiErrorCount = apiLogs.getErrors(100).length;

    // Calculate average probability
    const { db } = await import('@/lib/db');
    const avgStmt = db.prepare('SELECT AVG(insider_probability) as avg FROM trades WHERE is_suspicious = 1 AND insider_probability IS NOT NULL');
    const avgResult = avgStmt.get() as { avg: number | null };

    return NextResponse.json({
      success: true,
      data: {
        trades: {
          total: totalTrades,
          suspicious: suspiciousTrades,
          today: totalTrades, // Simplified
          detectionRate: totalTrades > 0 ? (suspiciousTrades / totalTrades) * 100 : 0,
          avgProbability: avgResult?.avg || 0,
        },
        accounts: {
          total: accountCount,
          watchlisted: watchlistCount,
        },
        logs: {
          total: logCount,
          errors: apiErrorCount,
        },
        autoTrade: {
          today: autoTradesToday,
          total: autoTrades.countByStatus('executed'),
          pending: autoTrades.countByStatus('pending'),
          failed: autoTrades.countByStatus('failed'),
        },
        recentDetections,
        topSuspiciousAccounts: watchlisted.slice(0, 10).map(a => ({
          address: a.address,
          platform: a.platform,
          totalTrades: a.totalTrades,
          totalVolume: a.totalVolume,
          winRate: a.winRate,
          watchlistReason: a.watchlistReason,
        })),
      },
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
