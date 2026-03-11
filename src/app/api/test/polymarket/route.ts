import { NextResponse } from 'next/server';
import { 
  getMarkets, 
  getEvents, 
  getTags,
  getActiveMarketsWithLiquidity 
} from '@/lib/polymarket/gamma';

export async function GET() {
  const startTime = Date.now();
  
  try {
    const markets = await getMarkets({ active: true, limit: 5 });
    const events = await getEvents({ active: true, limit: 5 });
    const tags = await getTags();
    const liquidMarkets = await getActiveMarketsWithLiquidity(10000);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      platform: 'polymarket',
      tests: {
        markets: { success: true, count: markets.length, sample: markets[0] ? { id: markets[0].id, question: markets[0].question?.substring(0, 100) } : null },
        events: { success: true, count: events.length },
        tags: { success: true, count: tags.length },
        liquidMarkets: { success: true, count: liquidMarkets.length },
      },
      responseTime,
      timestamp: new Date(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      platform: 'polymarket',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    }, { status: 500 });
  }
}
