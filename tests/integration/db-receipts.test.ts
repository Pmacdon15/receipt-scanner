import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import {
  deleteReceipt,
  type InsertReceiptInput,
  insertReceipt,
  searchReceipts,
  searchTerms,
  selectMerchantSuggestions,
  selectReceiptById,
  selectReceipts,
  selectReceiptTotals,
  updateReceiptType,
} from "@/lib/db/receipts"
import { fake } from "../helpers/server-mocks"
import { createTestDb, type TestDb } from "../helpers/test-db"

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb()
  fake.db = testDb
})

afterAll(async () => {
  fake.db = null
  await testDb.close()
})

beforeEach(() => testDb.reset())

function receipt(
  overrides: Partial<InsertReceiptInput> = {}
): InsertReceiptInput {
  return {
    orgId: null,
    merchant: "Corner Store",
    purchasedOn: "2025-01-15",
    currency: "CAD",
    subtotalCents: null,
    taxCents: null,
    totalCents: 1000,
    receiptType: "other",
    typeSource: "auto",
    detectedType: null,
    detectedConfidence: null,
    splits: null,
    rawText: null,
    imageUrl: null,
    notes: null,
    ...overrides,
  }
}

describe("insertReceipt", () => {
  test("stores every field and returns the saved row", async () => {
    const row = await insertReceipt("user_a", {
      orgId: "org_1",
      merchant: "Safeway",
      purchasedOn: "2025-03-02",
      currency: "CAD",
      subtotalCents: 1000,
      taxCents: 50,
      totalCents: 1050,
      receiptType: "grocery",
      typeSource: "user",
      detectedType: "grocery",
      detectedConfidence: 0.76,
      splits: null,
      rawText: "milk eggs",
      imageUrl: null,
      notes: "weekly shop",
    })

    expect(row).toMatchObject({
      user_id: "user_a",
      org_id: "org_1",
      merchant: "Safeway",
      purchased_on: "2025-03-02",
      currency: "CAD",
      subtotal_cents: 1000,
      tax_cents: 50,
      total_cents: 1050,
      receipt_type: "grocery",
      type_source: "user",
      detected_type: "grocery",
      raw_text: "milk eggs",
      notes: "weekly shop",
      has_image: false,
    })
    expect(row.detected_confidence).toBeCloseTo(0.76)
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof row.created_at).toBe("string")
  })

  test("the schema rejects an out-of-range confidence", async () => {
    await expect(
      insertReceipt("user_a", receipt({ detectedConfidence: 1.5 }))
    ).rejects.toThrow()
  })

  test("the schema rejects an unknown type source", async () => {
    await expect(
      insertReceipt(
        "user_a",
        receipt({ typeSource: "robot" as InsertReceiptInput["typeSource"] })
      )
    ).rejects.toThrow()
  })

  test("stores an image_url and returns has_image true", async () => {
    const row = await insertReceipt(
      "user_a",
      receipt({ imageUrl: "receipts/user_a/test-uuid.jpg" })
    )

    expect(row.has_image).toBe(true)

    const full = await selectReceiptById("user_a", row.id)
    expect(full?.image_url).toBe("receipts/user_a/test-uuid.jpg")
  })
})

describe("selectReceipts", () => {
  test("returns only the user's receipts, newest purchase first, undated last", async () => {
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Old", purchasedOn: "2024-01-01" })
    )
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Undated", purchasedOn: null })
    )
    await insertReceipt(
      "user_a",
      receipt({ merchant: "New", purchasedOn: "2025-06-01" })
    )
    await insertReceipt("user_b", receipt({ merchant: "Not mine" }))

    const rows = await selectReceipts("user_a")
    expect(rows.map((r) => r.merchant)).toEqual(["New", "Old", "Undated"])
  })

  test("filters by type and honours the limit", async () => {
    await insertReceipt(
      "user_a",
      receipt({ receiptType: "fuel", purchasedOn: "2025-01-01" })
    )
    await insertReceipt(
      "user_a",
      receipt({ receiptType: "fuel", purchasedOn: "2025-01-02" })
    )
    await insertReceipt("user_a", receipt({ receiptType: "grocery" }))

    expect(
      await selectReceipts("user_a", { receiptType: "fuel" })
    ).toHaveLength(2)
    expect(await selectReceipts("user_a", { limit: 1 })).toHaveLength(1)
  })
})

