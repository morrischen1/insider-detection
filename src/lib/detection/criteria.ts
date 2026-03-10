/**
 * Detection Criteria Evaluation
 * Each criterion returns a score from 0-100
 */

import type {
  EvaluationContext,
  CriteriaKey,
  CRITERIA_WEIGHTS,
} from '@/types';
import { db } from '@/lib/db';

// Type for criteria weights
type CriteriaWeights = typeof CRITERIA_WEIGHTS;

/**
 * Account Age Criterion
 * New accounts (<30 days) with large trades are suspicious
 */
export async function evaluateAccountAge(context: EvaluationContext): Promise<number> {
  const { account, trade } = context;
  const accountAgeMs = Date.now() - account.firstSeen.getTime();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  // Score inversely proportional to age
  // < 7 days: 100
  // 7-30 days: 70-100
  // 30-90 days: 30-70
  // > 90 days: 0-30

  if (accountAgeDays < 7) {
    return 100;
  } else if (accountAgeDays < 30) {
    return 70 + (30 - accountAgeDays) * (30 / 23);
  } else if (accountAgeDays < 90) {
    return 30 + (90 - accountAgeDays) * (40 / 60);
  } else {
    // Very old accounts get low scores
    return Math.max(0, 30 - (accountAgeDays - 90) / 30);
  }
}

/**
 * Trade Size Criterion
 * Unusually large position relative to typical user behavior
 */
export async function evaluateTradeSize(context: EvaluationContext): Promise<number> {
  const { trade, market, config } = context;

  // Calculate percentage of market liquidity
  const liquidityPercentage = (trade.usdValue / market.liquidity) * 100;

  // Check if trade exceeds thresholds
  const exceedsUsdThreshold = trade.usdValue >= config.bigTradeUsdThreshold;
  const exceedsPercentThreshold = liquidityPercentage >= config.bigTradePercentThreshold;

  if (!exceedsUsdThreshold && !exceedsPercentThreshold) {
    return 0;
  }

  // Score based on how much thresholds are exceeded
  let score = 0;

  if (exceedsUsdThreshold) {
    const usdMultiplier = trade.usdValue / config.bigTradeUsdThreshold;
    score += Math.min(50, usdMultiplier * 25);
  }

  if (exceedsPercentThreshold) {
    const percentMultiplier = liquidityPercentage / config.bigTradePercentThreshold;
    score += Math.min(50, percentMultiplier * 25);
  }

  return Math.min(100, score);
}

/**
 * Timing Precision Criterion
 * Trades placed minutes/hours before market-resolution events
 */
export async function evaluateTimingPrecision(context: EvaluationContext): Promise<number> {
  const { trade, market } = context;

  if (!market.endDate && !market.resolutionDate) {
    return 0;
  }

  const resolutionTime = market.resolutionDate || market.endDate;
  if (!resolutionTime) return 0;

  const timeToResolution = resolutionTime.getTime() - trade.timestamp.getTime();
  const hoursToResolution = timeToResolution / (1000 * 60 * 60);

  // Score based on proximity to resolution
  // < 1 hour: 100
  // 1-6 hours: 80-100
  // 6-24 hours: 50-80
  // 1-7 days: 20-50
  // > 7 days: 0-20

  if (hoursToResolution < 0) {
    // Trade after resolution - suspicious
    return 100;
  } else if (hoursToResolution < 1) {
    return 100;
  } else if (hoursToResolution < 6) {
    return 80 + (6 - hoursToResolution) * 4;
  } else if (hoursToResolution < 24) {
    return 50 + (24 - hoursToResolution) * (30 / 18);
  } else if (hoursToResolution < 168) {
    // 7 days
    return 20 + (168 - hoursToResolution) * (30 / 144);
  } else {
    return Math.max(0, 20 - (hoursToResolution - 168) / 168);
  }
}

/**
 * Win Rate on Big Bets Criterion
 * Historical accuracy on large trades (>70% is suspicious)
 */
export async function evaluateWinRateOnBigBets(context: EvaluationContext): Promise<number> {
  const { account, trade, platform } = context;

  if (!account.winRate) {
    return 0;
  }

  // Get historical trades for this account
  const historicalTrades = await db.trade.findMany({
    where: {
      accountId: account.id,
      usdValue: { gte: context.config.bigTradeUsdThreshold },
    },
    take: 50,
    orderBy: { timestamp: 'desc' },
  });

  if (historicalTrades.length < 3) {
    // Not enough history
    return 0;
  }

  // Calculate win rate on big bets
  // We would need resolved market data to calculate this properly
  // For now, use the account's overall win rate

  const winRate = account.winRate;

  // Score based on suspiciously high win rate
  // < 55%: 0
  // 55-65%: 20
  // 65-75%: 50
  // 75-85%: 80
  // > 85%: 100

  if (winRate < 55) {
    return 0;
  } else if (winRate < 65) {
    return 20;
  } else if (winRate < 75) {
    return 50 + (winRate - 65) * 3;
  } else if (winRate < 85) {
    return 80 + (winRate - 75) * 2;
  } else {
    return 100;
  }
}

/**
 * First Market Activity Criterion
 * First-ever trade on a platform being a big winner
 */
export async function evaluateFirstMarketActivity(context: EvaluationContext): Promise<number> {
  const { account, trade } = context;

  if (account.totalTrades > 5) {
    // Not first activity
    return 0;
  }

  // Check if this is a large trade for a new account
  if (trade.usdValue >= context.config.bigTradeUsdThreshold) {
    // Large first trade
    if (account.totalTrades === 1) {
      return 100;
    } else if (account.totalTrades <= 3) {
      return 70 + (3 - account.totalTrades) * 10;
    } else {
      return 50 + (5 - account.totalTrades) * 5;
    }
  }

  return 0;
}

