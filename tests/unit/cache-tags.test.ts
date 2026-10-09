import { describe, expect, test } from "bun:test"

import { receiptChangeTags, receiptTags } from "@/lib/cache-tags"

describe("receipt cache tags", () => {
  test("are namespaced per user and per org", () => {
    expect(receiptTags.user("user_a")).toBe("receipts:user:user_a")
    expect(receiptTags.org("org_1")).toBe("receipts:org:org_1")
    expect(receiptTags.user("org_1")).not.toBe(receiptTags.org("org_1"))
  })

  test("a personal receipt expires only its owner's tag", () => {
    expect(receiptChangeTags({ userId: "user_a", orgId: null })).toEqual([
      "receipts:user:user_a",
    ])
  })

  test("an org receipt expires the owner's and the org's tags", () => {
    expect(receiptChangeTags({ userId: "user_a", orgId: "org_1" })).toEqual([
      "receipts:user:user_a",
      "receipts:org:org_1",
    ])
  })
})
