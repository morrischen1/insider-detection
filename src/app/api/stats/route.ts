import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Platform } from '@/types';

// Optimized stats endpoint for low-memory devices
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;
    const platformWhere = platform ? `WHERE platform = '${platform}'` : '';

    // Single optimized query for all counts
    const statsStmt = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM trades ${platformWhere}) as total_trades,
        (SELECT COUNT(*) FROM trades ${platformWhere ? platformWhere + ' AND' : 'WHERE'} is_suspicious = 1) as suspicious_trades,
        (SELECT COUNT(*) FROM accounts ${platformWhere}) as total_accounts,
        (SELECT COUNT(*) FROM watchlist WHERE is_active = 1) as watchlist_count,
        (SELECT COUNT(*) FROM auto_trades WHERE created_at >= ?) as auto_trades_today,
        (SELECT AVG(insider_probability) FROM trades WHERE is_suspicious = 1 AND insider_probability IS NOT NULL) as avg_probability
    `);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const stats = statsStmt.get(todayStart.getTime()) as any;

    // Get recent detections with single query (limited for memory)
    const recentDetectionsStmt = db.prepare(`
      SELECT t.id, t.platform, t.market_id, t.market_ticker, t.outcome, t.usd_value, 
             t.insider_probability, t.timestamp, a.address as account_address
      FROM trades t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.is_suspicious = 1
      ORDER BY t.timestamp DESC
      LIMIT 10
    `);
    const recentDetections = (recentDetectionsStmt.all() as any[]).map(row => ({
      id: row.id,
      platform: row.platform,
      marketId: row.market_id,
      marketTicker: row.market_ticker ?? undefined,
      outcome: row.outcome,
      usdValue: row.usd_value,
      insiderProbability: row.insider_probability ?? 0,
      timestamp: new Date(row.timestamp),
      accountAddress: row.account_address,
    }));

    const totalTrades = stats.total_trades || 0;
    const suspiciousTrades = stats.suspicious_trades || 0;

    return NextResponse.json({
      success: true,
      data: {
        trades: {
          total: totalTrades,
          suspicious: suspiciousTrades,
          today: totalTrades,
          detectionRate: totalTrades > 0 ? (suspiciousTrades / totalTrades) * 100 : 0,
          avgProbability: stats.avg_probability || 0,
        },
        accounts: {
          total: stats.total_accounts || 0,
          watchlisted: stats.watchlist_count || 0,
        },
        logs: {
          total: 0, // Skip for memory savings
          errors: 0, // Skip for memory savings
        },
        autoTrade: {
          today: stats.auto_trades_today || 0,
          total: 0, // Skip for memory savings
          pending: 0,
          failed: 0,
        },
        recentDetections,
        topSuspiciousAccounts: [], // Skip for memory savings
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Stats error:', error);
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
