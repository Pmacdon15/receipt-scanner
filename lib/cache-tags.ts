/**
 * Cache tags for receipt data, in one place so reads (`cacheTag`) and writes
 * (`updateTag`) can never drift apart.
 *
 * A receipt belongs to the user who saved it and, optionally, to the
 * organization it was saved into, so a change has to expire both: the user's
 * own searches and the org-wide searches that include it.
 */
export const receiptTags = {
  user: (userId: string) => `receipts:user:${userId}`,
  org: (orgId: string) => `receipts:org:${orgId}`,
}

/** Every tag a change to one receipt has to expire. */
export function receiptChangeTags(receipt: {
  userId: string
  orgId: string | null
}): string[] {
  const tags = [receiptTags.user(receipt.userId)]
  if (receipt.orgId) tags.push(receiptTags.org(receipt.orgId))
  return tags
}
