/**
 * Auto-Trade Executor (Optimized)
 * Executes automatic trades when insider trades are detected
 * 
 * Optimizations:
 * - Bounded map for rate limiting to prevent memory leak
 * - Proper resource cleanup
 * - Sliding window rate limiter for better accuracy
 */

import { autoTrades, db } from '@/lib/db';
import { logger } from '@/lib/logger/system';
import { sendNotification } from '@/lib/notifications';
import { clobClient } from '@/lib/polymarket/clob';
import { kalshiClient } from '@/lib/kalshi/client';
import { SlidingWindowRateLimiter } from '@/lib/utils/memory';

import type {
  Platform,
  Outcome,
  AutoTradeRequest,
  AutoTradeResult,
  AutoTradeStatus,
} from '@/types';

// Configuration
const DEFAULT_RATE_LIMIT = 10; // Max trades per hour per platform
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// Sliding window rate limiter - automatically cleans up old entries
const rateLimiter = new SlidingWindowRateLimiter(
  RATE_LIMIT_WINDOW,
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_WINDOW // Auto cleanup every hour
);

/**
 * Check rate limit for auto-trades
 */
function checkRateLimit(platform: Platform, limit?: number): boolean {
  const maxTrades = limit || DEFAULT_RATE_LIMIT;
  
  // Temporarily update max requests if custom limit provided
  const key = `${platform}-autotrade`;
  
  // Check current count
  const currentCount = rateLimiter.getCount(key);
  
  if (currentCount >= maxTrades) {
    return false;
  }
  
  // Use the rate limiter
  return rateLimiter.isAllowed(key);
}

/**
 * Execute auto-trade on Polymarket
 */
