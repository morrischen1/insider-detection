import { NextResponse } from 'next/server';
import { watchlist, accounts } from '@/lib/db';
import type { Platform } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as Platform | null;
    const activeOnly = searchParams.get('active') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get watchlist entries
    const watchlistEntries = watchlist.getAll(activeOnly);
    const filtered = platform ? watchlistEntries.filter(w => w.platform === platform) : watchlistEntries;
    const paginated = filtered.slice(0, limit);

    // Enrich with account data
    const enriched = paginated.map(entry => {
      const account = accounts.findByPlatformAddress(entry.platform, entry.accountAddress);
      return {
        ...entry,
        account: account ? {
          address: account.address,
          totalTrades: account.totalTrades,
          totalVolume: account.totalVolume,
          winRate: account.winRate,
        } : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      total: filtered.length,
      page: 1,
      pageSize: limit,
      hasMore: filtered.length > limit,
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
    const { accountId, platform, reason, probability } = body;

    // Create watchlist entry
    const result = watchlist.add({
      accountId,
      platform,
      reason,
      probability: probability || 0,
    });

    return NextResponse.json({
      success: true,
      data: { id: result.id },
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

    // Deactivate watchlist entry
    watchlist.remove(id);

    return NextResponse.json({
      success: true,
      message: 'Removed from watchlist',
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
