/**
 * Detection Engine (Optimized)
 * Main engine for detecting insider trades
 * 
 * Optimizations:
 * - Bounded map for processed trades to prevent memory leaks
 * - Batch processing of trades for better performance
 * - Proper cleanup of intervals and resources
 * - Concurrent processing with controlled parallelism
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
import { BoundedMap, TTLCache } from '@/lib/utils/memory';

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

// Configuration constants
const MAX_PROCESSED_TRADES = 10000; // Maximum number of trades to track
const PROCESSED_TRADES_TTL = 24 * 60 * 60 * 1000; // 24 hours TTL for processed trades
const BATCH_SIZE = 10; // Number of trades to process in parallel
const CONCURRENT_MARKETS = 5; // Number of markets to process concurrently

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

// Config cache with TTL
const configCache = new TTLCache<string, GlobalConfig | PlatformConfig>(60 * 1000, 60 * 1000);

// Last processed trade timestamps per market - Using bounded map to prevent memory leak
const lastProcessedTrades = new BoundedMap<string, Date>(MAX_PROCESSED_TRADES, PROCESSED_TRADES_TTL);

// Track active scans to prevent overlapping
let activeScanCount = 0;
const MAX_CONCURRENT_SCANS = 2;

/**
 * Load configuration from database with caching
 */
export async function loadConfig(): Promise<void> {
  try {
    const cachedGlobal = configCache.get('global') as GlobalConfig | undefined;
    const cachedPolymarket = configCache.get('platform_polymarket') as PlatformConfig | undefined;
    const cachedKalshi = configCache.get('platform_kalshi') as PlatformConfig | undefined;

    if (cachedGlobal && cachedPolymarket && cachedKalshi) {
      // Use cached config
      return;
    }

    // Load global config
    const globalConfig = config.getGlobalConfig();
    configCache.set('global', globalConfig);

    // Load platform-specific configs
    const polymarketConfig = config.getPlatformConfig('polymarket');
    const kalshiConfig = config.getPlatformConfig('kalshi');
    
    configCache.set('platform_polymarket', polymarketConfig);
    configCache.set('platform_kalshi', kalshiConfig);

    logger.info('polymarket', 'Configuration loaded successfully');
  } catch (error) {
    logger.error('polymarket', 'Failed to load configuration', { error: String(error) });
  }
}

/**
 * Get cached config (exported for external use)
 */
export function getConfig(): { global: GlobalConfig; platforms: Record<Platform, PlatformConfig> } {
  const global = (configCache.get('global') as GlobalConfig) || DEFAULT_GLOBAL_CONFIG;
  const polymarket = (configCache.get('platform_polymarket') as PlatformConfig) || DEFAULT_PLATFORM_CONFIG;
  const kalshi = (configCache.get('platform_kalshi') as PlatformConfig) || DEFAULT_PLATFORM_CONFIG;

  return {
    global,
    platforms: { polymarket, kalshi },
  };
}

// Internal alias for use within this module
const getCachedConfig = getConfig;

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
 * Process a batch of trades in parallel
 */
