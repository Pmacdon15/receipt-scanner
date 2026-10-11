/**
 * What each Clerk Billing plan unlocks, keyed by the Feature slugs set up in
 * the Clerk Dashboard (Billing → Plans). This file is the one place the slugs
 * and the numbers behind them live; the checks in lib/dal/entitlements.ts read
 * from here and never hardcode a limit.
 *
 * Clerk Features are on/off, so a numeric limit is modelled as one Feature per
 * tier. A plan carries the tier it gets:
 *
 *   Free (free_user)  receipts_500_per_year, org_size_1
 *   Pro  (pro)        receipts_2000_per_year, org_size_3, auto_detect
 *                     $10/month or $100/year
 *
 * Adding a feature: add its slug to FEATURES, give it to the plan in Clerk,
 * then write a check for it next to the others.
 */

export const FEATURES = {
  autoDetect: "auto_detect",
  receipts500PerYear: "receipts_500_per_year",
  receipts2000PerYear: "receipts_2000_per_year",
  orgSize1: "org_size_1",
  orgSize3: "org_size_3",
} as const

export type FeatureSlug = (typeof FEATURES)[keyof typeof FEATURES]

export const PLANS = {
  free: { slug: "free_user", name: "Free" },
  pro: { slug: "pro", name: "Pro" },
} as const

/** One step of a numeric limit: holding `feature` grants `limit`. */
export type LimitTier = { feature: FeatureSlug; limit: number }

// Highest first. The last tier is also the fallback, so someone with no plan
// Features at all (Billing not set up yet, or a lapsed subscription) gets the
// Free allowance rather than nothing.
export const RECEIPTS_PER_YEAR_TIERS: readonly LimitTier[] = [
  { feature: FEATURES.receipts2000PerYear, limit: 2000 },
  { feature: FEATURES.receipts500PerYear, limit: 500 },
]

export const ORG_SIZE_TIERS: readonly LimitTier[] = [
  { feature: FEATURES.orgSize3, limit: 3 },
  { feature: FEATURES.orgSize1, limit: 1 },
]

/** The best limit the caller's Features grant, or the lowest tier's. */
export function resolveLimit(
  tiers: readonly LimitTier[],
  hasFeature: (feature: FeatureSlug) => boolean
): { limit: number; isTop: boolean } {
  const index = tiers.findIndex((tier) => hasFeature(tier.feature))
  const tier = tiers[index] ?? tiers[tiers.length - 1]
  return { limit: tier.limit, isTop: index === 0 }
}

/** Start of the current calendar year (UTC), as an ISO timestamp. */
export function startOfYear(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
}

export const PRICING_PATH = "/pricing"
