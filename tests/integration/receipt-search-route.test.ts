import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test"
import type { NextRequest } from "next/server"
import { GET } from "@/app/api/receipts/search/route"
import type { ReceiptSearchWithSuggestions } from "@/lib/dal/receipts"
import { type InsertReceiptInput, insertReceipt } from "@/lib/db/receipts"
import { searchApiHref } from "@/lib/search-params"
import { fake, resetFakes, signIn } from "../helpers/server-mocks"
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

beforeEach(async () => {
  resetFakes()
  await testDb.reset()
})

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

function get(path: string) {
  return GET(new Request(`http://localhost${path}`) as unknown as NextRequest)
}

describe("GET /api/receipts/search", () => {
  test("refuses a signed-out caller with 401 and no data", async () => {
    await insertReceipt("user_a", receipt({ merchant: "Costco" }))
    signIn(null)

    const response = await get("/api/receipts/search?q=cost")

    expect(response.status).toBe(401)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toEqual({
      error: "Sign in to search receipts.",
    })
  })

  test("returns the caller's matching receipts and merchant suggestions", async () => {
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Costco", receiptType: "grocery", totalCents: 8000 })
    )
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Costco Gas", receiptType: "fuel", totalCents: 50 })
    )
    await insertReceipt("user_b", receipt({ merchant: "Costco" }))
    signIn("user_a")

    const response = await get(
      searchApiHref({ scope: "mine", query: "cost", receiptTypes: ["fuel"] })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    const body = (await response.json()) as ReceiptSearchWithSuggestions
    expect(body.receipts.map((r) => r.merchant)).toEqual(["Costco Gas"])
    expect(body.matchCount).toBe(1)
    expect(body.matchTotalCents).toBe(50)
    // Suggestions cover the query in this scope, whatever the type filter.
    expect(body.suggestions).toEqual([
      { merchant: "Costco", receiptCount: 1 },
      { merchant: "Costco Gas", receiptCount: 1 },
    ])
  })

  test("parses the query string like the page does, ignoring junk", async () => {
    await insertReceipt("user_a", receipt({ merchant: "Shell" }))
    signIn("user_a")

    const response = await get(
      "/api/receipts/search?scope=everyone&type=bogus&from=yesterday&page=abc&sort=random"
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as ReceiptSearchWithSuggestions
    expect(body.scope).toBe("mine")
    expect(body.page).toBe(1)
    expect(body.matchCount).toBe(1)
    expect(body.suggestions).toEqual([])
  })

  test("reports a database failure as 500 without leaking details", async () => {
    signIn("user_a")
    const errorLog = spyOn(console, "error").mockImplementation(() => {})
    const saved = fake.db
    fake.db = null

    try {
      const response = await get("/api/receipts/search?q=x")
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: "Search is not available right now. Try again.",
      })
      expect(errorLog).toHaveBeenCalled()
    } finally {
      fake.db = saved
      errorLog.mockRestore()
    }
  })
})