describe("single-receipt operations are scoped to the owner", () => {
  test("selectReceiptById", async () => {
    const row = await insertReceipt("user_a", receipt())

    expect((await selectReceiptById("user_a", row.id))?.id).toBe(row.id)
    expect(await selectReceiptById("user_b", row.id)).toBeNull()
  })

  test("updateReceiptType marks the type as user-picked", async () => {
    const row = await insertReceipt("user_a", receipt({ typeSource: "auto" }))

    expect(await updateReceiptType("user_b", row.id, "travel")).toBeNull()

    const updated = await updateReceiptType("user_a", row.id, "travel")
    expect(updated).toMatchObject({
      receipt_type: "travel",
      type_source: "user",
    })
  })

  test("deleteReceipt", async () => {
    const row = await insertReceipt("user_a", receipt())

    expect(await deleteReceipt("user_b", row.id)).toBe(false)
    expect(await deleteReceipt("user_a", row.id)).toBe(true)
    expect(await deleteReceipt("user_a", row.id)).toBe(false)
    expect(await selectReceiptById("user_a", row.id)).toBeNull()
  })
})

describe("selectReceiptTotals", () => {
  test("is all zeros for a user with no receipts", async () => {
    expect(await selectReceiptTotals("nobody")).toEqual({
      receipt_count: 0,
      total_cents: 0,
      type_count: 0,
    })
  })

  test("counts receipts, sums totals and counts distinct types", async () => {
    await insertReceipt(
      "user_a",
      receipt({ totalCents: 1000, receiptType: "fuel" })
    )
    await insertReceipt(
      "user_a",
      receipt({ totalCents: 250, receiptType: "fuel" })
    )
    await insertReceipt(
      "user_a",
      receipt({ totalCents: 99, receiptType: "grocery" })
    )
    await insertReceipt("user_b", receipt({ totalCents: 5000 }))

    expect(await selectReceiptTotals("user_a")).toEqual({
      receipt_count: 3,
      total_cents: 1349,
      type_count: 2,
    })
  })
})