/**
 * Market Knowledge Criterion
 * Betting on obscure outcomes with high confidence
 */
export async function evaluateMarketKnowledge(context: EvaluationContext): Promise<number> {
  const { trade, market, account } = context;

  // Check if betting on the less popular outcome
  // This requires holder data which we'd need to fetch

  // For now, evaluate based on:
  // 1. Confidence in position (large position on one side)
  // 2. Market obscurity (lower volume markets)

  let score = 0;

  // Market obscurity - lower volume = more obscure
  if (market.volume < 5000) {
    score += 30;
  } else if (market.volume < 20000) {
    score += 15;
  }

  // Large position size shows high confidence
  const positionPercentOfLiquidity = (trade.usdValue / market.liquidity) * 100;
  if (positionPercentOfLiquidity > 5) {
    score += 40;
  } else if (positionPercentOfLiquidity > 2) {
    score += 20;
  }

  // Price at extreme - betting when price is very high or low
  if (trade.price > 0.9 || trade.price < 0.1) {
    score += 30;
  }

  return Math.min(100, score);
}

/**
 * Price Movement Criterion
 * Large bets that significantly move the market
 */
export async function evaluatePriceMovement(context: EvaluationContext): Promise<number> {
  const { trade, market, platform } = context;

  // We'd need price history before/after the trade
  // For now, estimate based on trade size vs liquidity

  const liquidityRatio = trade.usdValue / market.liquidity;

  // Larger trades relative to liquidity cause more price movement
  if (liquidityRatio > 0.2) {
    return 100;
  } else if (liquidityRatio > 0.1) {
    return 80;
  } else if (liquidityRatio > 0.05) {
    return 50;
  } else if (liquidityRatio > 0.02) {
    return 25;
  }

  return 0;
}

/**
 * Behavioral Pattern Criterion
 * Multiple accounts with similar trading patterns (sybil detection)
 */
export async function evaluateBehavioralPattern(context: EvaluationContext): Promise<number> {
  const { trade, account, platform } = context;

  // Look for similar trades in the same market around the same time
  const timeWindow = 5 * 60 * 1000; // 5 minutes
  const startTime = new Date(trade.timestamp.getTime() - timeWindow);
  const endTime = new Date(trade.timestamp.getTime() + timeWindow);

  const similarTrades = await db.trade.findMany({
    where: {
      platform,
      marketId: trade.marketId,
      outcome: trade.outcome,
      timestamp: {
        gte: startTime,
        lte: endTime,
      },
      accountId: { not: account.id },
    },
    include: {
      account: true,
    },
  });

  if (similarTrades.length === 0) {
    return 0;
  }

  // Check for similar sized trades
  const similarSizedTrades = similarTrades.filter(
    t => Math.abs(t.usdValue - trade.usdValue) / trade.usdValue < 0.2
  );

  if (similarSizedTrades.length >= 3) {
    // Multiple similar trades from different accounts - highly suspicious
    return 100;
  } else if (similarSizedTrades.length >= 2) {
    return 80;
  } else if (similarSizedTrades.length >= 1) {
    return 50;
  }

  // Check for new accounts among similar traders
  const newAccountTrades = similarTrades.filter(t => {
    const age = Date.now() - t.account.firstSeen.getTime();
    return age < 30 * 24 * 60 * 60 * 1000; // 30 days
  });

  if (newAccountTrades.length >= 2) {
    return 70;
  } else if (newAccountTrades.length >= 1) {
    return 40;
  }

  return 10;
}

/**
 * Liquidity Targeting Criterion
 * Betting when liquidity is low, before market gains attention
 */
export async function evaluateLiquidityTargeting(context: EvaluationContext): Promise<number> {
  const { trade, market } = context;

  // Score based on low liquidity at time of trade
  if (market.liquidity < 5000) {
    return 100;
  } else if (market.liquidity < 10000) {
    return 80;
  } else if (market.liquidity < 25000) {
    return 50;
  } else if (market.liquidity < 50000) {
    return 25;
  }

  return 0;
}

/**
 * Previous Watchlist Criterion
 * Account already flagged in the past
 */
export async function evaluatePreviousWatchlist(context: EvaluationContext): Promise<number> {
  const { account } = context;

  if (account.isWatchlisted) {
    return 100;
  }

  // Check if account was previously on watchlist but removed
  const previousFlags = await db.watchlist.findMany({
    where: {
      accountId: account.id,
      isActive: false,
    },
  });

  if (previousFlags.length > 0) {
    return 80;
  }

  return 0;
}

// Export all criteria evaluators
export const criteriaEvaluators: Record<
  CriteriaKey,
  (context: EvaluationContext) => Promise<number>
> = {
  accountAge: evaluateAccountAge,
  tradeSize: evaluateTradeSize,
  timingPrecision: evaluateTimingPrecision,
  winRateOnBigBets: evaluateWinRateOnBigBets,
  firstMarketActivity: evaluateFirstMarketActivity,
  marketKnowledge: evaluateMarketKnowledge,
  priceMovement: evaluatePriceMovement,
  behavioralPattern: evaluateBehavioralPattern,
  liquidityTargeting: evaluateLiquidityTargeting,
  previousWatchlist: evaluatePreviousWatchlist,
};
