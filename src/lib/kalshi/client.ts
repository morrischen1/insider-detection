/**
 * Kalshi API Client (Optimized)
 * Used for markets, trades, orderbook, order placement
 * 
 * Optimizations:
 * - Response caching for frequently accessed data
 * - Proper timeout handling
 * - Memory-efficient caching
 */

import { logApiCall } from '@/lib/logger/api';
import { TTLCache } from '@/lib/utils/memory';
import type {
  KalshiMarket,
  KalshiTrade,
  KalshiPosition,
  KalshiUser,
  KalshiOrderbook,
  Outcome,
} from '@/types';

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Cache configuration
const MARKETS_CACHE_TTL = 30 * 1000; // 30 seconds for markets
const SINGLE_MARKET_CACHE_TTL = 60 * 1000; // 1 minute for single market
const ORDERBOOK_CACHE_TTL = 5 * 1000; // 5 seconds for orderbook
const CATEGORIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for categories

// Response caches
const marketsCache = new TTLCache<string, { markets: KalshiMarket[]; count: number }>(MARKETS_CACHE_TTL, MARKETS_CACHE_TTL);
const marketCache = new TTLCache<string, KalshiMarket>(SINGLE_MARKET_CACHE_TTL, SINGLE_MARKET_CACHE_TTL);
const orderbookCache = new TTLCache<string, KalshiOrderbook>(ORDERBOOK_CACHE_TTL, ORDERBOOK_CACHE_TTL);
const categoriesCache = new TTLCache<string, string[]>(CATEGORIES_CACHE_TTL, CATEGORIES_CACHE_TTL);

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requireAuth?: boolean;
  timeout?: number;
}

// Default timeout for API calls
const DEFAULT_TIMEOUT = 10000; // 10 seconds

// Generate authentication headers
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.KALSHI_API_KEY;
  const apiSecret = process.env.KALSHI_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.warn('Kalshi API credentials not configured');
    return {};
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  return {
    'X-Api-Key': apiKey,
    'X-Timestamp': timestamp,
  };
}

async function fetchWithErrorHandling<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, requireAuth = false, timeout = DEFAULT_TIMEOUT } = options;
  const startTime = Date.now();
  const url = `${KALSHI_API_BASE}${endpoint}`;

  const authHeaders = requireAuth ? getAuthHeaders() : {};

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    const status = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      await logApiCall({
        platform: 'kalshi',
        endpoint,
        method,
        status,
        responseTime,
        errorMessage: errorText,
      });
      throw new Error(`Kalshi API error: ${status} - ${errorText}`);
    }

    const data = await response.json();
    await logApiCall({
      platform: 'kalshi',
      endpoint,
      method,
      status,
      responseTime,
    });

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      await logApiCall({
        platform: 'kalshi',
        endpoint,
        method,
        status: 0,
        responseTime,
        errorMessage: 'Request timeout',
      });
      throw new Error('Request timeout');
    }
    
    await logApiCall({
      platform: 'kalshi',
      endpoint,
      method,
      status: 0,
      responseTime,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Markets
export async function getMarkets(params?: {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed' | 'settled';
  category?: string;
}): Promise<{ markets: KalshiMarket[]; count: number }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.status) queryParams.set('status', params.status);
  if (params?.category) queryParams.set('category', params.category);

  const query = queryParams.toString();
  const cacheKey = `markets-${query}`;
  
  const cached = marketsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<{ markets: KalshiMarket[]; count: number }>(`/markets${query ? `?${query}` : ''}`);
  marketsCache.set(cacheKey, result);
  return result;
}

export async function getMarketByTicker(ticker: string): Promise<KalshiMarket> {
  const cacheKey = `market-${ticker}`;
  
  const cached = marketCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const response = await fetchWithErrorHandling<{ market: KalshiMarket }>(`/markets/${ticker}`);
  marketCache.set(cacheKey, response.market);
  return response.market;
}

export async function getMarketById(id: string): Promise<KalshiMarket> {
  // Try ticker first (more common)
  try {
    const cacheKey = `market-${id}`;
    
    const cached = marketCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    const response = await fetchWithErrorHandling<{ market: KalshiMarket }>(`/markets/${id}`);
    marketCache.set(cacheKey, response.market);
    return response.market;
  } catch {
    // Try as internal ID if ticker fails
    const markets = await getMarkets({ limit: 100 });
    const market = markets.markets.find(m => m.id === id);
    if (!market) throw new Error(`Market ${id} not found`);
    return market;
  }
}

// Trades - Not cached as they change frequently
export async function getMarketTrades(ticker: string, params?: {
  limit?: number;
  offset?: number;
}): Promise<{ trades: KalshiTrade[]; count: number }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling(`/markets/${ticker}/trades${query ? `?${query}` : ''}`);
}

