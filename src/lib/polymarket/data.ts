/**
 * Polymarket Data API Client
 * Used for user positions, trades, activity, holder data, open interest, leaderboards
 */

import type {
  PolymarketTrade,
  PolymarketPosition,
  PolymarketUser,
  PolymarketOrderbook,
} from '@/types';
import { logApiCall } from '@/lib/logger/api';

const DATA_API_BASE = 'https://data-api.polymarket.com';

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
  const url = `${DATA_API_BASE}${endpoint}`;

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
      throw new Error(`Data API error: ${status} - ${errorText}`);
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

// User Positions
export async function getUserPositions(address: string): Promise<PolymarketPosition[]> {
  return fetchWithErrorHandling<PolymarketPosition[]>(`/positions/${address}`);
}

export async function getUserPositionForMarket(
  address: string,
  marketId: string
): Promise<PolymarketPosition | null> {
  const positions = await getUserPositions(address);
  return positions.find(p => p.marketId === marketId) || null;
}

// Trades
export async function getMarketTrades(marketId: string, params?: {
  limit?: number;
  offset?: number;
}): Promise<PolymarketTrade[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling<PolymarketTrade[]>(`/markets/${marketId}/trades${query ? `?${query}` : ''}`);
}

export async function getUserTrades(address: string, params?: {
  limit?: number;
  offset?: number;
  marketId?: string;
}): Promise<PolymarketTrade[]> {
  const queryParams = new URLSearchParams();
  queryParams.set('user', address);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.marketId) queryParams.set('market', params.marketId);

  return fetchWithErrorHandling<PolymarketTrade[]>(`/trades?${queryParams.toString()}`);
}

export async function getRecentTrades(params?: {
  limit?: number;
  offset?: number;
}): Promise<PolymarketTrade[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling<PolymarketTrade[]>(`/trades${query ? `?${query}` : ''}`);
}

// Activity
export async function getActivityFeed(params?: {
  limit?: number;
  offset?: number;
}): Promise<Array<{
  id: string;
  type: string;
  user: string;
  marketId: string;
  data: Record<string, unknown>;
  timestamp: string;
}>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling(`/activity${query ? `?${query}` : ''}`);
}

// Holder Data
export interface HolderData {
  address: string;
  position: 'YES' | 'NO';
  size: string;
  percentage: number;
  rank: number;
}

export async function getMarketHolders(marketId: string): Promise<HolderData[]> {
  return fetchWithErrorHandling<HolderData[]>(`/markets/${marketId}/holders`);
}

export async function getMarketHolderStats(marketId: string): Promise<{
  totalHolders: number;
  yesHolders: number;
  noHolders: number;
  avgPositionSize: string;
  concentrationScore: number; // 0-100, higher = more concentrated
}> {
  return fetchWithErrorHandling(`/markets/${marketId}/holders/stats`);
}

// Open Interest
export async function getMarketOpenInterest(marketId: string): Promise<{
  marketId: string;
  yesOpenInterest: string;
  noOpenInterest: string;
  totalOpenInterest: string;
  timestamp: string;
}> {
  return fetchWithErrorHandling(`/markets/${marketId}/open-interest`);
}

export async function getAllOpenInterest(): Promise<Array<{
  marketId: string;
  yesOpenInterest: string;
  noOpenInterest: string;
  totalOpenInterest: string;
  timestamp: string;
}>> {
  return fetchWithErrorHandling('/open-interest');
}

// Leaderboards
export interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  pnl: string;
  roi: number;
  totalTrades: number;
  winRate: number;
}

export async function getLeaderboard(params?: {
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'all-time';
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const queryParams = new URLSearchParams();
  if (params?.timeframe) queryParams.set('timeframe', params.timeframe);
  if (params?.limit) queryParams.set('limit', params.limit.toString());

  const query = queryParams.toString();
  return fetchWithErrorHandling<LeaderboardEntry[]>(`/leaderboard${query ? `?${query}` : ''}`);
}

// User Stats
export async function getUserStats(address: string): Promise<PolymarketUser> {
  return fetchWithErrorHandling<PolymarketUser>(`/users/${address}/stats`);
}

export async function getUserHistory(address: string): Promise<{
  firstTradeTimestamp: string;
  totalTrades: number;
  totalVolume: string;
  winRate: number;
  profitLoss: string;
  marketsParticipated: number;
}> {
  return fetchWithErrorHandling(`/users/${address}/history`);
}

// Orderbook (via Data API - simpler view)
export async function getMarketOrderbook(marketId: string, outcome: 'YES' | 'NO'): Promise<PolymarketOrderbook> {
  return fetchWithErrorHandling(`/markets/${marketId}/orderbook?outcome=${outcome}`);
}

// Volume Analytics
export async function getVolumeStats(params?: {
  marketId?: string;
  timeframe?: 'hour' | 'day' | 'week';
}): Promise<{
  totalVolume: string;
  tradeCount: number;
  uniqueTraders: number;
  avgTradeSize: string;
  largestTrade: string;
}> {
  const queryParams = new URLSearchParams();
  if (params?.marketId) queryParams.set('market', params.marketId);
  if (params?.timeframe) queryParams.set('timeframe', params.timeframe);

  const query = queryParams.toString();
  return fetchWithErrorHandling(`/volume/stats${query ? `?${query}` : ''}`);
}

// Price History
export interface PricePoint {
  timestamp: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
}

export async function getPriceHistory(marketId: string, params?: {
  resolution?: '1h' | '1d' | '1w';
  start?: string;
  end?: string;
}): Promise<PricePoint[]> {
  const queryParams = new URLSearchParams();
  if (params?.resolution) queryParams.set('resolution', params.resolution);
  if (params?.start) queryParams.set('start', params.start);
  if (params?.end) queryParams.set('end', params.end);

  const query = queryParams.toString();
  return fetchWithErrorHandling<PricePoint[]>(`/markets/${marketId}/price-history${query ? `?${query}` : ''}`);
}

// Get large trades (for detection)
export async function getLargeTrades(minUsdValue: number, params?: {
  limit?: number;
  timeframe?: number; // minutes
}): Promise<PolymarketTrade[]> {
  const recentTrades = await getRecentTrades({ limit: params?.limit || 100 });
  
  const cutoffTime = params?.timeframe
    ? new Date(Date.now() - params.timeframe * 60 * 1000)
    : new Date(0);

  return recentTrades.filter(trade => {
    const usdValue = parseFloat(trade.usdValue);
    const tradeTime = new Date(trade.timestamp);
    return usdValue >= minUsdValue && tradeTime >= cutoffTime;
  });
}

export const dataClient = {
  getUserPositions,
  getUserPositionForMarket,
  getMarketTrades,
  getUserTrades,
  getRecentTrades,
  getActivityFeed,
  getMarketHolders,
  getMarketHolderStats,
  getMarketOpenInterest,
  getAllOpenInterest,
  getLeaderboard,
  getUserStats,
  getUserHistory,
  getMarketOrderbook,
  getVolumeStats,
  getPriceHistory,
  getLargeTrades,
};
