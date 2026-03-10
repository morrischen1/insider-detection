/**
 * Polymarket CLOB API Client
 * Used for orderbook, pricing, order placement (requires auth)
 */

import { logApiCall } from '@/lib/logger/api';
import type { Outcome } from '@/types';

const CLOB_API_BASE = 'https://clob.polymarket.com';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requireAuth?: boolean;
}

// Generate authentication headers
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const address = process.env.POLYMARKET_ADDRESS;

  if (!apiKey || !apiSecret || !address) {
    console.warn('Polymarket CLOB API credentials not configured');
    return {};
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();

  return {
    'POLY-ADDRESS': address,
    'POLY-API-KEY': apiKey,
    'POLY-SIGNATURE': apiSecret, // In production, this should be properly signed
    'POLY-TIMESTAMP': timestamp,
  };
}

async function fetchWithErrorHandling<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, requireAuth = false } = options;
  const startTime = Date.now();
  const url = `${CLOB_API_BASE}${endpoint}`;

  const authHeaders = requireAuth ? getAuthHeaders() : {};

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
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
      throw new Error(`CLOB API error: ${status} - ${errorText}`);
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

// Orderbook
export interface ClobOrderbook {
  marketId: string;
  assetId: string;
  bids: Array<{
    price: string;
    size: string;
  }>;
  asks: Array<{
    price: string;
    size: string;
  }>;
  hash: string;
  timestamp: string;
}

export async function getOrderbook(
  marketId: string,
  outcome: Outcome
): Promise<ClobOrderbook> {
  // Get asset ID for the outcome
  const assetId = await getAssetId(marketId, outcome);
  return fetchWithErrorHandling<ClobOrderbook>(`/book?token_id=${assetId}`);
}

// Asset ID mapping
export async function getAssetId(marketId: string, outcome: Outcome): Promise<string> {
  // In Polymarket, each outcome has a unique asset/token ID
  // We need to query the market to get the condition ID and then derive the asset ID
  // For simplicity, we'll use a direct mapping approach

  const response = await fetchWithErrorHandling<Array<{
    condition_id: string;
    token_id: string;
    outcome: string;
  }>>(`/markets/${marketId}`);

  const asset = response.find(a =>
    a.outcome.toLowerCase() === outcome.toLowerCase()
  );

  if (!asset) {
    throw new Error(`Asset ID not found for market ${marketId} outcome ${outcome}`);
  }

  return asset.token_id;
}

// Price/Midpoint
export async function getMidpointPrice(marketId: string, outcome: Outcome): Promise<{
  marketId: string;
  outcome: Outcome;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
}> {
  const orderbook = await getOrderbook(marketId, outcome);

  const bestBid = parseFloat(orderbook.bids[0]?.price || '0');
  const bestAsk = parseFloat(orderbook.asks[0]?.price || '1');
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  return {
    marketId,
    outcome,
    bid: bestBid,
    ask: bestAsk,
    mid,
    spread,
  };
}

// Price History
export interface PricePoint {
  timestamp: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
}

export async function getPriceHistory(
  marketId: string,
  outcome: Outcome,
  params?: {
    startTs?: number;
    endTs?: number;
    fidelity?: number;
  }
): Promise<PricePoint[]> {
  const assetId = await getAssetId(marketId, outcome);

  const queryParams = new URLSearchParams();
  queryParams.set('token_id', assetId);
  if (params?.startTs) queryParams.set('start_ts', params.startTs.toString());
  if (params?.endTs) queryParams.set('end_ts', params.endTs.toString());
  if (params?.fidelity) queryParams.set('fidelity', params.fidelity.toString());

  return fetchWithErrorHandling<PricePoint[]>(`/price-history?${queryParams.toString()}`);
}

