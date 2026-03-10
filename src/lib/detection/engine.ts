/**
 * Detection Engine
 * Main engine for detecting insider trades
 */

import {
  accounts,
  trades,
  watchlist,
  detectionLogs,
  config,
} from '@/lib/db';
import { logger } from '@/lib/logger/system';
import { evaluateAllCriteria, DEFAULT_WEIGHTS } from './probability';
import { gammaClient } from '@/lib/polymarket/gamma';
import { dataClient } from '@/lib/polymarket/data';
import { kalshiClient } from '@/lib/kalshi/client';
import { sendNotification } from '@/lib/notifications';
import { executeAutoTrade } from '@/lib/autotrade/executor';

import type {
  Platform,
  TradeInfo,
  AccountInfo,
  MarketInfo,
  DetectionResult,
  DetectionConfig,
  DetectionEngineState,
  PlatformConfig,
  GlobalConfig,
} from '@/types';
import { DEFAULT_PLATFORM_CONFIG, DEFAULT_GLOBAL_CONFIG } from '@/types';

// Engine state per platform
const engineStates: Record<Platform, DetectionEngineState> = {
  polymarket: {
    isRunning: false,
    platform: 'polymarket',
    marketsScanned: 0,
    tradesProcessed: 0,
    errors: [],
  },
  kalshi: {
    isRunning: false,
    platform: 'kalshi',
    marketsScanned: 0,
    tradesProcessed: 0,
    errors: [],
  },
};

// Polling intervals
const pollingIntervals: Record<Platform, NodeJS.Timeout | null> = {
  polymarket: null,
  kalshi: null,
};

// Config cache
let globalConfig: GlobalConfig = DEFAULT_GLOBAL_CONFIG;
let platformConfigs: Record<Platform, PlatformConfig> = {
  polymarket: DEFAULT_PLATFORM_CONFIG,
  kalshi: DEFAULT_PLATFORM_CONFIG,
};

// Last processed trade timestamps per market
const lastProcessedTrades: Map<string, Date> = new Map();

/**
 * Load configuration from database
 */
export async function loadConfig(): Promise<void> {
  try {
    // Load global config
    globalConfig = config.getGlobalConfig();

    // Load platform-specific configs
    platformConfigs.polymarket = config.getPlatformConfig('polymarket');
    platformConfigs.kalshi = config.getPlatformConfig('kalshi');

    logger.info('polymarket', 'Configuration loaded successfully');
  } catch (error) {
    logger.error('polymarket', 'Failed to load configuration', { error: String(error) });
  }
}

/**
 * Get or create account in database
 */
async function getOrCreateAccount(
  platform: Platform,
  address: string,
  tradeTimestamp: Date
): Promise<AccountInfo> {
  let account = accounts.findByPlatformAddress(platform, address);

  if (!account) {
    const result = accounts.create({
      platform,
      address,
      firstSeen: tradeTimestamp,
      totalTrades: 0,
      totalVolume: 0,
    });
    account = accounts.findById(result.id);
  }

  return account!;
}

/**
 * Process a single trade
 */