export async function getRecentTrades(params?: {
  limit?: number;
  offset?: number;
}): Promise<KalshiTrade[]> {
  // Kalshi doesn't have a global trades endpoint, so we aggregate from active markets
  const markets = await getMarkets({ status: 'open', limit: 20 });
  const allTrades: KalshiTrade[] = [];

  // Use Promise.allSettled for resilience
  const tradePromises = markets.markets.map(market => 
    getMarketTrades(market.ticker, { limit: 10 })
      .then(({ trades }) => trades)
      .catch(() => [])
  );
  
  const tradeResults = await Promise.allSettled(tradePromises);
  
  for (const result of tradeResults) {
    if (result.status === 'fulfilled') {
      allTrades.push(...result.value);
    }
  }

  // Sort by timestamp descending
  allTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (params?.limit) {
    return allTrades.slice(0, params.limit);
  }

  return allTrades;
}

export async function getUserTrades(userId: string, params?: {
  limit?: number;
  offset?: number;
}): Promise<{ trades: KalshiTrade[]; count: number }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling(`/users/${userId}/trades${query ? `?${query}` : ''}`, { requireAuth: true });
}

// Positions
export async function getUserPositions(userId: string): Promise<{ positions: KalshiPosition[] }> {
  return fetchWithErrorHandling(`/users/${userId}/positions`, { requireAuth: true });
}

export async function getPositionForMarket(userId: string, ticker: string): Promise<KalshiPosition | null> {
  const { positions } = await getUserPositions(userId);
  return positions.find(p => p.marketTicker === ticker) || null;
}

// Orderbook
export async function getOrderbook(ticker: string): Promise<KalshiOrderbook> {
  const cacheKey = `ob-${ticker}`;
  
  const cached = orderbookCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const response = await fetchWithErrorHandling<{
    orderbook: {
      yes: Array<{ price: number; size: number }>;
      no: Array<{ price: number; size: number }>;
    };
  }>(`/markets/${ticker}/orderbook`);

  const result: KalshiOrderbook = {
    marketId: ticker,
    outcome: 'YES',
    bids: response.orderbook.yes,
    asks: response.orderbook.no,
    timestamp: new Date().toISOString(),
  };
  
  orderbookCache.set(cacheKey, result);
  return result;
}

export async function getMidpointPrice(ticker: string): Promise<{
  ticker: string;
  yesPrice: number;
  noPrice: number;
  bid: number;
  ask: number;
  spread: number;
}> {
  const orderbook = await getOrderbook(ticker);
  
  // For Kalshi, YES and NO prices should sum to ~100
  const yesBid = orderbook.bids[0]?.price || 0;
  const yesAsk = orderbook.asks[0]?.price || 100;
  const yesMid = (yesBid + yesAsk) / 2;
  const spread = yesAsk - yesBid;

  return {
    ticker,
    yesPrice: yesMid,
    noPrice: 100 - yesMid,
    bid: yesBid,
    ask: yesAsk,
    spread,
  };
}

// User info
export async function getUser(userId: string): Promise<KalshiUser> {
  const response = await fetchWithErrorHandling<{ user: KalshiUser }>(`/users/${userId}`);
  return response.user;
}

export async function getUserStats(userId: string): Promise<{
  totalTrades: number;
  totalVolume: number;
  winRate: number;
  profitLoss: number;
  firstTradeTimestamp?: string;
}> {
  const response = await fetchWithErrorHandling(`/users/${userId}/stats`, { requireAuth: true });
  return response;
}

// Orders (require auth)
interface CreateOrderParams {
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
  expiration?: number;
}

export interface KalshiOrder {
  id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
  status: 'resting' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  updatedAt: string;
  filledCount: number;
  avgPrice: number;
}

export async function getOrders(status?: 'resting' | 'filled' | 'cancelled'): Promise<{ orders: KalshiOrder[] }> {
  const endpoint = status ? `/portfolio/orders?status=${status}` : '/portfolio/orders';
  return fetchWithErrorHandling(endpoint, { requireAuth: true });
}

