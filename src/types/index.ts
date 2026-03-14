// Platform types
export type Platform = 'polymarket' | 'kalshi';

// Trade outcome
export type Outcome = 'YES' | 'NO';

// Detection log types
export type LogType = 'info' | 'warning' | 'error' | 'detection' | 'autotrade';

// Auto-trade status
export type AutoTradeStatus = 'pending' | 'executed' | 'failed';

// Notification types
export type NotificationType = 'telegram' | 'discord' | 'slack' | 'webhook';

// ============================================
// Polymarket API Types
// ============================================

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  description?: string;
  conditionId: string;
  questionId: string;
  image?: string;
  icon?: string;
  endDate?: string;
  startDate?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  resolved?: boolean;
  resolutionSource?: string;
  tags?: string[];
  outcomes: string[];
  outcomePrices?: string[];
  volume?: string;
  liquidity?: string;
  priceHistory?: Array<{
    timestamp: string;
    price: string;
  }>;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  image?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  markets: PolymarketMarket[];
  tags?: string[];
}

export interface PolymarketTrade {
  id: string;
  transactionHash: string;
  marketId: string;
  outcome: Outcome;
  price: string;
  size: string;
  usdValue: string;
  timestamp: string;
  maker: string;
  taker: string;
  side: 'BUY' | 'SELL';
  feeRateBps?: string;
  status?: string;
}

export interface PolymarketPosition {
  id: string;
  marketId: string;
  outcome: Outcome;
  size: string;
  avgPrice: string;
  currentPrice: string;
  usdValue: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
}

export interface PolymarketUser {
  address: string;
  firstTradeTimestamp?: string;
  totalTrades?: number;
  totalVolume?: string;
  winRate?: number;
}

export interface PolymarketOrderbook {
  marketId: string;
  outcome: Outcome;
  bids: Array<{
    price: string;
    size: string;
  }>;
  asks: Array<{
    price: string;
    size: string;
  }>;
  timestamp: string;
}

// ============================================
// Kalshi API Types
// ============================================

export interface KalshiMarket {
  id: string;
  ticker: string;
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  openTime: string;
  closeTime: string;
  expireTime?: string;
  active: boolean;
  settled: boolean;
  settledPrice?: number;
  volume?: number;
  openInterest?: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  rules?: string;
  imageUrl?: string;
  eventTicker?: string;
}

export interface KalshiTrade {
  id: string;
  marketId: string;
  marketTicker: string;
  outcome: Outcome;
  price: number;
  size: number;
  usdValue: number;
  timestamp: string;
  userId?: string;
  side: 'BUY' | 'SELL';
  status?: string;
}

export interface KalshiPosition {
  id: string;
  marketId: string;
  marketTicker: string;
  outcome: Outcome;
  size: number;
  avgPrice: number;
  currentPrice: number;
  usdValue: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

export interface KalshiUser {
  userId: string;
  firstTradeTimestamp?: string;
  totalTrades?: number;
  totalVolume?: number;
  winRate?: number;
}

export interface KalshiOrderbook {
  marketId: string;
  outcome: Outcome;
  bids: Array<{
    price: number;
    size: number;
  }>;
  asks: Array<{
    price: number;
    size: number;
  }>;
  timestamp: string;
}

// ============================================
// Detection Engine Types
// ============================================

export interface DetectionCriteria {
  name: string;
  weight: number;
  description: string;
  evaluate: (context: EvaluationContext) => Promise<number>; // Returns 0-100 score
}

export interface EvaluationContext {
  trade: TradeInfo;
  account: AccountInfo;
  market: MarketInfo;
  platform: Platform;
  config: DetectionConfig;
}

export interface TradeInfo {
  id: string;
  marketId: string;
  marketTicker?: string;
  outcome: Outcome;
  price: number;
  size: number;
  usdValue: number;
  timestamp: Date;
  accountId: string;
}

export interface AccountInfo {
  id: string;
  platform: Platform;
  address: string;
  firstSeen: Date;
  totalTrades: number;
  totalVolume: number;
  winRate?: number;
  isWatchlisted: boolean;
  watchlistReason?: string;
}

export interface MarketInfo {
  id: string;
  ticker?: string;
  question?: string;
  liquidity: number;
  volume: number;
  endDate?: Date;
  resolutionDate?: Date;
  outcomes: string[];
}

export interface DetectionResult {
  tradeId: string;
  platform: Platform;
  probability: number;
  criteriaScores: Record<string, number>;
  isSuspicious: boolean;
  reasons: string[];
  timestamp: Date;
}

// ============================================
// Configuration Types
// ============================================

export interface PlatformConfig {
  minMarketLiquidity: number; // Default: 10000
  bigTradeUsdThreshold: number; // Default: 1000
  bigTradePercentThreshold: number; // Default: 2
  pollingInterval: number; // Default: 10 seconds
  enabled: boolean;
}

export interface GlobalConfig {
  autoTradeEnabled: boolean;
  autoTradeAmount: number;
  autoTradeProbabilityThreshold: number;
  autoTradeRateLimit?: number;
  dataRetentionDays: number;
  notificationMethod: NotificationType;
}

export interface DetectionConfig extends PlatformConfig, GlobalConfig {
  platform: Platform;
}

// Default configuration values
export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  minMarketLiquidity: 10000,
  bigTradeUsdThreshold: 1000,
  bigTradePercentThreshold: 2,
  pollingInterval: 10,
  enabled: true,
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  autoTradeEnabled: false,
  autoTradeAmount: 1,
  autoTradeProbabilityThreshold: 70,
  dataRetentionDays: 365,
  notificationMethod: 'telegram',
};

