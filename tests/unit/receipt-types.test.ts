import { describe, expect, test } from "bun:test"

import {
  FALLBACK_RECEIPT_TYPE,
  getReceiptType,
  isReceiptTypeId,
  RECEIPT_TYPE_IDS,
  RECEIPT_TYPES,
  receiptTypeLabel,
} from "@/lib/receipt-types"

describe("receipt types", () => {
  test("ids are unique and listed in RECEIPT_TYPE_IDS in order", () => {
    expect(new Set(RECEIPT_TYPE_IDS).size).toBe(RECEIPT_TYPES.length)
    expect(RECEIPT_TYPE_IDS).toEqual(RECEIPT_TYPES.map((t) => t.id))
  })

  test("the fallback type is a real type", () => {
    expect(isReceiptTypeId(FALLBACK_RECEIPT_TYPE)).toBe(true)
  })

  test("isReceiptTypeId accepts known ids only", () => {
    expect(isReceiptTypeId("grocery")).toBe(true)
    expect(isReceiptTypeId("Grocery")).toBe(false)
    expect(isReceiptTypeId("")).toBe(false)
    expect(isReceiptTypeId(undefined)).toBe(false)
    expect(isReceiptTypeId(42)).toBe(false)
    expect(isReceiptTypeId("toString")).toBe(false)
  })

  test("getReceiptType looks up the full definition", () => {
    expect(getReceiptType("fuel")?.label).toBe("Fuel & Transport")
    expect(getReceiptType("nope")).toBeUndefined()
  })

  test("receiptTypeLabel falls back to Unknown", () => {
    expect(receiptTypeLabel("medical")).toBe("Medical & Pharmacy")
    expect(receiptTypeLabel("nope")).toBe("Unknown")
  })
})
