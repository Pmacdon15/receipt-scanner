import { describe, expect, test } from "bun:test"

import { makeSearchedReceipt } from "../helpers/fixtures"

import {
  buildReport,
  categoryLabel,
  categoryShares,
  describePeriod,
  exportBaseName,
  formatCurrencyTotals,
  monthLabel,
} from "@/lib/documents/report"
import { matchingPreset, periodPresets } from "@/lib/documents/periods"

describe("buildReport", () => {
  test("adds up totals, tax and subtotal per currency", () => {
    const report = buildReport([
      makeSearchedReceipt({ totalCents: 1050, taxCents: 50, subtotalCents: 1000 }),
      makeSearchedReceipt({ totalCents: 2000, taxCents: null, subtotalCents: null }),
      makeSearchedReceipt({ totalCents: 500, currency: "USD" }),
    ])

    expect(report.receiptCount).toBe(3)
    expect(report.currencies.map((c) => c.currency)).toEqual(["CAD", "USD"])

    const cad = report.currencies[0]
    expect(cad.totalCents).toBe(3050)
    expect(cad.taxCents).toBe(50)
    expect(cad.subtotalCents).toBe(1000)
    expect(cad.taxKnown).toBe(1)
    expect(cad.subtotalKnown).toBe(1)
    expect(formatCurrencyTotals(report)).toBe("$30.50 + US$5.00")
  })

  test("a split receipt counts in each category with only its share", () => {
    const report = buildReport([
      makeSearchedReceipt({
        totalCents: 4217,
        receiptType: "grocery",
        splits: [
          { type: "grocery", amountCents: 3000 },
          { type: "hardware", amountCents: 1217 },
        ],
      }),
      makeSearchedReceipt({ totalCents: 1000, receiptType: "hardware" }),
    ])

    const categories = report.currencies[0].byCategory
    expect(categories.map((c) => [c.type, c.totalCents, c.receiptCount])).toEqual([
      ["grocery", 3000, 1],
      ["hardware", 2217, 2],
    ])
    // Shares are of the money, so they add up to the whole.
    const shares = categories.reduce((sum, c) => sum + c.share, 0)
    expect(shares).toBeCloseTo(1)
  })

  test("months run oldest first with undated receipts last", () => {
    const report = buildReport([
      makeSearchedReceipt({ purchasedOn: "2026-03-04", totalCents: 300 }),
      makeSearchedReceipt({ purchasedOn: null, totalCents: 100 }),
      makeSearchedReceipt({ purchasedOn: "2026-01-20", totalCents: 200, taxCents: 10 }),
      makeSearchedReceipt({ purchasedOn: "2026-01-02", totalCents: 50 }),
    ])

    expect(report.currencies[0].byMonth).toEqual([
      { month: "2026-01", label: "January 2026", receiptCount: 2, totalCents: 250, taxCents: 10 },
      { month: "2026-03", label: "March 2026", receiptCount: 1, totalCents: 300, taxCents: 0 },
      { month: null, label: "No date", receiptCount: 1, totalCents: 100, taxCents: 0 },
    ])
    expect(report.undatedCount).toBe(1)
    expect(report.firstDate).toBe("2026-01-02")
    expect(report.lastDate).toBe("2026-03-04")
  })

  test("an empty report has no currencies", () => {
    const report = buildReport([])
    expect(report.currencies).toEqual([])
    expect(formatCurrencyTotals(report)).toBe("$0.00")
  })
})

describe("category helpers", () => {
  test("an unsplit receipt is wholly its one category", () => {
    const receipt = makeSearchedReceipt({ receiptType: "fuel", totalCents: 900 })
    expect(categoryShares(receipt)).toEqual([{ type: "fuel", amountCents: 900 }])
    expect(categoryLabel(receipt)).toBe("Fuel & Transport")
  })

  test("a split receipt lists every category", () => {
    const receipt = makeSearchedReceipt({
      splits: [
        { type: "grocery", amountCents: 100 },
        { type: "office", amountCents: 50 },
      ],
      totalCents: 150,
    })
    expect(categoryLabel(receipt)).toBe("Grocery + Office & Software")
  })
})

describe("labels and file names", () => {
  test("describePeriod", () => {
    expect(describePeriod("2026-01-01", "2026-03-31")).toBe(
      "Jan 1, 2026 – Mar 31, 2026"
    )
    expect(describePeriod("2026-01-01")).toBe("Since Jan 1, 2026")
    expect(describePeriod(undefined, "2026-01-01")).toBe("Through Jan 1, 2026")
    expect(describePeriod()).toBe("All dates")
  })

  test("monthLabel", () => {
    expect(monthLabel("2026-09")).toBe("September 2026")
    expect(monthLabel(null)).toBe("No date")
  })

  test("exportBaseName", () => {
    expect(exportBaseName("2026-01-01", "2026-03-31")).toBe(
      "receipts-2026-01-01-to-2026-03-31"
    )
    expect(exportBaseName()).toBe("receipts-all-dates")
  })
})

describe("periodPresets", () => {
  const presets = periodPresets("2026-02-15")
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]))

  test("month, quarter and year ranges, including across a year boundary", () => {
    expect(byId["this-month"]).toMatchObject({ from: "2026-02-01", to: "2026-02-28" })
    expect(byId["last-month"]).toMatchObject({ from: "2026-01-01", to: "2026-01-31" })
    expect(byId["this-quarter"]).toMatchObject({ from: "2026-01-01", to: "2026-03-31" })
    expect(byId["last-quarter"]).toMatchObject({ from: "2025-10-01", to: "2025-12-31" })
    expect(byId["last-year"]).toMatchObject({ from: "2025-01-01", to: "2025-12-31" })
    expect(byId.all.from).toBeUndefined()
  })

  test("last month from January is December of the year before", () => {
    const jan = periodPresets("2026-01-10").find((p) => p.id === "last-month")
    expect(jan).toMatchObject({ from: "2025-12-01", to: "2025-12-31" })
  })

  test("matchingPreset finds the chip for the current dates", () => {
    expect(matchingPreset(presets, "2026-01-01", "2026-12-31")?.id).toBe(
      "this-year"
    )
    expect(matchingPreset(presets)?.id).toBe("all")
    expect(matchingPreset(presets, "2026-01-05", "2026-01-06")).toBeUndefined()
  })
})