describe("searchReceipts", () => {
  beforeEach(async () => {
    await insertReceipt(
      "user_a",
      receipt({
        merchant: "Safeway",
        receiptType: "grocery",
        totalCents: 4200,
        purchasedOn: "2025-01-10",
        notes: "weekly shop",
      })
    )
    await insertReceipt(
      "user_a",
      receipt({
        merchant: "Shell",
        receiptType: "fuel",
        totalCents: 6000,
        purchasedOn: "2025-02-10",
        orgId: "org_1",
      })
    )
    await insertReceipt(
      "user_a",
      receipt({
        merchant: "Starbucks",
        receiptType: "restaurant",
        totalCents: 575,
        purchasedOn: "2025-03-10",
        rawText: "latte 100%_off",
      })
    )
    await insertReceipt(
      "user_b",
      receipt({
        merchant: "Esso",
        receiptType: "fuel",
        totalCents: 3000,
        purchasedOn: "2025-02-20",
        orgId: "org_1",
      })
    )
    await insertReceipt(
      "user_b",
      receipt({
        merchant: "Private",
        receiptType: "fuel",
        totalCents: 100,
        purchasedOn: "2025-02-21",
      })
    )
  })

  const mine = { kind: "user", userId: "user_a" } as const
  const org = { kind: "org", orgId: "org_1" } as const

  test("a user scope covers everything the user saved, in any org", async () => {
    const result = await searchReceipts(mine)

    expect(result.rows.map((r) => r.merchant)).toEqual([
      "Starbucks",
      "Shell",
      "Safeway",
    ])
    expect(result.matchCount).toBe(3)
    expect(result.matchTotalCents).toBe(10775)
  })

  test("an org scope covers every member's receipts in that org only", async () => {
    const result = await searchReceipts(org)
    expect(result.rows.map((r) => r.merchant).sort()).toEqual(["Esso", "Shell"])
  })

  test("matches the query against merchant, notes and raw text, case-insensitively", async () => {
    expect((await searchReceipts(mine, { query: "SAFE" })).matchCount).toBe(1)
    expect((await searchReceipts(mine, { query: "weekly" })).matchCount).toBe(1)
    expect((await searchReceipts(mine, { query: "latte" })).matchCount).toBe(1)
    expect((await searchReceipts(mine, { query: "   " })).matchCount).toBe(3)
  })

  test("treats LIKE wildcards in the query literally", async () => {
    expect(
      (await searchReceipts(mine, { query: "%" })).rows.map((r) => r.merchant)
    ).toEqual(["Starbucks"])
    expect(
      (await searchReceipts(mine, { query: "_" })).rows.map((r) => r.merchant)
    ).toEqual(["Starbucks"])
    expect((await searchReceipts(mine, { query: "S%y" })).matchCount).toBe(0)
  })

  test("is safe against SQL in the query", async () => {
    const result = await searchReceipts(mine, {
      query: "'; drop table receipts; --",
    })
    expect(result.matchCount).toBe(0)
    expect((await searchReceipts(mine)).matchCount).toBe(3)
  })

  test("filters by type, date range and amount range together", async () => {
    const result = await searchReceipts(mine, {
      receiptTypes: ["fuel", "grocery"],
      purchasedFrom: "2025-01-15",
      purchasedTo: "2025-12-31",
      minTotalCents: 5000,
      maxTotalCents: 6000,
    })
    expect(result.rows.map((r) => r.merchant)).toEqual(["Shell"])
  })

  test("date and amount bounds are inclusive", async () => {
    const result = await searchReceipts(mine, {
      purchasedFrom: "2025-01-10",
      purchasedTo: "2025-01-10",
      minTotalCents: 4200,
      maxTotalCents: 4200,
    })
    expect(result.matchCount).toBe(1)
  })

  test("type facets ignore the type filter but respect every other filter", async () => {
    const result = await searchReceipts(mine, {
      receiptTypes: ["fuel"],
      minTotalCents: 1000,
    })

    expect(result.matchCount).toBe(1)
    const facets = Object.fromEntries(
      result.typeFacets.map((f) => [
        f.receipt_type,
        [f.receipt_count, f.total_cents],
      ])
    )
    expect(facets).toEqual({ grocery: [1, 4200], fuel: [1, 6000] })
  })

  test.each([
    ["newest", ["Starbucks", "Shell", "Safeway"]],
    ["oldest", ["Safeway", "Shell", "Starbucks"]],
    ["highest", ["Shell", "Safeway", "Starbucks"]],
    ["lowest", ["Starbucks", "Safeway", "Shell"]],
  ] as const)("sorts %s", async (sort, expected) => {
    const result = await searchReceipts(mine, { sort })
    expect(result.rows.map((r) => r.merchant)).toEqual([...expected])
  })

  test("pages with limit and offset while counting every match", async () => {
    const page2 = await searchReceipts(mine, { limit: 2, offset: 2 })
    expect(page2.rows.map((r) => r.merchant)).toEqual(["Safeway"])
    expect(page2.matchCount).toBe(3)
  })

  test("clamps limit to 1..100 and offset to at least 0", async () => {
    expect((await searchReceipts(mine, { limit: 0 })).rows).toHaveLength(1)
    expect((await searchReceipts(mine, { limit: 1000 })).rows).toHaveLength(3)
    expect((await searchReceipts(mine, { offset: -5 })).rows).toHaveLength(3)
  })

  test("returns zeros when nothing matches", async () => {
    const result = await searchReceipts({ kind: "user", userId: "nobody" })
    expect(result).toEqual({
      rows: [],
      matchCount: 0,
      matchTotalCents: 0,
      typeFacets: [],
    })
  })
})

describe("searchReceipts with several words or an amount", () => {
  const mine = { kind: "user", userId: "user_a" } as const

  beforeEach(async () => {
    await insertReceipt(
      "user_a",
      receipt({
        merchant: "Costco Wholesale",
        totalCents: 8450,
        rawText: "KIRKLAND GAS 40.00L",
      })
    )
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Costco Gas", totalCents: 1250 })
    )
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Shell", totalCents: 1250, notes: "road trip" })
    )
  })

  test("every word has to match, in any field and any order", async () => {
    const both = await searchReceipts(mine, { query: "gas costco" })
    expect(both.rows.map((r) => r.merchant).sort()).toEqual([
      "Costco Gas",
      "Costco Wholesale",
    ])

    const narrow = await searchReceipts(mine, { query: "costco kirkland" })
    expect(narrow.rows.map((r) => r.merchant)).toEqual(["Costco Wholesale"])

    expect(
      (await searchReceipts(mine, { query: "costco trip" })).matchCount
    ).toBe(0)
  })

  test("an amount matches receipt totals", async () => {
    const result = await searchReceipts(mine, { query: "12.50" })
    expect(result.rows.map((r) => r.merchant).sort()).toEqual([
      "Costco Gas",
      "Shell",
    ])
    expect((await searchReceipts(mine, { query: "$84.5" })).matchCount).toBe(1)
  })

  test("an amount combines with words", async () => {
    const result = await searchReceipts(mine, { query: "shell 12.50" })
    expect(result.rows.map((r) => r.merchant)).toEqual(["Shell"])
  })

  test("a number too large for a total is just text, not an error", async () => {
    const result = await searchReceipts(mine, { query: "123456789012" })
    expect(result.matchCount).toBe(0)
  })
})