async function processTradeBatch(
  platform: Platform,
  tradeBatch: Array<{ trade: TradeInfo; market: MarketInfo }>
): Promise<Array<DetectionResult | null>> {
  const { global, platforms } = getCachedConfig();

  return Promise.all(
    tradeBatch.map(async ({ trade, market }) => {
      try {
        // Check if already processed
        const tradeKey = `${trade.marketId}-${trade.id}`;
        if (lastProcessedTrades.has(tradeKey)) {
          return null;
        }

        // Get or create account
        const account = await getOrCreateAccount(platform, trade.accountId, trade.timestamp);

        // Build detection config
        const detectionConfig: DetectionConfig = {
          ...platforms[platform],
          ...global,
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

        // Mark as processed
        lastProcessedTrades.set(tradeKey, trade.timestamp);

        // Handle suspicious trades
        if (result.isSuspicious) {
          await handleSuspiciousTrade(platform, trade, market, account, result, global);
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
    })
  );
}

/**
 * Handle suspicious trade detection
 */
async function handleSuspiciousTrade(
  platform: Platform,
  trade: TradeInfo,
  market: MarketInfo,
  account: AccountInfo,
  result: DetectionResult,
  globalConfig: GlobalConfig
): Promise<void> {
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

  // Send notification (fire and forget)
  sendNotification({
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
  }).catch(err => console.error('Failed to send notification:', err));

  // Execute auto-trade if enabled
  if (globalConfig.autoTradeEnabled && result.probability >= globalConfig.autoTradeProbabilityThreshold) {
    executeAutoTrade({
      platform,
      marketId: trade.marketId,
      outcome: trade.outcome,
      amount: globalConfig.autoTradeAmount,
      triggerTradeId: trade.id,
      probability: result.probability,
    }).catch(err => console.error('Failed to execute auto-trade:', err));
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
 * Process trades from a market with controlled concurrency
 */
async function processMarketTrades(
  platform: Platform,
  market: MarketInfo,
  getTradesFn: () => Promise<TradeInfo[]>
): Promise<number> {
  try {
    const marketTrades = await getTradesFn();
    
    if (marketTrades.length === 0) return 0;

    // Process trades in batches
    let processedCount = 0;
    const state = engineStates[platform];

    for (let i = 0; i < marketTrades.length; i += BATCH_SIZE) {
      const batch = marketTrades.slice(i, i + BATCH_SIZE);
      const tradeBatch = batch.map(trade => ({ trade, market }));
      
      const results = await processTradeBatch(platform, tradeBatch);
      processedCount += results.filter(r => r !== null).length;
    }

    state.tradesProcessed += processedCount;
    return processedCount;
  } catch (error) {
    await logger.warning(platform, `Error processing market ${market.id}`, {
      error: String(error),
    });
    return 0;
  }
}

/**
 * Scan Polymarket for new trades
 */
async function scanPolymarket(): Promise<void> {
  // Prevent overlapping scans
  if (activeScanCount >= MAX_CONCURRENT_SCANS) {
    return;
  }
  activeScanCount++;

  const { platforms } = getCachedConfig();
  const state = engineStates.polymarket;

  try {
    await logger.info('polymarket', 'Starting market scan');

    // Get active markets with sufficient liquidity
    const markets = await gammaClient.getActiveMarketsWithLiquidity(platforms.polymarket.minMarketLiquidity);
    state.marketsScanned += markets.length;

    // Process markets concurrently with controlled parallelism
    const marketPromises: Promise<void>[] = [];
    
    for (let i = 0; i < markets.length; i += CONCURRENT_MARKETS) {
      const marketBatch = markets.slice(i, i + CONCURRENT_MARKETS);
      
      const batchPromise = Promise.all(
        marketBatch.map(async (market) => {
          const marketInfo: MarketInfo = {
            id: market.id,
            ticker: market.slug,
            question: market.question,
            liquidity: parseFloat(market.liquidity || '0'),
            volume: parseFloat(market.volume || '0'),
            endDate: market.endDate ? new Date(market.endDate) : undefined,
            outcomes: market.outcomes || ['Yes', 'No'],
          };

          return processMarketTrades('polymarket', marketInfo, async () => {
            const marketTrades = await dataClient.getMarketTrades(market.id, { limit: 50 });
            return marketTrades.map(trade => ({
              id: trade.id,
              marketId: market.id,
              marketTicker: market.slug,
              outcome: trade.outcome,
              price: parseFloat(trade.price),
              size: parseFloat(trade.size),
              usdValue: parseFloat(trade.usdValue),
              timestamp: new Date(trade.timestamp),
              accountId: trade.taker,
            }));
          });
        })
      );

      marketPromises.push(batchPromise.then(() => {}));
    }

    await Promise.all(marketPromises);

    state.lastScanTime = new Date();
    await logger.info('polymarket', `Scan completed. Markets: ${markets.length}, Total trades: ${state.tradesProcessed}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    state.errors.push({
      timestamp: new Date(),
      message: errorMessage,
    });
    await logger.error('polymarket', 'Scan failed', { error: errorMessage });
  } finally {
    activeScanCount--;
  }
}

/**
 * Scan Kalshi for new trades
 */
async function scanKalshi(): Promise<void> {
  // Prevent overlapping scans
  if (activeScanCount >= MAX_CONCURRENT_SCANS) {
    return;
  }
  activeScanCount++;

  const { platforms } = getCachedConfig();
  const state = engineStates.kalshi;

  try {
    await logger.info('kalshi', 'Starting market scan');

    // Get active markets with sufficient liquidity
    const markets = await kalshiClient.getActiveMarketsWithLiquidity(platforms.kalshi.minMarketLiquidity);
    state.marketsScanned += markets.length;

    // Process markets concurrently with controlled parallelism
    const marketPromises: Promise<void>[] = [];
    
    for (let i = 0; i < markets.length; i += CONCURRENT_MARKETS) {
      const marketBatch = markets.slice(i, i + CONCURRENT_MARKETS);
      
      const batchPromise = Promise.all(
        marketBatch.map(async (market) => {
          const marketInfo: MarketInfo = {
            id: market.ticker,
            ticker: market.ticker,
            question: market.title,
            liquidity: market.openInterest || 0,
            volume: market.volume || 0,
            endDate: market.closeTime ? new Date(market.closeTime) : undefined,
            outcomes: ['Yes', 'No'],
          };

          return processMarketTrades('kalshi', marketInfo, async () => {
            const { trades: marketTrades } = await kalshiClient.getMarketTrades(market.ticker, { limit: 50 });
            return marketTrades.map(trade => ({
              id: trade.id,
              marketId: market.ticker,
              marketTicker: market.ticker,
              outcome: trade.outcome,
              price: trade.price,
              size: trade.size,
              usdValue: trade.usdValue,
              timestamp: new Date(trade.timestamp),
              accountId: trade.userId || 'unknown',
            }));
          });
        })
      );

      marketPromises.push(batchPromise.then(() => {}));
    }

    await Promise.all(marketPromises);

    state.lastScanTime = new Date();
    await logger.info('kalshi', `Scan completed. Markets: ${markets.length}, Total trades: ${state.tradesProcessed}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    state.errors.push({
      timestamp: new Date(),
      message: errorMessage,
    });
    await logger.error('kalshi', 'Scan failed', { error: errorMessage });
  } finally {
    activeScanCount--;
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

  const { platforms } = getCachedConfig();
  
  if (!platforms[platform].enabled) {
    await logger.warning(platform, 'Detection is disabled for this platform');
    return;
  }

  engineStates[platform].isRunning = true;
  engineStates[platform].errors = [];

  await logger.info(platform, 'Starting detection engine');

  const scanFn = platform === 'polymarket' ? scanPolymarket : scanKalshi;
  const intervalMs = platforms[platform].pollingInterval * 1000;

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
  const { platforms } = getCachedConfig();
  const newConfig = { ...platforms[platform], ...updates };
  
  configCache.set(`platform_${platform}`, newConfig);

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
  const { global } = getCachedConfig();
  const newConfig = { ...global, ...updates };
  
  configCache.set('global', newConfig);

  // Save to database
  config.setGlobalConfig(updates);

  await logger.info('polymarket', 'Global configuration updated', updates);
}

/**
 * Cleanup resources - Call this on shutdown
 */
export function cleanup(): void {
  // Stop all intervals
  for (const platform of ['polymarket', 'kalshi'] as Platform[]) {
    if (pollingIntervals[platform]) {
      clearInterval(pollingIntervals[platform]!);
      pollingIntervals[platform] = null;
    }
    engineStates[platform].isRunning = false;
  }

  // Clear caches
  configCache.destroy();
  lastProcessedTrades.clear();
  
  console.log('Detection engine cleanup completed');
}

/**
 * Get memory statistics for monitoring
 */
export function getEngineStats(): {
  processedTradesCacheSize: number;
  configCacheSize: number;
  activeScanCount: number;
  platforms: Record<Platform, {
    isRunning: boolean;
    marketsScanned: number;
    tradesProcessed: number;
    errorCount: number;
  }>;
} {
  return {
    processedTradesCacheSize: lastProcessedTrades.size,
    configCacheSize: configCache.size,
    activeScanCount,
    platforms: {
      polymarket: {
        isRunning: engineStates.polymarket.isRunning,
        marketsScanned: engineStates.polymarket.marketsScanned,
        tradesProcessed: engineStates.polymarket.tradesProcessed,
        errorCount: engineStates.polymarket.errors.length,
      },
      kalshi: {
        isRunning: engineStates.kalshi.isRunning,
        marketsScanned: engineStates.kalshi.marketsScanned,
        tradesProcessed: engineStates.kalshi.tradesProcessed,
        errorCount: engineStates.kalshi.errors.length,
      },
    },
  };
}