async function processTrade(
  platform: Platform,
  trade: TradeInfo,
  market: MarketInfo
): Promise<DetectionResult | null> {
  try {
    // Get or create account
    const account = await getOrCreateAccount(platform, trade.accountId, trade.timestamp);

    // Build detection config
    const detectionConfig: DetectionConfig = {
      ...platformConfigs[platform],
      ...globalConfig,
      platform,
    };

    // Evaluate criteria
    const result = await evaluateAllCriteria({
      trade,
      account,
      market,
      platform,
      config: detectionConfig,
    });

    // Store trade in database
    trades.create({
      platform,
      marketId: trade.marketId,
      marketTicker: trade.marketTicker,
      accountId: account.id,
      outcome: trade.outcome,
      price: trade.price,
      size: trade.size,
      usdValue: trade.usdValue,
      timestamp: trade.timestamp,
      isSuspicious: result.isSuspicious,
      insiderProbability: result.probability,
    });

    // Update account stats
    accounts.updateStats(account.id, {
      totalTrades: account.totalTrades + 1,
      totalVolume: account.totalVolume + trade.usdValue,
    });

    // Log detection
    if (result.isSuspicious) {
      await logger.detection(platform, `Suspicious trade detected: ${result.probability.toFixed(1)}% probability`, {
        tradeId: trade.id,
        marketId: trade.marketId,
        accountAddress: account.address,
        probability: result.probability,
        criteriaScores: result.criteriaScores,
        reasons: result.reasons,
      });

      // Add to watchlist if high probability
      if (result.probability >= 70 && !account.isWatchlisted) {
        await addToWatchlist(account.id, platform, result.reasons.join('; '), result.probability);
      }

      // Send notification
      await sendNotification({
        type: 'detection',
        platform,
        title: 'Insider Trade Detected',
        message: `Probability: ${result.probability.toFixed(1)}%\nMarket: ${market.ticker || trade.marketId}\nAmount: $${trade.usdValue.toFixed(2)}`,
        data: {
          tradeId: trade.id,
          accountAddress: account.address,
          probability: result.probability,
          usdValue: trade.usdValue,
        },
        timestamp: new Date(),
      });

      // Execute auto-trade if enabled
      if (globalConfig.autoTradeEnabled && result.probability >= globalConfig.autoTradeProbabilityThreshold) {
        await executeAutoTrade({
          platform,
          marketId: trade.marketId,
          outcome: trade.outcome,
          amount: globalConfig.autoTradeAmount,
          triggerTradeId: trade.id,
          probability: result.probability,
        });
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    engineStates[platform].errors.push({
      timestamp: new Date(),
      message: `Failed to process trade: ${errorMessage}`,
    });
    return null;
  }
}

/**
 * Add account to watchlist
 */
async function addToWatchlist(
  accountId: string,
  platform: Platform,
  reason: string,
  probability: number
): Promise<void> {
  try {
    watchlist.add({
      accountId,
      platform,
      reason,
      probability,
    });

    await logger.warning(platform, `Account added to watchlist`, {
      accountId,
      reason,
      probability,
    });
  } catch (error) {
    await logger.error(platform, 'Failed to add account to watchlist', {
      accountId,
      error: String(error),
    });
  }
}

/**
 * Scan Polymarket for new trades
 */
async function scanPolymarket(): Promise<void> {
  const platformConfig = platformConfigs.polymarket;
  const state = engineStates.polymarket;

  try {
    await logger.info('polymarket', 'Starting market scan');

    // Get active markets with sufficient liquidity
    const markets = await gammaClient.getActiveMarketsWithLiquidity(platformConfig.minMarketLiquidity);
    state.marketsScanned += markets.length;

    for (const market of markets) {
      try {
        // Get recent trades for this market
        const marketTrades = await dataClient.getMarketTrades(market.id, { limit: 50 });

        for (const trade of marketTrades) {
          const tradeKey = `${market.id}-${trade.id}`;
          const lastProcessed = lastProcessedTrades.get(tradeKey);

          // Skip if already processed
          if (lastProcessed) continue;

          const tradeTimestamp = new Date(trade.timestamp);

          // Process trade
          const tradeInfo: TradeInfo = {
            id: trade.id,
            marketId: market.id,
            marketTicker: market.slug,
            outcome: trade.outcome,
            price: parseFloat(trade.price),
            size: parseFloat(trade.size),
            usdValue: parseFloat(trade.usdValue),
            timestamp: tradeTimestamp,
            accountId: trade.taker, // Using taker as the trader
          };

          const marketInfo: MarketInfo = {
            id: market.id,
            ticker: market.slug,
            question: market.question,
            liquidity: parseFloat(market.liquidity || '0'),
            volume: parseFloat(market.volume || '0'),
            endDate: market.endDate ? new Date(market.endDate) : undefined,
            outcomes: market.outcomes || ['Yes', 'No'],
          };

          await processTrade('polymarket', tradeInfo, marketInfo);
          lastProcessedTrades.set(tradeKey, tradeTimestamp);
          state.tradesProcessed++;
        }
      } catch (marketError) {
        await logger.warning('polymarket', `Error processing market ${market.id}`, {
          error: String(marketError),
        });
      }
    }

    state.lastScanTime = new Date();
    await logger.info('polymarket', `Scan completed. Markets: ${markets.length}, Total trades: ${state.tradesProcessed}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    state.errors.push({
      timestamp: new Date(),
      message: errorMessage,
    });
    await logger.error('polymarket', 'Scan failed', { error: errorMessage });
  }
}

/**
 * Scan Kalshi for new trades
 */
async function scanKalshi(): Promise<void> {
  const platformConfig = platformConfigs.kalshi;
  const state = engineStates.kalshi;

  try {
    await logger.info('kalshi', 'Starting market scan');

    // Get active markets with sufficient liquidity
    const markets = await kalshiClient.getActiveMarketsWithLiquidity(platformConfig.minMarketLiquidity);
    state.marketsScanned += markets.length;

    for (const market of markets) {
      try {
        // Get recent trades for this market
        const { trades: marketTrades } = await kalshiClient.getMarketTrades(market.ticker, { limit: 50 });

        for (const trade of marketTrades) {
          const tradeKey = `${market.ticker}-${trade.id}`;
          const lastProcessed = lastProcessedTrades.get(tradeKey);

          // Skip if already processed
          if (lastProcessed) continue;

          const tradeTimestamp = new Date(trade.timestamp);

          // Process trade
          const tradeInfo: TradeInfo = {
            id: trade.id,
            marketId: market.ticker,
            marketTicker: market.ticker,
            outcome: trade.outcome,
            price: trade.price,
            size: trade.size,
            usdValue: trade.usdValue,
            timestamp: tradeTimestamp,
            accountId: trade.userId || 'unknown',
          };

          const marketInfo: MarketInfo = {
            id: market.ticker,
            ticker: market.ticker,
            question: market.title,
            liquidity: market.openInterest || 0,
            volume: market.volume || 0,
            endDate: market.closeTime ? new Date(market.closeTime) : undefined,
            outcomes: ['Yes', 'No'],
          };

          await processTrade('kalshi', tradeInfo, marketInfo);
          lastProcessedTrades.set(tradeKey, tradeTimestamp);
          state.tradesProcessed++;
        }
      } catch (marketError) {
        await logger.warning('kalshi', `Error processing market ${market.ticker}`, {
          error: String(marketError),
        });
      }
    }

    state.lastScanTime = new Date();
    await logger.info('kalshi', `Scan completed. Markets: ${markets.length}, Total trades: ${state.tradesProcessed}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    state.errors.push({
      timestamp: new Date(),
      message: errorMessage,
    });
    await logger.error('kalshi', 'Scan failed', { error: errorMessage });
  }
}

/**
 * Start detection engine for a platform
 */
export async function startDetection(platform: Platform): Promise<void> {
  if (engineStates[platform].isRunning) {
    await logger.warning(platform, 'Detection engine already running');
    return;
  }

  await loadConfig();

  if (!platformConfigs[platform].enabled) {
    await logger.warning(platform, 'Detection is disabled for this platform');
    return;
  }

  engineStates[platform].isRunning = true;
  engineStates[platform].errors = [];

  await logger.info(platform, 'Starting detection engine');

  const scanFn = platform === 'polymarket' ? scanPolymarket : scanKalshi;
  const intervalMs = platformConfigs[platform].pollingInterval * 1000;

  // Run initial scan
  await scanFn();

  // Set up polling interval
  pollingIntervals[platform] = setInterval(scanFn, intervalMs);
}

/**
 * Stop detection engine for a platform
 */
export async function stopDetection(platform: Platform): Promise<void> {
  if (!engineStates[platform].isRunning) {
    await logger.warning(platform, 'Detection engine not running');
    return;
  }

  engineStates[platform].isRunning = false;

  if (pollingIntervals[platform]) {
    clearInterval(pollingIntervals[platform]!);
    pollingIntervals[platform] = null;
  }

  await logger.info(platform, 'Detection engine stopped');
}

/**
 * Get engine state
 */
export function getEngineState(platform: Platform): DetectionEngineState {
  return engineStates[platform];
}

/**
 * Get all engine states
 */
export function getAllEngineStates(): Record<Platform, DetectionEngineState> {
  return engineStates;
}

/**
 * Start all detection engines
 */
export async function startAllDetection(): Promise<void> {
  await Promise.all([
    startDetection('polymarket'),
    startDetection('kalshi'),
  ]);
}

/**
 * Stop all detection engines
 */
export async function stopAllDetection(): Promise<void> {
  await Promise.all([
    stopDetection('polymarket'),
    stopDetection('kalshi'),
  ]);
}

/**
 * Update platform config
 */
export async function updatePlatformConfig(
  platform: Platform,
  updates: Partial<PlatformConfig>
): Promise<void> {
  platformConfigs[platform] = {
    ...platformConfigs[platform],
    ...updates,
  };

  // Save to database
  config.setPlatformConfig(platform, updates);

  // Restart detection if running
  if (engineStates[platform].isRunning && updates.pollingInterval) {
    await stopDetection(platform);
    await startDetection(platform);
  }

  await logger.info(platform, 'Configuration updated', updates);
}

/**
 * Update global config
 */
export async function updateGlobalConfig(updates: Partial<GlobalConfig>): Promise<void> {
  globalConfig = {
    ...globalConfig,
    ...updates,
  };

  // Save to database
  config.setGlobalConfig(updates);

  await logger.info('polymarket', 'Global configuration updated', updates);
}

/**
 * Get current config
 */
export function getConfig(): {
  global: GlobalConfig;
  platforms: Record<Platform, PlatformConfig>;
} {
  return {
    global: globalConfig,
    platforms: platformConfigs,
  };
}