describe("searchTerms", () => {
  test("splits on whitespace and drops blanks", () => {
    expect(searchTerms("  costco   gas ")).toEqual(["costco", "gas"])
    expect(searchTerms("   ")).toEqual([])
    expect(searchTerms(undefined)).toEqual([])
  })

  test("keeps at most eight words", () => {
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8)
  })
})

describe("selectMerchantSuggestions", () => {
  const mine = { kind: "user", userId: "user_a" } as const
  const org = { kind: "org", orgId: "org_1" } as const

  beforeEach(async () => {
    for (const merchant of ["Costco", "COSTCO", "costco", "Costco Gas"]) {
      await insertReceipt("user_a", receipt({ merchant }))
    }
    await insertReceipt("user_a", receipt({ merchant: "Pharmasave Coast" }))
    await insertReceipt(
      "user_b",
      receipt({ merchant: "Costa Coffee", orgId: "org_1" })
    )
  })

  test("puts names that start with the text first, then the most used", async () => {
    const rows = await selectMerchantSuggestions(mine, "cost")
    expect(rows.map((r) => r.merchant.toLowerCase())).toEqual([
      "costco",
      "costco gas",
    ])
    expect(rows[0].receipt_count).toBe(3)

    const anywhere = await selectMerchantSuggestions(mine, "coast")
    expect(anywhere.map((r) => r.merchant)).toEqual(["Pharmasave Coast"])
  })

  test("folds case variants of one name into a single suggestion", async () => {
    const rows = await selectMerchantSuggestions(mine, "costco")
    expect(
      rows.filter((r) => r.merchant.toLowerCase() === "costco")
    ).toHaveLength(1)
  })

  test("stays inside the scope", async () => {
    expect(
      (await selectMerchantSuggestions(mine, "costa")).map((r) => r.merchant)
    ).toEqual([])
    expect(
      (await selectMerchantSuggestions(org, "cost")).map((r) => r.merchant)
    ).toEqual(["Costa Coffee"])
  })

  test("honours the limit and returns nothing for blank text", async () => {
    expect(await selectMerchantSuggestions(mine, "c", 1)).toHaveLength(1)
    expect(await selectMerchantSuggestions(mine, "   ")).toEqual([])
  })

  test("treats LIKE wildcards literally", async () => {
    expect(await selectMerchantSuggestions(mine, "%")).toEqual([])
  })
})

describe("split receipts", () => {
  const mine = { kind: "user", userId: "user_a" } as const

  const costcoRun = () =>
    receipt({
      merchant: "Costco",
      totalCents: 4217,
      receiptType: "grocery",
      typeSource: "user",
      splits: [
        { type: "grocery", amountCents: 3000 },
        { type: "hardware", amountCents: 1217 },
      ],
    })

  test("stores and returns the split", async () => {
    const row = await insertReceipt("user_a", costcoRun())
    expect(row.splits).toEqual([
      { type: "grocery", amountCents: 3000 },
      { type: "hardware", amountCents: 1217 },
    ])

    const [listed] = await selectReceipts("user_a")
    expect(listed.splits).toEqual(row.splits)
  })

  test("a receipt without a split reads back as null", async () => {
    const row = await insertReceipt("user_a", receipt())
    expect(row.splits).toBeNull()
  })

  test("the type filter matches any category in the split", async () => {
    await insertReceipt("user_a", costcoRun())
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Shell", receiptType: "fuel" })
    )

    const hardware = await searchReceipts(mine, { receiptTypes: ["hardware"] })
    expect(hardware.rows.map((r) => r.merchant)).toEqual(["Costco"])

    const grocery = await searchReceipts(mine, { receiptTypes: ["grocery"] })
    expect(grocery.rows.map((r) => r.merchant)).toEqual(["Costco"])
  })

  test("facets count each split category with its own share", async () => {
    await insertReceipt("user_a", costcoRun())
    await insertReceipt(
      "user_a",
      receipt({ receiptType: "grocery", totalCents: 500 })
    )

    const { typeFacets } = await searchReceipts(mine)
    const byType = Object.fromEntries(
      typeFacets.map((f) => [f.receipt_type, [f.receipt_count, f.total_cents]])
    )
    expect(byType).toEqual({ grocery: [2, 3500], hardware: [1, 1217] })
  })

  test("picking one type for the receipt clears the split", async () => {
    const row = await insertReceipt("user_a", costcoRun())
    const updated = await updateReceiptType("user_a", row.id, "office")
    expect(updated?.receipt_type).toBe("office")
    expect(updated?.splits).toBeNull()
  })
})