// Orders (require auth)
export interface Order {
  id: string;
  marketId: string;
  assetId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  filledSize: string;
  status: 'LIVE' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderParams {
  marketId: string;
  outcome: Outcome;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  expiration?: number;
}

export async function getOrders(status?: 'LIVE' | 'FILLED' | 'CANCELLED'): Promise<Order[]> {
  if (!process.env.POLYMARKET_API_KEY) {
    throw new Error('Polymarket API credentials not configured');
  }

  const endpoint = status ? `/orders?status=${status}` : '/orders';
  return fetchWithErrorHandling<Order[]>(endpoint, { requireAuth: true });
}

export async function createOrder(params: CreateOrderParams): Promise<Order> {
  const { marketId, outcome, side, price, size, expiration } = params;

  if (!process.env.POLYMARKET_API_KEY || !process.env.POLYMARKET_API_SECRET) {
    throw new Error('Polymarket CLOB API credentials not configured. Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_ADDRESS');
  }

  const assetId = await getAssetId(marketId, outcome);

  const orderBody = {
    token_id: assetId,
    side: side.toUpperCase(),
    price: price.toString(),
    size: size.toString(),
    expiration: expiration || Math.floor(Date.now() / 1000) + 86400,
  };

  const response = await fetchWithErrorHandling<{ order: Order }>('/order', {
    method: 'POST',
    body: orderBody,
    requireAuth: true,
  });

  return response.order;
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean }> {
  return fetchWithErrorHandling(`/order/${orderId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

export async function cancelAllOrders(marketId?: string): Promise<{ cancelled: string[] }> {
  const endpoint = marketId ? `/orders?market=${marketId}` : '/orders';
  return fetchWithErrorHandling(endpoint, {
    method: 'DELETE',
    requireAuth: true,
  });
}

// Market execution (market order simulation)
export async function executeMarketBuy(params: {
  marketId: string;
  outcome: Outcome;
  amount: number; // USD amount
  maxSlippage?: number;
}): Promise<{
  success: boolean;
  avgPrice: number;
  filledSize: number;
  orderId?: string;
}> {
  const { marketId, outcome, amount, maxSlippage = 0.02 } = params;

  const orderbook = await getOrderbook(marketId, outcome);

  // Calculate fill against asks
  const asks = orderbook.asks;
  let remainingAmount = amount;
  let totalSize = 0;
  let totalCost = 0;

  for (const level of asks) {
    if (remainingAmount <= 0) break;

    const levelPrice = parseFloat(level.price);
    const levelSize = parseFloat(level.size);
    const levelCost = levelPrice * levelSize;

    if (levelCost <= remainingAmount) {
      totalSize += levelSize;
      totalCost += levelCost;
      remainingAmount -= levelCost;
    } else {
      const partialSize = remainingAmount / levelPrice;
      totalSize += partialSize;
      totalCost += remainingAmount;
      remainingAmount = 0;
    }
  }

  const avgPrice = totalCost / totalSize;
  const bestAsk = parseFloat(asks[0]?.price || '100');
  const slippage = Math.abs(avgPrice - bestAsk) / bestAsk;

  if (slippage > maxSlippage) {
    throw new Error(`Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(maxSlippage * 100).toFixed(2)}%`);
  }

  try {
    const order = await createOrder({
      marketId,
      outcome,
      side: 'BUY',
      price: avgPrice * (1 + maxSlippage),
      size: totalSize,
    });

    return {
      success: true,
      avgPrice,
      filledSize: totalSize,
      orderId: order.id,
    };
  } catch (error) {
    return {
      success: false,
      avgPrice,
      filledSize: 0,
    };
  }
}

// Check if CLOB is available
export function isClobAvailable(): boolean {
  return !!(
    process.env.POLYMARKET_API_KEY &&
    process.env.POLYMARKET_API_SECRET &&
    process.env.POLYMARKET_ADDRESS
  );
}

export const clobClient = {
  getOrderbook,
  getAssetId,
  getMidpointPrice,
  getPriceHistory,
  getOrders,
  createOrder,
  cancelOrder,
  cancelAllOrders,
  executeMarketBuy,
  isClobAvailable,
};
