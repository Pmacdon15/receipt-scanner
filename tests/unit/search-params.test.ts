import { describe, expect, test } from "bun:test"

import type { ReceiptSearchParams } from "@/lib/dal/receipts"
import {
  formValue,
  hasActiveFilters,
  parseSearchParams,
  searchHref,
  toggleType,
} from "@/lib/search-params"

const EMPTY: ReceiptSearchParams = { scope: "mine" }

describe("parseSearchParams", () => {
  test("defaults to the user's own receipts with no filters", () => {
    expect(parseSearchParams({})).toEqual({
      scope: "mine",
      query: undefined,
      receiptTypes: undefined,
      purchasedFrom: undefined,
      purchasedTo: undefined,
      minTotalCents: undefined,
      maxTotalCents: undefined,
      sort: undefined,
      page: undefined,
    })
  })

  test("reads every supported filter", () => {
    expect(
      parseSearchParams({
        scope: "org",
        q: "  coffee  ",
        type: ["grocery", "fuel"],
        from: "2025-01-01",
        to: "2025-12-31",
        min: "5",
        max: "$1,000.50",
        sort: "highest",
        page: "3",
      })
    ).toEqual({
      scope: "org",
      query: "coffee",
      receiptTypes: ["grocery", "fuel"],
      purchasedFrom: "2025-01-01",
      purchasedTo: "2025-12-31",
      minTotalCents: 500,
      maxTotalCents: 100050,
      sort: "highest",
      page: 3,
    })
  })

  test("accepts comma-separated types, dropping unknown ones and duplicates", () => {
    expect(
      parseSearchParams({ type: ["grocery,fuel", "bogus", "fuel"] })
        .receiptTypes
    ).toEqual(["grocery", "fuel"])
    expect(parseSearchParams({ type: "bogus" }).receiptTypes).toBeUndefined()
  })

  test("treats any scope other than org as mine", () => {
    expect(parseSearchParams({ scope: "everyone" }).scope).toBe("mine")
  })

  test("caps the query at 200 characters", () => {
    expect(parseSearchParams({ q: "x".repeat(500) }).query).toHaveLength(200)
  })

  test("uses the first value when a single-value param repeats", () => {
    expect(parseSearchParams({ q: ["first", "second"] }).query).toBe("first")
  })

  test.each([["2025-1-01"], ["01/02/2025"], ["2025-13-45"], ["yesterday"]])(
    "drops the malformed date %p",
    (from) => {
      expect(parseSearchParams({ from }).purchasedFrom).toBeUndefined()
    }
  )

  test("drops negative or unparseable amounts", () => {
    const parsed = parseSearchParams({ min: "-5", max: "lots" })
    expect(parsed.minTotalCents).toBeUndefined()
    expect(parsed.maxTotalCents).toBeUndefined()
  })

  test("drops an unknown sort and page numbers of 1 or less", () => {
    expect(parseSearchParams({ sort: "random" }).sort).toBeUndefined()
    expect(parseSearchParams({ page: "1" }).page).toBeUndefined()
    expect(parseSearchParams({ page: "0" }).page).toBeUndefined()
    expect(parseSearchParams({ page: "abc" }).page).toBeUndefined()
  })
})

describe("searchHref", () => {
  test("returns the bare path with no filters", () => {
    expect(searchHref(EMPTY)).toBe("/search")
  })

  test("leaves the default sort and first page out of the URL", () => {
    expect(searchHref({ ...EMPTY, sort: "newest", page: 1 })).toBe("/search")
  })

  test("serialises every filter", () => {
    const href = searchHref({
      scope: "org",
      query: "gas & go",
      receiptTypes: ["fuel", "travel"],
      purchasedFrom: "2025-01-01",
      purchasedTo: "2025-02-01",
      minTotalCents: 500,
      maxTotalCents: 12345,
      sort: "lowest",
    })
    expect(href).toBe(
      "/search?scope=org&q=gas+%26+go&type=fuel&type=travel&from=2025-01-01&to=2025-02-01&min=5.00&max=123.45&sort=lowest"
    )
  })

  test("resets to page 1 when anything but the page changes", () => {
    const current = { ...EMPTY, page: 4 }
    expect(searchHref(current, { query: "tea" })).toBe("/search?q=tea")
    expect(searchHref(current, { page: 5 })).toBe("/search?page=5")
  })

  test("round-trips through parseSearchParams", () => {
    const params: ReceiptSearchParams = {
      scope: "org",
      query: "hardware",
      receiptTypes: ["hardware"],
      purchasedFrom: "2025-05-01",
      minTotalCents: 1999,
      sort: "oldest",
      page: 2,
    }
    const url = new URL(searchHref(params, { page: 2 }), "http://x")
    const raw: Record<string, string[]> = {}
    for (const [key, value] of url.searchParams) {
      ;(raw[key] ??= []).push(value)
    }
    expect(parseSearchParams(raw)).toEqual({
      purchasedTo: undefined,
      maxTotalCents: undefined,
      ...params,
    })
  })
})

describe("toggleType", () => {
  test("adds a type that is not selected", () => {
    expect(toggleType(EMPTY, "grocery")).toEqual(["grocery"])
  })

  test("removes a type that is selected", () => {
    expect(
      toggleType({ ...EMPTY, receiptTypes: ["grocery", "fuel"] }, "grocery")
    ).toEqual(["fuel"])
  })

  test("returns undefined when the last type is removed", () => {
    expect(
      toggleType({ ...EMPTY, receiptTypes: ["grocery"] }, "grocery")
    ).toBeUndefined()
  })
})

describe("hasActiveFilters", () => {
  test("is false for scope, sort and page alone", () => {
    expect(hasActiveFilters({ scope: "org", sort: "highest", page: 3 })).toBe(
      false
    )
  })

  test.each<[string, Partial<ReceiptSearchParams>]>([
    ["query", { query: "x" }],
    ["types", { receiptTypes: ["fuel"] }],
    ["from", { purchasedFrom: "2025-01-01" }],
    ["to", { purchasedTo: "2025-01-01" }],
    ["a zero minimum", { minTotalCents: 0 }],
    ["a zero maximum", { maxTotalCents: 0 }],
  ])("is true with %s", (_, filter) => {
    expect(hasActiveFilters({ ...EMPTY, ...filter })).toBe(true)
  })

  test("is false for an empty type list", () => {
    expect(hasActiveFilters({ ...EMPTY, receiptTypes: [] })).toBe(false)
  })
})

describe("formValue", () => {
  test("fills blanks and the default sort", () => {
    expect(formValue(EMPTY)).toEqual({
      q: "",
      from: "",
      to: "",
      min: "",
      max: "",
      sort: "newest",
    })
  })

  test("shows amounts in dollars", () => {
    expect(
      formValue({ ...EMPTY, minTotalCents: 0, maxTotalCents: 2550 })
    ).toMatchObject({ min: "0.00", max: "25.50" })
  })
})
