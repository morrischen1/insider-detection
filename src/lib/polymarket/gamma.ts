/**
 * Polymarket Gamma API Client
 * Used for markets, events, tags, series, comments, sports, search, public profiles
 */

import type {
  PolymarketMarket,
  PolymarketEvent,
} from '@/types';
import { logApiCall } from '@/lib/logger/api';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

async function fetchWithErrorHandling<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  const startTime = Date.now();
  const url = `${GAMMA_API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

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
    const responseTime = Date.now() - startTime;
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
  return fetchWithErrorHandling<PolymarketMarket[]>(`/markets${query ? `?${query}` : ''}`);
}

export async function getMarketById(id: string): Promise<PolymarketMarket> {
  return fetchWithErrorHandling<PolymarketMarket>(`/markets/${id}`);
}

export async function getMarketBySlug(slug: string): Promise<PolymarketMarket> {
  const markets = await fetchWithErrorHandling<PolymarketMarket[]>(`/markets?slug=${slug}`);
  return markets[0];
}

export async function getMarketByConditionId(conditionId: string): Promise<PolymarketMarket> {
  const markets = await fetchWithErrorHandling<PolymarketMarket[]>(`/markets/condition/${conditionId}`);
  return markets[0];
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
  return fetchWithErrorHandling<PolymarketEvent[]>(`/events${query ? `?${query}` : ''}`);
}

export async function getEventById(id: string): Promise<PolymarketEvent> {
  return fetchWithErrorHandling<PolymarketEvent>(`/events/${id}`);
}

export async function getEventBySlug(slug: string): Promise<PolymarketEvent> {
  const events = await fetchWithErrorHandling<PolymarketEvent[]>(`/events?slug=${slug}`);
  return events[0];
}

// Tags
export async function getTags(): Promise<Array<{ id: string; name: string; slug: string }>> {
  return fetchWithErrorHandling('/tags');
}

// Search
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

// Comments
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
};
