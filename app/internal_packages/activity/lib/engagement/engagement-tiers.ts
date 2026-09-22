import { localized } from 'mailspring-exports';
import { EngagementStats } from './engagement-stats';

export type EngagementTier = 'high' | 'engaged' | 'none';

/** Column order, least to most engaged, so the board reads like a pipeline. */
export const ENGAGEMENT_TIERS: EngagementTier[] = ['none', 'engaged', 'high'];

/** Mirrors Mixmax's published rules with replies promoted above clicks. */
export function tierFor(stats: EngagementStats): EngagementTier {
  if (stats.replies > 0 || stats.clicks > 0 || stats.maxOpensOfOneMessage >= 3) {
    return 'high';
  }
  if (stats.opens > 0) {
    return 'engaged';
  }
  return 'none';
}

/** Outreach's 3/2/1 weighting, over deduped engaged messages rather than raw opens. */
export function engagementScore(stats: EngagementStats) {
  return 3 * stats.replies + 2 * stats.clicks + stats.engaged;
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
      return localized('Replied, clicked a link, or opened a tracked message three or more times');
    case 'engaged':
      return localized('Opened at least one tracked message');
    default:
      return localized('No opens or clicks on tracked messages, and no replies');
  }
}
