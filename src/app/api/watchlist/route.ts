import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Platform } from '@/types';

// Optimized for low-memory devices
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50); // Cap at 50

    // Single optimized query with join
    const sql = `
      SELECT w.id, w.platform, w.reason, w.probability, w.flagged_at, w.is_active,
             a.address as account_address, a.total_trades, a.total_volume, a.win_rate
      FROM watchlist w
      JOIN accounts a ON w.account_id = a.id
      WHERE w.is_active = 1
      ${platform ? 'AND w.platform = ?' : ''}
      ORDER BY w.flagged_at DESC
      LIMIT ?
    `;
    
    const stmt = db.prepare(sql);
    const rows = platform 
      ? stmt.all(platform, limit) as any[]
      : stmt.all(limit) as any[];

    const data = rows.map(row => ({
      id: row.id,
      platform: row.platform,
      accountAddress: row.account_address,
      reason: row.reason,
      probability: row.probability,
      flaggedAt: new Date(row.flagged_at),
      isActive: row.is_active === 1,
      account: {
        address: row.account_address,
        totalTrades: row.total_trades,
        totalVolume: row.total_volume,
        winRate: row.win_rate,
      },
    }));

    return NextResponse.json({
      success: true,
      data,
      total: data.length,
      page: 1,
      pageSize: limit,
      hasMore: false,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Watchlist error:', error);
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
    const { accountId, platform, reason, probability } = body;

    if (!accountId || !platform || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    // Direct SQL for efficiency
    db.prepare(`
      INSERT INTO watchlist (id, account_id, platform, reason, probability, flagged_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, accountId, platform, reason, probability || 0, now);

    return NextResponse.json({
      success: true,
      data: { id },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Watchlist POST error:', error);
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    db.prepare('UPDATE watchlist SET is_active = 0 WHERE id = ?').run(id);

    return NextResponse.json({
      success: true,
      message: 'Removed from watchlist',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Watchlist DELETE error:', error);
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
