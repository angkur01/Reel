import { CpmCampaign, Reel } from '../types.js';

export interface CpmCalculationResult {
  campaignId: string | null;
  campaignName: string | null;
  cpmRate: number;
  minViews: number;
  maxViews: number;
  eligibleViews: number;
  cpmEarnings: number;
  fee3Percent: number;
  estimatedPayout: number;
  cpmEligibilityStatus: 'eligible' | 'below_minimum' | 'capped_at_max' | 'no_campaign';
}

/**
 * Calculates CPM earnings, 3% processing fee, and estimated payout for a reel's views.
 *
 * Rules:
 * - If views < minViews: eligibleViews = 0, status = 'below_minimum', CPM earnings = $0
 * - If views >= minViews and views <= maxViews (or maxViews === 0): eligibleViews = actual views, status = 'eligible'
 * - If maxViews > 0 and views > maxViews: eligibleViews = maxViews, status = 'capped_at_max'
 * - CPM Earnings = (eligibleViews / 1000) * cpmRate
 * - 3% Fee = cpmEarnings * 0.03
 * - Estimated Payout = cpmEarnings - 3% Fee
 */
export function calculateReelCpm(views: number, campaign?: CpmCampaign | null): CpmCalculationResult {
  if (!campaign || !campaign.enabled) {
    return {
      campaignId: campaign?.id || null,
      campaignName: campaign?.name || null,
      cpmRate: campaign?.cpm || 0,
      minViews: campaign?.minViews || 0,
      maxViews: campaign?.maxViews || 0,
      eligibleViews: 0,
      cpmEarnings: 0,
      fee3Percent: 0,
      estimatedPayout: 0,
      cpmEligibilityStatus: 'no_campaign',
    };
  }

  const safeViews = Math.max(0, Math.floor(views || 0));
  const min = Math.max(0, Math.floor(campaign.minViews || 0));
  const max = Math.max(0, Math.floor(campaign.maxViews || 0));
  const cpm = Math.max(0, campaign.cpm || 0);

  let eligibleViews = 0;
  let status: 'eligible' | 'below_minimum' | 'capped_at_max' = 'eligible';

  if (safeViews < min) {
    eligibleViews = 0;
    status = 'below_minimum';
  } else if (max > 0 && safeViews > max) {
    eligibleViews = max;
    status = 'capped_at_max';
  } else {
    eligibleViews = safeViews;
    status = 'eligible';
  }

  // Exact monetary calculations with 2 decimal place safety
  const rawEarnings = (eligibleViews / 1000) * cpm;
  const cpmEarnings = Math.round(rawEarnings * 100) / 100;
  const fee3Percent = Math.round(cpmEarnings * 0.03 * 100) / 100;
  const estimatedPayout = Math.round((cpmEarnings - fee3Percent) * 100) / 100;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    cpmRate: cpm,
    minViews: min,
    maxViews: max,
    eligibleViews,
    cpmEarnings,
    fee3Percent,
    estimatedPayout,
    cpmEligibilityStatus: status,
  };
}

/**
 * Recalculates CPM metrics directly on a Reel object in-place.
 */
export function applyCpmToReel(reel: Reel, campaigns: CpmCampaign[]): Reel {
  if (!reel.campaignId) {
    reel.campaignName = null;
    reel.cpmRate = 0;
    reel.minViews = 0;
    reel.maxViews = 0;
    reel.eligibleViews = 0;
    reel.cpmEarnings = 0;
    reel.fee3Percent = 0;
    reel.estimatedPayout = 0;
    reel.cpmEligibilityStatus = 'no_campaign';
    return reel;
  }

  const campaign = campaigns.find(c => c.id === reel.campaignId) || null;
  const calc = calculateReelCpm(reel.views, campaign);

  reel.campaignName = calc.campaignName;
  reel.cpmRate = calc.cpmRate;
  reel.minViews = calc.minViews;
  reel.maxViews = calc.maxViews;
  reel.eligibleViews = calc.eligibleViews;
  reel.cpmEarnings = calc.cpmEarnings;
  reel.fee3Percent = calc.fee3Percent;
  reel.estimatedPayout = calc.estimatedPayout;
  reel.cpmEligibilityStatus = calc.cpmEligibilityStatus;

  return reel;
}

/**
 * Recalculates CPM for all reels in a database instance.
 */
export function recalculateAllDbReelsCpm(reels: Reel[], campaigns: CpmCampaign[]): void {
  for (const reel of reels) {
    applyCpmToReel(reel, campaigns);
  }
}

/**
 * Calculates aggregate CPM metrics for all reels.
 */
export function getDbCpmTotals(reels: Reel[]) {
  let totalCpmEarnings = 0;
  let total3PercentFees = 0;
  let totalEstimatedPayout = 0;

  for (const reel of reels) {
    totalCpmEarnings += reel.cpmEarnings || 0;
    total3PercentFees += reel.fee3Percent || 0;
    totalEstimatedPayout += reel.estimatedPayout || 0;
  }

  return {
    totalCpmEarnings: Math.round(totalCpmEarnings * 100) / 100,
    total3PercentFees: Math.round(total3PercentFees * 100) / 100,
    totalEstimatedPayout: Math.round(totalEstimatedPayout * 100) / 100,
  };
}
