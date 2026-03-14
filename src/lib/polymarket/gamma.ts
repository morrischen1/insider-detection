/**
 * Polymarket Gamma API Client (Optimized)
 * Used for markets, events, tags, series, comments, sports, search, public profiles
 * 
 * Optimizations:
 * - Response caching for frequently accessed data
 * - Proper timeout handling
 * - Memory-efficient caching
 */

import type {
  PolymarketMarket,
  PolymarketEvent,
} from '@/types';
import { logApiCall } from '@/lib/logger/api';
import { TTLCache } from '@/lib/utils/memory';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// Cache configuration
const MARKETS_CACHE_TTL = 30 * 1000; // 30 seconds for markets
const SINGLE_ITEM_CACHE_TTL = 60 * 1000; // 1 minute for single items
const TAGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for tags

// Response caches
const marketsCache = new TTLCache<string, PolymarketMarket[]>(MARKETS_CACHE_TTL, MARKETS_CACHE_TTL);
const marketCache = new TTLCache<string, PolymarketMarket>(SINGLE_ITEM_CACHE_TTL, SINGLE_ITEM_CACHE_TTL);
const eventsCache = new TTLCache<string, PolymarketEvent[]>(MARKETS_CACHE_TTL, MARKETS_CACHE_TTL);
const eventCache = new TTLCache<string, PolymarketEvent>(SINGLE_ITEM_CACHE_TTL, SINGLE_ITEM_CACHE_TTL);
const tagsCache = new TTLCache<string, Array<{ id: string; name: string; slug: string }>>(TAGS_CACHE_TTL, TAGS_CACHE_TTL);

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
}

// Default timeout for API calls
const DEFAULT_TIMEOUT = 10000; // 10 seconds

async function fetchWithErrorHandling<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT } = options;
  const startTime = Date.now();
  const url = `${GAMMA_API_BASE}${endpoint}`;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
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
        platform: 'polymarket',
        endpoint,
        method,
        status,
        responseTime,
        errorMessage: errorText,
      });
      throw new Error(`Gamma API error: ${status} - ${errorText}`);
    }

    const data = await response.json();
    await logApiCall({
      platform: 'polymarket',
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
        platform: 'polymarket',
        endpoint,
        method,
        status: 0,
        responseTime,
        errorMessage: 'Request timeout',
      });
      throw new Error('Request timeout');
    }
    
    await logApiCall({
      platform: 'polymarket',
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
  active?: boolean;
  closed?: boolean;
  slug?: string;
  tag?: string;
}): Promise<PolymarketMarket[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.active !== undefined) queryParams.set('active', params.active.toString());
  if (params?.closed !== undefined) queryParams.set('closed', params.closed.toString());
  if (params?.slug) queryParams.set('slug', params.slug);
  if (params?.tag) queryParams.set('tag', params.tag);

  const query = queryParams.toString();
  const cacheKey = `markets-${query}`;
  
  // Check cache
  const cached = marketsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<PolymarketMarket[]>(`/markets${query ? `?${query}` : ''}`);
  marketsCache.set(cacheKey, result);
  return result;
}

export async function getMarketById(id: string): Promise<PolymarketMarket> {
  const cacheKey = `market-${id}`;
  
  // Check cache
  const cached = marketCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<PolymarketMarket>(`/markets/${id}`);
  marketCache.set(cacheKey, result);
  return result;
}

export async function getMarketBySlug(slug: string): Promise<PolymarketMarket> {
  const cacheKey = `market-slug-${slug}`;
  
  // Check cache
  const cached = marketCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const markets = await fetchWithErrorHandling<PolymarketMarket[]>(`/markets?slug=${slug}`);
  const result = markets[0];
  if (result) {
    marketCache.set(cacheKey, result);
  }
  return result;
}

export async function getMarketByConditionId(conditionId: string): Promise<PolymarketMarket> {
  const cacheKey = `market-condition-${conditionId}`;
  
  // Check cache
  const cached = marketCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const markets = await fetchWithErrorHandling<PolymarketMarket[]>(`/markets/condition/${conditionId}`);
  const result = markets[0];
  if (result) {
    marketCache.set(cacheKey, result);
  }
  return result;
}

