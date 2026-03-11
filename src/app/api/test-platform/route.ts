import { NextResponse } from 'next/server';
import { sendNotification } from '@/lib/notifications';
import type { Platform } from '@/types';

interface TestResult {
  platform: Platform;
  success: boolean;
  responseTime: number;
  marketsFound?: number;
  sampleMarket?: string;
  error?: string;
}

/**
 * Test Polymarket API connectivity
 */
async function testPolymarket(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Test the Gamma API - public endpoint
    const response = await fetch('https://gamma-api.polymarket.com/markets?limit=5&active=true', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        platform: 'polymarket',
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    const markets = Array.isArray(data) ? data : [];
    
    return {
      platform: 'polymarket',
      success: true,
      responseTime,
      marketsFound: markets.length,
      sampleMarket: markets[0]?.question || markets[0]?.slug || 'N/A',
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      platform: 'polymarket',
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test Kalshi API connectivity
 */
async function testKalshi(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Test the public markets endpoint
    const response = await fetch('https://trading-api.kalshi.com/markets?limit=5&status=open', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        platform: 'kalshi',
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    const markets = data.markets || [];
    
    return {
      platform: 'kalshi',
      success: true,
      responseTime,
      marketsFound: markets.length,
      sampleMarket: markets[0]?.title || markets[0]?.ticker || 'N/A',
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      platform: 'kalshi',
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format test result as notification message
 */
function formatTestMessage(result: TestResult): string {
  const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
  const lines = [
    `🔍 API Test: ${result.platform.toUpperCase()}`,
    `Status: ${status}`,
    `Response Time: ${result.responseTime}ms`,
  ];
  
  if (result.success && result.marketsFound !== undefined) {
    lines.push(`Markets Found: ${result.marketsFound}`);
    if (result.sampleMarket) {
      lines.push(`Sample Market: ${result.sampleMarket.substring(0, 50)}${result.sampleMarket.length > 50 ? '...' : ''}`);
    }
  }
  
  if (!result.success && result.error) {
    lines.push(`Error: ${result.error}`);
  }
  
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  
  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { platform, sendNotification: shouldNotify = true } = body;
    
    if (!platform || !['polymarket', 'kalshi', 'all'].includes(platform)) {
      return NextResponse.json(
        { success: false, error: 'Invalid platform. Use "polymarket", "kalshi", or "all"' },
        { status: 400 }
      );
    }
    
    let results: TestResult[] = [];
    
    if (platform === 'polymarket' || platform === 'all') {
      results.push(await testPolymarket());
    }
    
    if (platform === 'kalshi' || platform === 'all') {
      results.push(await testKalshi());
    }
    
    // Send notification if requested and there are results
    if (shouldNotify && results.length > 0) {
      for (const result of results) {
        const message = formatTestMessage(result);
        await sendNotification({
          type: result.success ? 'info' : 'error',
          platform: result.platform,
          title: `API Test: ${result.platform.toUpperCase()}`,
          message,
          timestamp: new Date(),
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
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
