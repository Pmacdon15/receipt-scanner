import { describe, expect, test } from "bun:test"

import { formatDate, formatMoney, parseMoneyToCents } from "@/lib/money"

describe("parseMoneyToCents", () => {
  test.each([
    ["12.34", 1234],
    ["12", 1200],
    ["0", 0],
    ["$1,234.56", 123456],
    [" 7.5 ", 750],
    ["CA$ 3.99", 399],
    ["-4.20", -420],
    ["0.005", 1],
  ])("parses %p as %p cents", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected)
  })

  test("rounds to the nearest cent instead of truncating float error", () => {
    // 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseMoneyToCents("1.15")).toBe(115)
  })

  test.each([[""], ["   "], ["-"], ["abc"], ["1.2.3"], ["--5"]])(
    "returns null for %p",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull()
    }
  )

  test("returns null for missing or non-string form values", () => {
    expect(parseMoneyToCents(null)).toBeNull()
    expect(parseMoneyToCents(new File(["1"], "x.txt"))).toBeNull()
  })
})

describe("formatMoney", () => {
  test("formats cents as Canadian dollars by default", () => {
    expect(formatMoney(123456)).toBe("$1,234.56")
    expect(formatMoney(0)).toBe("$0.00")
  })

  test("respects another currency", () => {
    expect(formatMoney(500, "USD")).toBe("US$5.00")
  })
})

describe("formatDate", () => {
  test("formats an ISO date in UTC so it never shifts a day", () => {
    expect(formatDate("2025-03-01")).toBe("Mar 1, 2025")
  })

  test("says No date for empty or invalid values", () => {
    expect(formatDate(null)).toBe("No date")
    expect(formatDate("")).toBe("No date")
    expect(formatDate("not a date")).toBe("No date")
  })
})
