import { describe, expect, test } from "bun:test"

import { classifyReceipt } from "@/lib/classify-receipt"
import { isReceiptTypeId, type ReceiptTypeId } from "@/lib/receipt-types"

describe("classifyReceipt", () => {
  test.each([
    ["Safeway", "grocery"],
    ["Tim Hortons", "restaurant"],
    ["Petro-Canada", "fuel"],
    ["Air Canada", "travel"],
    ["Staples", "office"],
    ["Home Depot", "hardware"],
    ["Shoppers Drug Mart", "medical"],
    ["Rogers", "utilities"],
  ] as [string, ReceiptTypeId][])(
    "detects %s as %s from the merchant name",
    (merchant, expected) => {
      expect(classifyReceipt({ merchant }).type).toBe(expected)
    }
  )

  test("falls back to other with zero confidence when nothing matches", () => {
    expect(
      classifyReceipt({ merchant: "Zzyzx Ltd", rawText: "item 1" })
    ).toEqual({ type: "other", confidence: 0 })
  })

  test("handles missing and null input", () => {
    expect(classifyReceipt({})).toEqual({ type: "other", confidence: 0 })
    expect(classifyReceipt({ merchant: null, rawText: null })).toEqual({
      type: "other",
      confidence: 0,
    })
  })

  test("is case-insensitive", () => {
    expect(classifyReceipt({ merchant: "COSTCO WHOLESALE" }).type).toBe(
      "grocery"
    )
  })

  test("uses body text when the merchant name says nothing", () => {
    const result = classifyReceipt({
      merchant: "Store #42",
      rawText: "Regular unleaded 40.2 litre",
    })
    expect(result.type).toBe("fuel")
  })

  test("weights a merchant hit above a body-text hit", () => {
    // One merchant hit (3) for grocery beats two body hits (2) for restaurant.
    const result = classifyReceipt({
      merchant: "Sobeys",
      rawText: "coffee and pizza",
    })
    expect(result.type).toBe("grocery")
  })

  test("confidence grows with score and is capped at 0.95", () => {
    const weak = classifyReceipt({ rawText: "hotel" })
    const strong = classifyReceipt({
      merchant: "Hotel Inn Resort Booking",
      rawText: "baggage boarding airline",
    })

    expect(weak.confidence).toBeCloseTo(0.52)
    expect(strong.confidence).toBe(0.95)
    expect(strong.confidence).toBeGreaterThan(weak.confidence)
  })

  test("always returns a known receipt type and a confidence in [0, 1]", () => {
    const samples = [
      { merchant: "Starbucks" },
      { rawText: "kwh natural gas" },
      { merchant: "GitHub", rawText: "monthly plan" },
      { merchant: "" },
    ]
    for (const sample of samples) {
      const { type, confidence } = classifyReceipt(sample)
      expect(isReceiptTypeId(type)).toBe(true)
      expect(confidence).toBeGreaterThanOrEqual(0)
      expect(confidence).toBeLessThanOrEqual(1)
    }
  })
})