// Events
export async function getEvents(params?: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  slug?: string;
  tag?: string;
}): Promise<PolymarketEvent[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.active !== undefined) queryParams.set('active', params.active.toString());
  if (params?.closed !== undefined) queryParams.set('closed', params.closed.toString());
  if (params?.slug) queryParams.set('slug', params.slug);
  if (params?.tag) queryParams.set('tag', params.tag);

  const query = queryParams.toString();
  const cacheKey = `events-${query}`;
  
  // Check cache
  const cached = eventsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<PolymarketEvent[]>(`/events${query ? `?${query}` : ''}`);
  eventsCache.set(cacheKey, result);
  return result;
}

export async function getEventById(id: string): Promise<PolymarketEvent> {
  const cacheKey = `event-${id}`;
  
  // Check cache
  const cached = eventCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<PolymarketEvent>(`/events/${id}`);
  eventCache.set(cacheKey, result);
  return result;
}

export async function getEventBySlug(slug: string): Promise<PolymarketEvent> {
  const cacheKey = `event-slug-${slug}`;
  
  // Check cache
  const cached = eventCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const events = await fetchWithErrorHandling<PolymarketEvent[]>(`/events?slug=${slug}`);
  const result = events[0];
  if (result) {
    eventCache.set(cacheKey, result);
  }
  return result;
}

// Tags
export async function getTags(): Promise<Array<{ id: string; name: string; slug: string }>> {
  const cacheKey = 'tags';
  
  // Check cache
  const cached = tagsCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await fetchWithErrorHandling<Array<{ id: string; name: string; slug: string }>>('/tags');
  tagsCache.set(cacheKey, result);
  return result;
}

// Search - Not cached as queries vary widely
export async function searchMarkets(query: string, params?: {
  limit?: number;
  offset?: number;
}): Promise<PolymarketMarket[]> {
  const queryParams = new URLSearchParams();
  queryParams.set('q', query);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  return fetchWithErrorHandling<PolymarketMarket[]>(`/markets/search?${queryParams.toString()}`);
}

// Comments - Not cached as they change frequently
export async function getMarketComments(marketId: string): Promise<Array<{
  id: string;
  userId: string;
  content: string;
  timestamp: string;
}>> {
  return fetchWithErrorHandling(`/markets/${marketId}/comments`);
}

// Public Profiles
export async function getPublicProfile(address: string): Promise<{
  address: string;
  username?: string;
  bio?: string;
  avatar?: string;
  stats?: {
    totalTrades: number;
    totalVolume: string;
    winRate: number;
  };
}> {
  return fetchWithErrorHandling(`/profiles/${address}`);
}

// Sports
export async function getSportsEvents(): Promise<Array<{
  id: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  markets: string[];
}>> {
  return fetchWithErrorHandling('/sports/events');
}

// Get active markets with liquidity above threshold
export async function getActiveMarketsWithLiquidity(minLiquidity: number = 10000): Promise<PolymarketMarket[]> {
  const markets = await getMarkets({ active: true, limit: 100 });
  return markets.filter(market => {
    const liquidity = parseFloat(market.liquidity || '0');
    return liquidity >= minLiquidity;
  });
}

// Get recently resolved markets
export async function getRecentlyResolvedMarkets(hours: number = 24): Promise<PolymarketMarket[]> {
  const markets = await getMarkets({ closed: true, limit: 50 });
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return markets.filter(market => {
    if (!market.endDate) return false;
    return new Date(market.endDate) >= cutoffTime;
  });
}

/**
 * Clear all caches - useful for testing or forced refresh
 */
export function clearCache(): void {
  marketsCache.clear();
  marketCache.clear();
  eventsCache.clear();
  eventCache.clear();
  tagsCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  markets: number;
  market: number;
  events: number;
  event: number;
  tags: number;
} {
  return {
    markets: marketsCache.size,
    market: marketCache.size,
    events: eventsCache.size,
    event: eventCache.size,
    tags: tagsCache.size,
  };
}

/**
 * Cleanup resources - Call this on shutdown
 */
export function cleanup(): void {
  clearCache();
  console.log('Gamma API client cleanup completed');
}

export const gammaClient = {
  getMarkets,
  getMarketById,
  getMarketBySlug,
  getMarketByConditionId,
  getEvents,
  getEventById,
  getEventBySlug,
  getTags,
  searchMarkets,
  getMarketComments,
  getPublicProfile,
  getSportsEvents,
  getActiveMarketsWithLiquidity,
  getRecentlyResolvedMarkets,
  clearCache,
  getCacheStats,
  cleanup,
};
