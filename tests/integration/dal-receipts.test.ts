import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test"
import {
  createReceipt,
  getReceipt,
  getReceiptImage,
  getReceipts,
  getReceiptTotals,
  InvalidInputError,
  type NewReceipt,
  removeReceipt,
  searchReceipts,
  searchReceiptsWithSuggestions,
  setReceiptType,
  suggestReceiptType,
  UnauthorizedError,
} from "@/lib/dal/receipts"
import { newReceiptImagePathname } from "@/lib/receipt-image"
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

function newReceipt(overrides: Partial<NewReceipt> = {}): NewReceipt {
  return {
    merchant: "Corner Store",
    purchasedOn: "2025-01-15",
    currency: "CAD",
    subtotalCents: null,
    taxCents: null,
    totalCents: 1000,
    rawText: null,
    notes: null,
    ...overrides,
  }
}

describe("when signed out", () => {
  test.each([
    ["getReceipts", () => getReceipts()],
    ["getReceipt", () => getReceipt("00000000-0000-0000-0000-000000000000")],
    [
      "getReceiptImage",
      () => getReceiptImage("00000000-0000-0000-0000-000000000000"),
    ],
    ["getReceiptTotals", () => getReceiptTotals()],
    ["createReceipt", () => createReceipt(newReceipt())],
    ["setReceiptType", () => setReceiptType("x", "fuel")],
    ["removeReceipt", () => removeReceipt("x")],
    ["suggestReceiptType", () => suggestReceiptType({ merchant: "Shell" })],
    ["searchReceipts", () => searchReceipts({ scope: "mine" })],
  ])("%s refuses with UnauthorizedError", async (_, call) => {
    await expect(call()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe("createReceipt", () => {
  test("auto-detects the type and records the guess", async () => {
    signIn("user_a")
    const receipt = await createReceipt(
      newReceipt({ merchant: "Petro-Canada" })
    )

    expect(receipt).toMatchObject({
      userId: "user_a",
      orgId: null,
      merchant: "Petro-Canada",
      receiptType: "fuel",
      typeSource: "auto",
      detectedType: "fuel",
    })
    expect(receipt.detectedConfidence).toBeGreaterThan(0)
  })

  test("a type the user picked wins, and the detected guess is still kept", async () => {
    signIn("user_a")
    const receipt = await createReceipt(
      newReceipt({ merchant: "Petro-Canada", receiptType: "travel" })
    )

    expect(receipt).toMatchObject({
      receiptType: "travel",
      typeSource: "user",
      detectedType: "fuel",
    })
  })

  test("a split is filed under its largest category", async () => {
    signIn("user_a")
    const receipt = await createReceipt(
      newReceipt({
        merchant: "Costco",
        totalCents: 4217,
        splits: [
          { type: "hardware", amountCents: 1217 },
          { type: "grocery", amountCents: 3000 },
        ],
      })
    )

    expect(receipt).toMatchObject({
      receiptType: "grocery",
      typeSource: "user",
      splits: [
        { type: "hardware", amountCents: 1217 },
        { type: "grocery", amountCents: 3000 },
      ],
    })
  })

  test("refuses a split that does not add up to the total", async () => {
    signIn("user_a")
    await expect(
      createReceipt(
        newReceipt({
          totalCents: 4217,
          splits: [
            { type: "hardware", amountCents: 1000 },
            { type: "grocery", amountCents: 3000 },
          ],
        })
      )
    ).rejects.toBeInstanceOf(InvalidInputError)
  })

  test("a guess read from the photo beats keyword detection", async () => {
    signIn("user_a")
    const receipt = await createReceipt(
      newReceipt({
        merchant: "Petro-Canada",
        detected: { type: "travel", confidence: 0.9 },
      })
    )

    expect(receipt).toMatchObject({
      receiptType: "travel",
      typeSource: "auto",
      detectedType: "travel",
      detectedConfidence: 0.9,
    })
  })

  test("stores no detected type when detection finds nothing", async () => {
    signIn("user_a")
    const receipt = await createReceipt(newReceipt({ merchant: "Zzyzx Ltd" }))

    expect(receipt).toMatchObject({
      receiptType: "other",
      typeSource: "auto",
      detectedType: null,
      detectedConfidence: null,
    })
  })

  test("files the receipt under the active organization", async () => {
    signIn("user_a", "org_1")
    expect((await createReceipt(newReceipt())).orgId).toBe("org_1")
  })

  test("stores an owned photo and marks hasImage true", async () => {
    signIn("user_a")
    const pathname = newReceiptImagePathname("user_a")
    const receipt = await createReceipt(newReceipt({ imageUrl: pathname }))
    expect(receipt.hasImage).toBe(true)
    expect((receipt as Record<string, unknown>).imageUrl).toBeUndefined()
    expect(await getReceiptImage(receipt.id)).toBe(pathname)
  })

  test("refuses to store a photo belonging to another user", async () => {
    signIn("user_a")
    const otherPathname = newReceiptImagePathname("user_b")
    await expect(
      createReceipt(newReceipt({ imageUrl: otherPathname }))
    ).rejects.toBeInstanceOf(InvalidInputError)
  })
})

describe("reading and changing receipts", () => {
  test("users only ever see and change their own receipts", async () => {
    signIn("user_a")
    const mine = await createReceipt(newReceipt({ merchant: "Mine" }))

    signIn("user_b")
    await createReceipt(newReceipt({ merchant: "Theirs", totalCents: 5 }))
    expect(await getReceipt(mine.id)).toBeNull()
    expect(await setReceiptType(mine.id, "fuel")).toBeNull()
    expect(await removeReceipt(mine.id)).toBe(false)
    expect((await getReceipts()).map((r) => r.merchant)).toEqual(["Theirs"])

    signIn("user_a")
    expect((await getReceipt(mine.id))?.merchant).toBe("Mine")
    expect(await getReceiptTotals()).toEqual({
      receipt_count: 1,
      total_cents: 1000,
      type_count: 1,
    })
  })

  test("setReceiptType switches the type to user-picked", async () => {
    signIn("user_a")
    const created = await createReceipt(newReceipt({ merchant: "Shell" }))
    const updated = await setReceiptType(created.id, "travel")

    expect(updated).toMatchObject({ receiptType: "travel", typeSource: "user" })
  })

  test("removeReceipt deletes it", async () => {
    signIn("user_a")
    const created = await createReceipt(newReceipt())

    expect(await removeReceipt(created.id)).toBe(true)
    expect(await getReceipt(created.id)).toBeNull()
  })

  test("getReceipts can filter by type", async () => {
    signIn("user_a")
    await createReceipt(newReceipt({ merchant: "Shell" }))
    await createReceipt(newReceipt({ merchant: "Safeway" }))

    const fuel = await getReceipts({ receiptType: "fuel" })
    expect(fuel.map((r) => r.merchant)).toEqual(["Shell"])
  })

  test("unknown types in the database read back as other", async () => {
    signIn("user_a")
    const created = await createReceipt(newReceipt({ merchant: "Shell" }))
    await testDb.db.query(
      "update receipts set receipt_type = 'retired', detected_type = 'retired' where id = $1",
      [created.id]
    )

    expect(await getReceipt(created.id)).toMatchObject({
      receiptType: "other",
      detectedType: null,
    })
  })

  test("getReceiptImage scopes lookup to the signed-in owner", async () => {
    signIn("user_a")
    const pathname = newReceiptImagePathname("user_a")
    const mine = await createReceipt(newReceipt({ imageUrl: pathname }))

    signIn("user_b")
    expect(await getReceiptImage(mine.id)).toBeNull()

    signIn("user_a")
    expect(await getReceiptImage(mine.id)).toBe(pathname)
  })

  test("getReceiptImage lets teammates in the active organization see the photo", async () => {
    signIn("user_a", "org_1")
    const pathname = newReceiptImagePathname("user_a")
    const shared = await createReceipt(newReceipt({ imageUrl: pathname }))

    signIn("user_b", "org_1")
    expect(await getReceiptImage(shared.id)).toBe(pathname)

    // Another organization, or none active, still reads as missing.
    signIn("user_b", "org_2")
    expect(await getReceiptImage(shared.id)).toBeNull()
    signIn("user_b")
    expect(await getReceiptImage(shared.id)).toBeNull()
  })

  test("getReceiptImage returns null for invalid ids or receipts without image", async () => {
    signIn("user_a")
    const withoutPhoto = await createReceipt(newReceipt())
    expect(await getReceiptImage(withoutPhoto.id)).toBeNull()
    expect(await getReceiptImage("not-a-uuid")).toBeNull()
  })
})

describe("suggestReceiptType", () => {
  test("returns the classifier's guess for a signed-in user", async () => {
    signIn("user_a")
    expect((await suggestReceiptType({ merchant: "Starbucks" })).type).toBe(
      "restaurant"
    )
  })
})

describe("searchReceipts", () => {
  async function seed() {
    signIn("user_a", "org_1")
    await createReceipt(newReceipt({ merchant: "Shell", totalCents: 6000 }))
    signIn("user_b", "org_1")
    await createReceipt(newReceipt({ merchant: "Esso", totalCents: 3000 }))
    signIn("user_c", "org_1")
    await createReceipt(newReceipt({ merchant: "Husky", totalCents: 100 }))
    signIn("user_a", null)
    await createReceipt(newReceipt({ merchant: "Personal", totalCents: 50 }))
    fake.users.set("user_b", {
      id: "user_b",
      firstName: "Bea",
      lastName: "Lee",
    })
    fake.orgs.set("org_1", "Acme Co")
  }

  test("org scope shows teammates' receipts with who uploaded them", async () => {
    await seed()
    signIn("user_a", "org_1")

    const result = await searchReceipts({ scope: "org" })

    expect(result.scope).toBe("org")
    expect(result.org).toEqual({ id: "org_1", name: "Acme Co" })
    const byMerchant = Object.fromEntries(
      result.receipts.map((r) => [r.merchant, [r.isMine, r.uploadedBy]])
    )
    expect(byMerchant).toEqual({
      Shell: [true, "You"],
      Esso: [false, "Bea Lee"],
      // Clerk returned no record for user_c.
      Husky: [false, "A teammate"],
    })
  })

  test("org scope falls back to mine when no organization is active", async () => {
    await seed()
    signIn("user_a", null)

    const result = await searchReceipts({ scope: "org" })

    expect(result.scope).toBe("mine")
    expect(result.org).toBeNull()
    expect(result.receipts.map((r) => r.merchant).sort()).toEqual([
      "Personal",
      "Shell",
    ])
    expect(
      result.receipts.every((r) => r.isMine && r.uploadedBy === "You")
    ).toBe(true)
  })

  test("a Clerk outage degrades names instead of failing the search", async () => {
    await seed()
    signIn("user_a", "org_1")
    fake.clerkDown = true
    const log = spyOn(console, "error").mockImplementation(() => {})

    try {
      const result = await searchReceipts({ scope: "org" })
      expect(result.org).toEqual({ id: "org_1", name: "Your organization" })
      expect(
        result.receipts.find((r) => r.merchant === "Esso")?.uploadedBy
      ).toBe("A teammate")
    } finally {
      log.mockRestore()
    }
  })

  test("uploader names fall back from full name to username to email", async () => {
    signIn("user_b", "org_1")
    await createReceipt(newReceipt({ merchant: "By username" }))
    signIn("user_c", "org_1")
    await createReceipt(newReceipt({ merchant: "By email" }))
    fake.users.set("user_b", { id: "user_b", username: "bea" })
    fake.users.set("user_c", { id: "user_c", email: "cal@example.com" })
    fake.orgs.set("org_1", "Acme Co")

    signIn("user_a", "org_1")
    const result = await searchReceipts({ scope: "org" })
    const names = Object.fromEntries(
      result.receipts.map((r) => [r.merchant, r.uploadedBy])
    )
    expect(names).toEqual({
      "By username": "bea",
      "By email": "cal@example.com",
    })
  })

  test("pages results and reports the page count", async () => {
    signIn("user_a")
    for (let i = 0; i < 5; i++) {
      await createReceipt(newReceipt({ merchant: `R${i}`, totalCents: i }))
    }

    const result = await searchReceipts({ scope: "mine", pageSize: 2, page: 3 })
    expect(result).toMatchObject({
      page: 3,
      pageSize: 2,
      pageCount: 3,
      matchCount: 5,
    })
    expect(result.receipts).toHaveLength(1)
  })

  test("clamps page size and page number to sane bounds", async () => {
    signIn("user_a")
    const big = await searchReceipts({
      scope: "mine",
      pageSize: 5000,
      page: -2,
    })
    expect(big).toMatchObject({ pageSize: 100, page: 1, pageCount: 1 })

    const odd = await searchReceipts({
      scope: "mine",
      pageSize: Number.NaN,
      page: 2.7,
    })
    expect(odd).toMatchObject({ pageSize: 25, page: 2 })
  })
})

describe("searchReceiptsWithSuggestions", () => {
  async function seed() {
    signIn("user_a", "org_1")
    await createReceipt(newReceipt({ merchant: "Costco", totalCents: 8000 }))
    await createReceipt(newReceipt({ merchant: "Costco Gas", totalCents: 50 }))
    signIn("user_b", "org_1")
    await createReceipt(newReceipt({ merchant: "Costa Coffee" }))
    signIn("user_b", null)
    await createReceipt(newReceipt({ merchant: "Costume Shop" }))
  }

  test("refuses a signed-out caller", async () => {
    signIn(null)
    await expect(
      searchReceiptsWithSuggestions({ scope: "mine", query: "cost" })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  test("returns the same results as searchReceipts plus merchant suggestions", async () => {
    await seed()
    signIn("user_a", "org_1")
    const params = { scope: "mine" as const, query: "cost" }

    const result = await searchReceiptsWithSuggestions(params)
    const { suggestions, ...results } = result

    expect(results).toEqual(await searchReceipts(params))
    expect(suggestions).toEqual([
      { merchant: "Costco", receiptCount: 1 },
      { merchant: "Costco Gas", receiptCount: 1 },
    ])
  })

  test("org scope suggests teammates' merchants, never another org's", async () => {
    await seed()
    signIn("user_a", "org_1")

    const result = await searchReceiptsWithSuggestions({
      scope: "org",
      query: "cost",
    })

    expect(result.scope).toBe("org")
    expect(result.suggestions.map((s) => s.merchant).sort()).toEqual([
      "Costa Coffee",
      "Costco",
      "Costco Gas",
    ])
  })

  test("org scope falls back to mine when no organization is active", async () => {
    await seed()
    signIn("user_b", null)

    const result = await searchReceiptsWithSuggestions({
      scope: "org",
      query: "cost",
    })

    expect(result.scope).toBe("mine")
    expect(result.suggestions.map((s) => s.merchant).sort()).toEqual([
      "Costa Coffee",
      "Costume Shop",
    ])
  })

  test("has no suggestions without a query", async () => {
    await seed()
    signIn("user_a", "org_1")
    const result = await searchReceiptsWithSuggestions({ scope: "mine" })
    expect(result.suggestions).toEqual([])
    expect(result.matchCount).toBe(2)
  })
})