// ============================================
// Notification Types
// ============================================

export interface NotificationConfig {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  discord?: {
    webhookUrl: string;
  };
  slack?: {
    webhookUrl: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

export interface NotificationPayload {
  type: 'detection' | 'autotrade' | 'error' | 'info';
  platform: Platform;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// Dashboard Types
// ============================================

export interface DashboardStats {
  totalTrades: number;
  suspiciousTrades: number;
  watchlistCount: number;
  autoTradesToday: number;
  detectionRate: number;
  avgInsiderProbability: number;
}

export interface RecentDetection {
  id: string;
  platform: Platform;
  marketId: string;
  marketTicker?: string;
  outcome: Outcome;
  usdValue: number;
  insiderProbability: number;
  timestamp: Date;
  accountAddress: string;
}

export interface WatchlistEntry {
  id: string;
  platform: Platform;
  accountAddress: string;
  reason: string;
  probability: number;
  flaggedAt: Date;
  isActive: boolean;
}

export interface LogEntry {
  id: string;
  platform: Platform;
  type: LogType;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Detection Engine State
// ============================================

export interface DetectionEngineState {
  isRunning: boolean;
  platform: Platform;
  lastScanTime?: Date;
  marketsScanned: number;
  tradesProcessed: number;
  errors: Array<{
    timestamp: Date;
    message: string;
  }>;
}

// ============================================
// Auto-Trade Types
// ============================================

export interface AutoTradeRequest {
  platform: Platform;
  marketId: string;
  outcome: Outcome;
  amount: number;
  triggerTradeId: string;
  probability: number;
}

export interface AutoTradeResult {
  success: boolean;
  autoTradeId?: string;
  executedAt?: Date;
  errorMessage?: string;
}

// ============================================
// Criteria Weights
// ============================================

export const CRITERIA_WEIGHTS = {
  accountAge: {
    name: 'Account Age',
    weight: 25,
    description: 'New accounts (<30 days) with large trades',
  },
  tradeSize: {
    name: 'Trade Size',
    weight: 25,
    description: '>$1000 USD OR >2% of market liquidity',
  },
  timingPrecision: {
    name: 'Timing Precision',
    weight: 30,
    description: 'Trades before resolution events',
  },
  winRateOnBigBets: {
    name: 'Win Rate on Big Bets',
    weight: 25,
    description: '>70% win rate on large trades',
  },
  firstMarketActivity: {
    name: 'First Market Activity',
    weight: 15,
    description: 'First-ever trade being a big winner',
  },
  marketKnowledge: {
    name: 'Market Knowledge',
    weight: 15,
    description: 'Betting on obscure outcomes confidently',
  },
  priceMovement: {
    name: 'Price Movement',
    weight: 15,
    description: 'Large bets moving market significantly',
  },
  behavioralPattern: {
    name: 'Behavioral Pattern',
    weight: 25,
    description: 'Similar patterns across accounts (sybil)',
  },
  liquidityTargeting: {
    name: 'Liquidity Targeting',
    weight: 15,
    description: 'Betting when liquidity is low',
  },
  previousWatchlist: {
    name: 'Previous Watchlist',
    weight: 35,
    description: 'Account previously flagged',
  },
} as const;

export type CriteriaKey = keyof typeof CRITERIA_WEIGHTS;

// ============================================
// Additional Notification Types
// ============================================

export interface NotificationPayload {
  type: 'detection' | 'autotrade' | 'error' | 'info';
  platform: Platform;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface NotificationConfigType {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  discord?: {
    webhookUrl: string;
  };
  slack?: {
    webhookUrl: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

// ============================================
// Additional Dashboard Types
// ============================================

export interface RecentDetection {
  id: string;
  platform: Platform;
  marketId: string;
  marketTicker?: string;
  outcome: Outcome;
  usdValue: number;
  insiderProbability: number;
  timestamp: Date;
  accountAddress: string;
}

export interface WatchlistEntry {
  id: string;
  platform: Platform;
  accountAddress: string;
  reason: string;
  probability: number;
  flaggedAt: Date;
  isActive: boolean;
}
