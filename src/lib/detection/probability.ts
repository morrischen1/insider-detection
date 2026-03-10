/**
 * Probability Calculation
 * Calculates insider trading probability from criteria scores
 */

import type {
  EvaluationContext,
  DetectionResult,
  CriteriaKey,
  CRITERIA_WEIGHTS,
} from '@/types';
import { criteriaEvaluators } from './criteria';

// Criteria weights type
type CriteriaWeights = typeof CRITERIA_WEIGHTS;

// Default weights - can be customized per platform
const DEFAULT_WEIGHTS: Record<CriteriaKey, number> = {
  accountAge: 25,
  tradeSize: 25,
  timingPrecision: 30,
  winRateOnBigBets: 25,
  firstMarketActivity: 15,
  marketKnowledge: 15,
  priceMovement: 15,
  behavioralPattern: 25,
  liquidityTargeting: 15,
  previousWatchlist: 35,
};

/**
 * Calculate weighted probability from criteria scores
 */
export function calculateProbability(
  criteriaScores: Record<CriteriaKey, number>,
  weights: Record<CriteriaKey, number> = DEFAULT_WEIGHTS
): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const key of Object.keys(criteriaScores) as CriteriaKey[]) {
    const score = criteriaScores[key];
    const weight = weights[key] || 0;

    totalWeightedScore += score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  // Calculate percentage
  const probability = (totalWeightedScore / totalWeight);

  return Math.min(100, Math.max(0, probability));
}

/**
 * Get reasons for suspicion based on scores
 */
export function getSuspicionReasons(
  criteriaScores: Record<CriteriaKey, number>,
  threshold: number = 50
): string[] {
  const reasons: string[] = [];

  const reasonMessages: Record<CriteriaKey, (score: number) => string> = {
    accountAge: (score) => `New account with suspicious activity (score: ${score.toFixed(0)})`,
    tradeSize: (score) => `Unusually large trade size (score: ${score.toFixed(0)})`,
    timingPrecision: (score) => `Trade placed close to resolution time (score: ${score.toFixed(0)})`,
    winRateOnBigBets: (score) => `Suspiciously high win rate on large bets (score: ${score.toFixed(0)})`,
    firstMarketActivity: (score) => `Large trade as one of first activities (score: ${score.toFixed(0)})`,
    marketKnowledge: (score) => `High confidence bet on obscure market (score: ${score.toFixed(0)})`,
    priceMovement: (score) => `Trade significantly moved market price (score: ${score.toFixed(0)})`,
    behavioralPattern: (score) => `Similar patterns detected across accounts (score: ${score.toFixed(0)})`,
    liquidityTargeting: (score) => `Trade placed when liquidity was low (score: ${score.toFixed(0)})`,
    previousWatchlist: (score) => `Account previously flagged for insider trading (score: ${score.toFixed(0)})`,
  };

  for (const [key, score] of Object.entries(criteriaScores) as [CriteriaKey, number][]) {
    if (score >= threshold) {
      const getMessage = reasonMessages[key];
      if (getMessage) {
        reasons.push(getMessage(score));
      }
    }
  }

  return reasons;
}

/**
 * Determine if a trade is suspicious based on probability
 */
export function isSuspicious(probability: number, threshold: number = 50): boolean {
  return probability >= threshold;
}

/**
 * Evaluate all criteria for a trade
 */
export async function evaluateAllCriteria(
  context: EvaluationContext,
  customWeights?: Record<CriteriaKey, number>
): Promise<DetectionResult> {
  const criteriaScores: Record<CriteriaKey, number> = {} as Record<CriteriaKey, number>;

  // Evaluate each criterion
  for (const [key, evaluator] of Object.entries(criteriaEvaluators) as [CriteriaKey, (ctx: EvaluationContext) => Promise<number>][]) {
    try {
      const score = await evaluator(context);
      criteriaScores[key] = score;
    } catch (error) {
      console.error(`Error evaluating criterion ${key}:`, error);
      criteriaScores[key] = 0;
    }
  }

  // Calculate probability
  const weights = customWeights || DEFAULT_WEIGHTS;
  const probability = calculateProbability(criteriaScores, weights);

  // Get reasons
  const reasons = getSuspicionReasons(criteriaScores);

  return {
    tradeId: context.trade.id,
    platform: context.platform,
    probability,
    criteriaScores,
    isSuspicious: isSuspicious(probability),
    reasons,
    timestamp: new Date(),
  };
}

/**
 * Get criteria weights from config
 */
export async function getCriteriaWeights(platform?: string): Promise<Record<CriteriaKey, number>> {
  // In a full implementation, these would be loaded from the database
  // For now, return defaults
  return DEFAULT_WEIGHTS;
}

/**
 * Update criteria weights
 */
export async function updateCriteriaWeights(
  weights: Partial<Record<CriteriaKey, number>>,
  platform?: string
): Promise<void> {
  // In a full implementation, these would be saved to the database
  console.log('Updating criteria weights:', weights, 'for platform:', platform);
}

export { DEFAULT_WEIGHTS };