async function executePolymarketAutoTrade(
  request: AutoTradeRequest
): Promise<AutoTradeResult> {
  try {
    // Check if CLOB client is available
    if (!clobClient.isClobAvailable()) {
      return {
        success: false,
        errorMessage: 'Polymarket CLOB API credentials not configured',
      };
    }

    // Get current market price
    const orderbook = await clobClient.getOrderbook(request.marketId, request.outcome);
    const bestAsk = orderbook.asks[0];

    if (!bestAsk) {
      return {
        success: false,
        errorMessage: 'No liquidity available in orderbook',
      };
    }

    // Calculate trade parameters
    const price = parseFloat(bestAsk.price);
    const size = request.amount / price;

    // Create order
    const order = await clobClient.createOrder({
      marketId: request.marketId,
      outcome: request.outcome,
      side: 'BUY',
      price: price,
      size: size,
    });

    // Record in database
    const result = autoTrades.create({
      platform: 'polymarket',
      triggerTradeId: request.triggerTradeId,
      marketId: request.marketId,
      outcome: request.outcome,
      amount: request.amount,
      probability: request.probability,
      status: 'executed',
    });

    return {
      success: true,
      autoTradeId: result.id,
      executedAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failed trade
    autoTrades.create({
      platform: 'polymarket',
      triggerTradeId: request.triggerTradeId,
      marketId: request.marketId,
      outcome: request.outcome,
      amount: request.amount,
      probability: request.probability,
      status: 'failed',
    });

    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * Execute auto-trade on Kalshi
 */
async function executeKalshiAutoTrade(
  request: AutoTradeRequest
): Promise<AutoTradeResult> {
  try {
    // Check if Kalshi client is available
    if (!kalshiClient.isKalshiAvailable()) {
      return {
        success: false,
        errorMessage: 'Kalshi API credentials not configured',
      };
    }

    // Execute market buy
    const result = await kalshiClient.executeMarketBuy({
      ticker: request.marketId,
      outcome: request.outcome,
      amount: request.amount,
      maxSlippage: 0.02,
    });

    if (!result.success) {
      // Record failed trade
      autoTrades.create({
        platform: 'kalshi',
        triggerTradeId: request.triggerTradeId,
        marketId: request.marketId,
        outcome: request.outcome,
        amount: request.amount,
        probability: request.probability,
        status: 'failed',
      });

      return {
        success: false,
        errorMessage: 'Order execution failed',
      };
    }

    // Record in database
    const autoTradeResult = autoTrades.create({
      platform: 'kalshi',
      triggerTradeId: request.triggerTradeId,
      marketId: request.marketId,
      outcome: request.outcome,
      amount: request.amount,
      probability: request.probability,
      status: 'executed',
    });

    return {
      success: true,
      autoTradeId: autoTradeResult.id,
      executedAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failed trade
    autoTrades.create({
      platform: 'kalshi',
      triggerTradeId: request.triggerTradeId,
      marketId: request.marketId,
      outcome: request.outcome,
      amount: request.amount,
      probability: request.probability,
      status: 'failed',
    });

    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * Execute auto-trade
 */
export async function executeAutoTrade(
  request: AutoTradeRequest,
  rateLimit?: number
): Promise<AutoTradeResult> {
  const { platform, marketId, outcome, amount, probability, triggerTradeId } = request;

  // Check rate limit
  if (!checkRateLimit(platform, rateLimit)) {
    await logger.warning(platform, 'Auto-trade rate limit exceeded');
    return {
      success: false,
      errorMessage: 'Rate limit exceeded',
    };
  }

  await logger.autotrade(platform, `Executing auto-trade`, {
    marketId,
    outcome,
    amount,
    probability,
    triggerTradeId,
  });

  // Execute based on platform
  const result =
    platform === 'polymarket'
      ? await executePolymarketAutoTrade(request)
      : await executeKalshiAutoTrade(request);

  // Send notification (fire and forget to avoid blocking)
  sendNotification({
    type: result.success ? 'autotrade' : 'error',
    platform,
    title: result.success ? 'Auto-Trade Executed' : 'Auto-Trade Failed',
    message: result.success
      ? `Successfully placed $${amount.toFixed(2)} bet on ${outcome}`
      : `Failed to place bet: ${result.errorMessage}`,
    data: {
      marketId,
      outcome,
      amount,
      probability,
      autoTradeId: result.autoTradeId,
    },
    timestamp: new Date(),
  }).catch(err => console.error('Failed to send notification:', err));

  return result;
}

/**
 * Get auto-trade history with optimized pagination
 */
export function getAutoTradeHistory(params: {
  platform?: Platform;
  status?: AutoTradeStatus;
  limit?: number;
  offset?: number;
}): { trades: any[]; total: number; hasMore: boolean } {
  const { platform, status, limit = 50, offset = 0 } = params;

  // Build count query first
  let countSql = 'SELECT COUNT(*) as count FROM auto_trades';
  const conditions: string[] = [];
  const sqlParams: any[] = [];

  if (platform) {
    conditions.push('platform = ?');
    sqlParams.push(platform);
  }
  if (status) {
    conditions.push('status = ?');
    sqlParams.push(status);
  }

  if (conditions.length > 0) {
    countSql += ' WHERE ' + conditions.join(' AND ');
  }

  const countStmt = db.prepare(countSql);
  const totalResult = countStmt.get(...sqlParams) as { count: number };
  const total = totalResult.count;

  // Now get paginated results
  let sql = 'SELECT * FROM auto_trades';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  sqlParams.push(limit, offset);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...sqlParams) as any[];

  const tradeResults = rows.map(row => ({
    id: row.id,
    platform: row.platform,
    triggerTradeId: row.trigger_trade_id,
    marketId: row.market_id,
    outcome: row.outcome,
    amount: row.amount,
    probability: row.probability,
    status: row.status,
    executedAt: row.executed_at ? new Date(row.executed_at) : null,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
  }));

  return {
    trades: tradeResults,
    total,
    hasMore: total > offset + limit,
  };
}

/**
 * Get auto-trade statistics
 */
export function getAutoTradeStats(platform?: Platform): {
  total: number;
  executed: number;
  failed: number;
  todayTrades: number;
  totalAmountExecuted: number;
} {
  // Use transaction for consistency
  const getStats = db.transaction(() => {
    const executed = autoTrades.countByStatus('executed');
    const failed = autoTrades.countByStatus('failed');
    const pending = autoTrades.countByStatus('pending');

    return { executed, failed, pending };
  });

  const stats = getStats();

  return {
    total: stats.executed + stats.failed + stats.pending,
    executed: stats.executed,
    failed: stats.failed,
    todayTrades: autoTrades.countToday(),
    totalAmountExecuted: 0, // Would need aggregate query
  };
}

/**
 * Cleanup resources - Call this on shutdown
 */
export function cleanup(): void {
  rateLimiter.destroy();
  console.log('Auto-trade executor cleanup completed');
}

/**
 * Get rate limiter status for monitoring
 */
export function getRateLimiterStatus(platform: Platform): {
  currentCount: number;
  maxRequests: number;
  windowMs: number;
} {
  return {
    currentCount: rateLimiter.getCount(`${platform}-autotrade`),
    maxRequests: DEFAULT_RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW,
  };
}
