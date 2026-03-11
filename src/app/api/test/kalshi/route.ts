import { NextResponse } from 'next/server';
import { 
  getMarkets, 
  getCategories, 
  getOrderbook, 
  isKalshiAvailable 
} from '@/lib/kalshi/client';

export async function GET() {
  const startTime = Date.now();
  
  try {
    const marketsResult = await getMarkets({ status: 'open', limit: 5 });
    let categories: string[] = [];
    try { categories = await getCategories(); } catch {}
    
    let orderbookTest = null;
    if (marketsResult.markets?.length > 0) {
      try {
        const ticker = marketsResult.markets[0].ticker;
        const orderbook = await getOrderbook(ticker);
        orderbookTest = { success: true, ticker, yesBids: orderbook.yes?.length || 0 };
      } catch (e) {
        orderbookTest = { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
      }
    }
    
    const hasCredentials = isKalshiAvailable();
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      platform: 'kalshi',
      tests: {
        markets: { success: true, count: marketsResult.markets?.length || 0, sample: marketsResult.markets?.[0] ? { ticker: marketsResult.markets[0].ticker } : null },
        categories: { success: categories.length > 0, count: categories.length },
        orderbook: orderbookTest,
        credentials: { configured: hasCredentials },
      },
      responseTime,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      platform: 'kalshi',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