export async function createOrder(params: CreateOrderParams): Promise<KalshiOrder> {
  const { ticker, side, action, count, price, expiration } = params;

  if (!process.env.KALSHI_API_KEY || !process.env.KALSHI_API_SECRET) {
    throw new Error('Kalshi API credentials not configured. Set KALSHI_API_KEY and KALSHI_API_SECRET');
  }

  const orderBody = {
    ticker,
    side,
    action,
    count,
    price,
    expiration_ts: expiration || Math.floor(Date.now() / 1000) + 86400,
  };

  const response = await fetchWithErrorHandling<{ order: KalshiOrder }>('/portfolio/orders', {
    method: 'POST',
    body: orderBody,
    requireAuth: true,
  });

  return response.order;
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean }> {
  return fetchWithErrorHandling(`/portfolio/orders/${orderId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

// Market execution
export async function executeMarketBuy(params: {
  ticker: string;
  outcome: Outcome;
  amount: number; // USD amount
  maxSlippage?: number;
}): Promise<{
  success: boolean;
  avgPrice: number;
  filledCount: number;
  orderId?: string;
}> {
  const { ticker, outcome, amount, maxSlippage = 0.02 } = params;

  const orderbook = await getOrderbook(ticker);
  
  const asks = outcome === 'YES' ? orderbook.asks : orderbook.bids;
  let remainingAmount = amount;
  let totalCount = 0;
  let totalCost = 0;

  for (const level of asks) {
    if (remainingAmount <= 0) break;

    const levelCost = level.price * level.size;
    
    if (levelCost <= remainingAmount) {
      totalCount += level.size;
      totalCost += levelCost;
      remainingAmount -= levelCost;
    } else {
      const partialCount = remainingAmount / level.price;
      totalCount += partialCount;
      totalCost += remainingAmount;
      remainingAmount = 0;
    }
  }

  const avgPrice = totalCost / totalCount;
  const bestPrice = asks[0]?.price || 100;
  const slippage = Math.abs(avgPrice - bestPrice) / bestPrice;

  if (slippage > maxSlippage) {
    throw new Error(`Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(maxSlippage * 100).toFixed(2)}%`);
  }

  try {
    const order = await createOrder({
      ticker,
      side: outcome === 'YES' ? 'yes' : 'no',
      action: 'buy',
      count: Math.floor(totalCount),
      price: avgPrice * (1 + maxSlippage),
    });

    return {
      success: true,
      avgPrice,
      filledCount: Math.floor(totalCount),
      orderId: order.id,
    };
  } catch (error) {
    return {
      success: false,
      avgPrice,
      filledCount: 0,
    };
  }
}

// Categories
export async function getCategories(): Promise<string[]> {
  const cacheKey = 'categories';
  
  const cached = categoriesCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const response = await fetchWithErrorHandling<{ categories: string[] }>('/categories');
  categoriesCache.set(cacheKey, response.categories);
  return response.categories;
}

// Events
export async function getEvents(params?: {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed';
}): Promise<{
  events: Array<{
    event_ticker: string;
    title: string;
    category: string;
    markets: string[];
  }>;
}> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.status) queryParams.set('status', params.status);

  const query = queryParams.toString();
  return fetchWithErrorHandling(`/events${query ? `?${query}` : ''}`);
}

// Get large trades
export async function getLargeTrades(minUsdValue: number, params?: {
  limit?: number;
  timeframe?: number; // minutes
}): Promise<KalshiTrade[]> {
  const trades = await getRecentTrades({ limit: params?.limit || 100 });
  
  const cutoffTime = params?.timeframe
    ? new Date(Date.now() - params.timeframe * 60 * 1000)
    : new Date(0);

  return trades.filter(trade => {
    const tradeTime = new Date(trade.timestamp);
    return trade.usdValue >= minUsdValue && tradeTime >= cutoffTime;
  });
}

// Active markets with liquidity
export async function getActiveMarketsWithLiquidity(minLiquidity: number = 10000): Promise<KalshiMarket[]> {
  const { markets } = await getMarkets({ status: 'open', limit: 100 });
  return markets.filter(market => {
    const openInterest = market.openInterest || 0;
    return openInterest >= minLiquidity;
  });
}

// Check if Kalshi is available
export function isKalshiAvailable(): boolean {
  return !!(process.env.KALSHI_API_KEY && process.env.KALSHI_API_SECRET);
}

/**
 * Clear all caches
 */
export function clearCache(): void {
  marketsCache.clear();
  marketCache.clear();
  orderbookCache.clear();
  categoriesCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  markets: number;
  market: number;
  orderbook: number;
  categories: number;
} {
  return {
    markets: marketsCache.size,
    market: marketCache.size,
    orderbook: orderbookCache.size,
    categories: categoriesCache.size,
  };
}

/**
 * Cleanup resources - Call this on shutdown
 */
export function cleanup(): void {
  clearCache();
  console.log('Kalshi client cleanup completed');
}

export const kalshiClient = {
  getMarkets,
  getMarketByTicker,
  getMarketById,
  getMarketTrades,
  getRecentTrades,
  getUserTrades,
  getUserPositions,
  getPositionForMarket,
  getOrderbook,
  getMidpointPrice,
  getUser,
  getUserStats,
  getOrders,
  createOrder,
  cancelOrder,
  executeMarketBuy,
  getCategories,
  getEvents,
  getLargeTrades,
  getActiveMarketsWithLiquidity,
  isKalshiAvailable,
  clearCache,
  getCacheStats,
  cleanup,
};
