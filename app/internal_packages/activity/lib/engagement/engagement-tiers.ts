import { localized } from 'mailspring-exports';
import { EngagementStats } from './engagement-stats';

export type EngagementTier = 'high' | 'engaged' | 'none';

/** Column order, least to most engaged, so the board reads like a pipeline. */
export const ENGAGEMENT_TIERS: EngagementTier[] = ['none', 'engaged', 'high'];

/** Replies and repeated opens of a message signal high engagement. */
export function tierFor(stats: EngagementStats): EngagementTier {
  if (stats.replies > 0 || stats.maxOpensOfOneMessage >= 3) {
    return 'high';
  }
  if (stats.opens > 0) {
    return 'engaged';
  }
  return 'none';
}

/** Replies carry more weight than deduped opened messages. */
export function engagementScore(stats: EngagementStats) {
  return 3 * stats.replies + stats.engaged;
}

export function tierLabel(tier: EngagementTier) {
  switch (tier) {
    case 'high':
      return localized('Highly engaged');
    case 'engaged':
      return localized('Engaged');
    default:
      return localized('Not engaged');
  }
}

export function tierDescription(tier: EngagementTier) {
  switch (tier) {
    case 'high':
      return localized('Replied or opened a tracked message three or more times');
    case 'engaged':
      return localized('Opened at least one tracked message');
    default:
      return localized('No opens on tracked messages, and no replies');
  }
}
