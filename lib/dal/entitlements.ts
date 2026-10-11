import { auth, clerkClient } from "@clerk/nextjs/server"
import { cache } from "react"

import {
  FEATURES,
  type FeatureSlug,
  ORG_SIZE_TIERS,
  PLANS,
  RECEIPTS_PER_YEAR_TIERS,
  resolveLimit,
  startOfYear,
} from "@/lib/billing/plans"
import { countReceiptsCreatedSince } from "@/lib/db/receipts"
import { requireUserId } from "./receipts"

/**
 * Plan checks (Clerk Billing). Each check is a small async function that
 * throws an EntitlementError when the caller's plan does not cover the action;
 * checkEntitlements runs any set of them in parallel and reports every one
 * that failed in a single message, which the actions return for the form to
 * toast.
 *
 * Gating a new action: pick checks from ENTITLEMENTS (or add a preset there)
 * and call `await checkEntitlements(...ENTITLEMENTS.whatever)` before doing
 * the work. Adding a new limit: put its Feature slugs in lib/billing/plans.ts
 * and write a check below.
 */

/** Why a check failed. The message is safe to show to the user. */
export type EntitlementCode = "receipt_limit" | "org_size" | "auto_detect"

export class EntitlementError extends Error {
  readonly codes: EntitlementCode[]
  /** A higher plan would lift this, so the UI can point at the pricing page. */
  readonly upgradable: boolean

  constructor(codes: EntitlementCode[], message: string, upgradable = false) {
    super(message)
    this.name = "EntitlementError"
    this.codes = codes
    this.upgradable = upgradable
  }
}

/** What every check gets: who is asking, and what their plan holds. */
export type BillingContext = {
  userId: string
  orgId: string | null
  hasFeature: (feature: FeatureSlug) => boolean
}

export type EntitlementCheck = (ctx: BillingContext) => Promise<void>

// auth() once per request, shared by every check in the batch.
const getBillingContext = cache(async (): Promise<BillingContext> => {
  const userId = await requireUserId()
  const { orgId, has } = await auth()
  return {
    userId,
    orgId: orgId ?? null,
    hasFeature: (feature) => has({ feature }),
  }
})

/** Receipts saved this calendar year stay under the plan's yearly limit. */
export const receiptLimitCheck: EntitlementCheck = async (ctx) => {
  const { limit, isTop } = resolveLimit(RECEIPTS_PER_YEAR_TIERS, ctx.hasFeature)
  const used = await countReceiptsCreatedSince(ctx.userId, startOfYear())

  if (used >= limit) {
    throw new EntitlementError(
      ["receipt_limit"],
      `You've used all ${limit.toLocaleString("en-CA")} receipt scans for this year.`,
      !isTop
    )
  }
}

/**
 * The active organization has no more members than the plan allows. Nothing
 * to check when the user is working on their own.
 */
export const orgSizeCheck: EntitlementCheck = async (ctx) => {
  if (!ctx.orgId) return

  const { limit, isTop } = resolveLimit(ORG_SIZE_TIERS, ctx.hasFeature)

  let members: number
  try {
    const client = await clerkClient()
    const org = await client.organizations.getOrganization({
      organizationId: ctx.orgId,
    })
    members = org.membersCount ?? 0
  } catch (error) {
    // Fails closed: an unknown size is not proof the org fits the plan.
    console.error("could not load organization size", error)
    throw new EntitlementError(
      ["org_size"],
      "Couldn't check your organization's size. Try again."
    )
  }

  if (members > limit) {
    throw new EntitlementError(
      ["org_size"],
      `Your plan allows organizations of up to ${limit} ${limit === 1 ? "member" : "members"}, and this one has ${members}.`,
      !isTop
    )
  }
}

/** Reading a receipt photo automatically is a Pro feature. */
export const autoDetectCheck: EntitlementCheck = async (ctx) => {
  if (!ctx.hasFeature(FEATURES.autoDetect)) {
    throw new EntitlementError(
      ["auto_detect"],
      `Auto-detect is a ${PLANS.pro.name} feature, so fill the details in by hand.`,
      true
    )
  }
}

/** Which checks each gated action runs. */
export const ENTITLEMENTS = {
  /** Saving a receipt from the scanner. */
  saveReceipt: [receiptLimitCheck, orgSizeCheck],
  /** Reading a receipt photo to pre-fill the scanner. */
  autoDetect: [autoDetectCheck, receiptLimitCheck, orgSizeCheck],
} satisfies Record<string, EntitlementCheck[]>

/**
 * Runs the checks in parallel and throws one EntitlementError naming every
 * check that failed (messages in the order the checks were given). Anything
 * else a check throws, such as signing out mid-request, is rethrown as is.
 */
export async function checkEntitlements(
  ...checks: EntitlementCheck[]
): Promise<void> {
  const ctx = await getBillingContext()
  const results = await Promise.allSettled(checks.map((check) => check(ctx)))

  const failures: EntitlementError[] = []
  for (const result of results) {
    if (result.status === "fulfilled") continue
    if (!(result.reason instanceof EntitlementError)) throw result.reason
    failures.push(result.reason)
  }

  if (failures.length > 0) {
    const upgradable = failures.some((f) => f.upgradable)
    const messages = failures.map((f) => f.message)
    if (upgradable) messages.push(`Upgrade to ${PLANS.pro.name} for more.`)
    throw new EntitlementError(
      failures.flatMap((f) => f.codes),
      messages.join(" "),
      upgradable
    )
  }
}
