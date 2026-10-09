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
  deleteReceiptAction,
  type ScanFormState,
  scanReceiptAction,
  setReceiptTypeAction,
  suggestReceiptTypeAction,
} from "@/app/actions/receipts"
import { getReceipts } from "@/lib/dal/receipts"
import { newReceiptImagePathname } from "@/lib/receipt-image"
import { blob, resetBlob } from "../helpers/blob-mock"
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
  resetBlob()
  await testDb.reset()
})

const IDLE: ScanFormState = { status: "idle", message: "", fieldErrors: {} }

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe("scanReceiptAction", () => {
  test("saves a valid receipt end to end and expires the user's cache tags", async () => {
    signIn("user_a")

    const state = await scanReceiptAction(
      IDLE,
      form({
        merchant: "  Home Depot  ",
        total: "$113.00",
        subtotal: "100",
        tax: "13",
        purchasedOn: "2025-04-01",
        notes: " deck screws ",
        rawText: "",
        receiptType: "",
      })
    )

    expect(state).toEqual({
      status: "success",
      message: "Saved Home Depot.",
      fieldErrors: {},
    })
    const [saved] = await getReceipts()
    expect(fake.updatedTags).toEqual([
      "receipts:user:user_a",
      `receipt:${saved.id}`,
    ])

    expect(saved).toMatchObject({
      merchant: "Home Depot",
      totalCents: 11300,
      subtotalCents: 10000,
      taxCents: 1300,
      purchasedOn: "2025-04-01",
      currency: "CAD",
      notes: "deck screws",
      receiptType: "hardware",
      typeSource: "auto",
    })
  })

  test("blank optional fields are stored as null", async () => {
    signIn("user_a")
    await scanReceiptAction(
      IDLE,
      form({
        merchant: "Shop",
        total: "1",
        purchasedOn: " ",
        notes: "",
        rawText: "",
      })
    )

    const [saved] = await getReceipts()
    expect(saved).toMatchObject({
      purchasedOn: null,
      notes: null,
      subtotalCents: null,
      taxCents: null,
    })
  })

  test("an explicit type is saved as user-picked", async () => {
    signIn("user_a")
    await scanReceiptAction(
      IDLE,
      form({ merchant: "Shell", total: "50", receiptType: "travel" })
    )

    const [saved] = await getReceipts()
    expect(saved).toMatchObject({ receiptType: "travel", typeSource: "user" })
  })

  test("reports every invalid field at once and saves nothing", async () => {
    signIn("user_a")
    const state = await scanReceiptAction(
      IDLE,
      form({ merchant: "   ", total: "", receiptType: "snacks" })
    )

    expect(state).toEqual({
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors: {
        merchant: "Enter where the receipt is from.",
        total: "Enter the receipt total.",
        receiptType: "Pick a type from the list.",
      },
    })
    expect(await getReceipts()).toEqual([])
    expect(fake.updatedTags).toEqual([])
  })

  test("rejects an overlong merchant and a negative total", async () => {
    signIn("user_a")
    const state = await scanReceiptAction(
      IDLE,
      form({ merchant: "x".repeat(201), total: "-1" })
    )

    expect(state.fieldErrors).toEqual({
      merchant: "Keep the merchant name under 200 characters.",
      total: "The total cannot be negative.",
    })
  })

  test("asks a signed-out user to sign in", async () => {
    const state = await scanReceiptAction(
      IDLE,
      form({ merchant: "Shop", total: "1" })
    )

    expect(state).toEqual({
      status: "error",
      message: "Sign in to save receipts.",
      fieldErrors: {},
    })
  })

  test("hides unexpected errors behind a generic message", async () => {
    signIn("user_a")
    const log = spyOn(console, "error").mockImplementation(() => {})
    const db = fake.db
    fake.db = null

    try {
      const state = await scanReceiptAction(
        IDLE,
        form({ merchant: "Shop", total: "1" })
      )
      expect(state).toEqual({
        status: "error",
        message: "Something went wrong saving that. Try again.",
        fieldErrors: {},
      })
      expect(log).toHaveBeenCalled()
    } finally {
      fake.db = db
      log.mockRestore()
    }
  })

  test("attaches an uploaded photo pathname and sets hasImage", async () => {
    signIn("user_a")
    const pathname = newReceiptImagePathname("user_a")

    const result = await scanReceiptAction(
      IDLE,
      form({
        merchant: "Costco",
        total: "150.00",
        imagePathname: pathname,
      })
    )

    expect(result.status).toBe("success")
    const [saved] = await getReceipts()
    expect(saved.hasImage).toBe(true)
  })

  test("refuses to attach a photo belonging to another user", async () => {
    signIn("user_a")
    const otherUserPathname = newReceiptImagePathname("user_b")

    const result = await scanReceiptAction(
      IDLE,
      form({
        merchant: "Costco",
        total: "150.00",
        imagePathname: otherUserPathname,
      })
    )

    expect(result).toEqual({
      status: "error",
      message: "That photo could not be attached. Try scanning it again.",
      fieldErrors: { image: "That photo is not available to attach." },
    })
    expect(await getReceipts()).toEqual([])
  })
})

describe("setReceiptTypeAction", () => {
  async function saveOne() {
    signIn("user_a")
    await scanReceiptAction(IDLE, form({ merchant: "Shell", total: "50" }))
    const [saved] = await getReceipts()
    fake.updatedTags.length = 0
    return saved
  }

  test("changes the type", async () => {
    const saved = await saveOne()

    expect(await setReceiptTypeAction(saved.id, "travel")).toEqual({
      status: "success",
      message: "Type updated.",
    })
    expect((await getReceipts())[0].receiptType).toBe("travel")
    expect(fake.updatedTags).toEqual([
      "receipts:user:user_a",
      `receipt:${saved.id}`,
    ])
  })

  test("rejects an unknown type without touching the database", async () => {
    const saved = await saveOne()

    expect(await setReceiptTypeAction(saved.id, "snacks")).toEqual({
      status: "error",
      message: "Unknown receipt type.",
    })
    expect((await getReceipts())[0].receiptType).toBe("fuel")
  })

  test("says not found for someone else's receipt", async () => {
    const saved = await saveOne()
    signIn("user_b")

    expect(await setReceiptTypeAction(saved.id, "travel")).toEqual({
      status: "error",
      message: "Receipt not found.",
    })
  })

  test("asks a signed-out user to sign in", async () => {
    expect(
      await setReceiptTypeAction(crypto.randomUUID(), "fuel")
    ).toMatchObject({
      status: "error",
      message: "Sign in to save receipts.",
    })
  })
})

describe("deleteReceiptAction", () => {
  test("deletes the user's receipt, then reports it as not found", async () => {
    signIn("user_a")
    await scanReceiptAction(IDLE, form({ merchant: "Shop", total: "1" }))
    const [saved] = await getReceipts()

    expect(await deleteReceiptAction(saved.id)).toEqual({
      status: "success",
      message: "Receipt deleted.",
    })
    expect(await getReceipts()).toEqual([])
    expect(fake.updatedTags).toContain(`receipt:${saved.id}`)

    fake.updatedTags.length = 0
    expect(await deleteReceiptAction(saved.id)).toEqual({
      status: "error",
      message: "Receipt not found.",
    })
    // Nothing was deleted, so nothing is expired.
    expect(fake.updatedTags).toEqual([])
  })

  test("expires the organization's tag for a receipt saved into one", async () => {
    signIn("user_a", "org_1")
    await scanReceiptAction(IDLE, form({ merchant: "Shop", total: "1" }))
    const [saved] = await getReceipts()
    expect(fake.updatedTags).toEqual([
      "receipts:user:user_a",
      "receipts:org:org_1",
      `receipt:${saved.id}`,
    ])

    // Deleting it after switching away from the org still expires the org's
    // tag: the tags come from the deleted row, not the active session.
    signIn("user_a")
    fake.updatedTags.length = 0
    await deleteReceiptAction(saved.id)
    expect(fake.updatedTags).toEqual([
      "receipts:user:user_a",
      "receipts:org:org_1",
      `receipt:${saved.id}`,
    ])
  })

  test("deletes the photo and expires the user's and org's cached receipts", async () => {
    signIn("user_a", "org_1")
    const imagePathname = newReceiptImagePathname("user_a")
    await scanReceiptAction(
      IDLE,
      form({ merchant: "Shop", total: "1", imagePathname })
    )
    const [saved] = await getReceipts()
    fake.updatedTags.length = 0

    expect((await deleteReceiptAction(saved.id)).status).toBe("success")
    expect(blob.deleted).toEqual([imagePathname])
    expect(fake.updatedTags).toEqual([
      "receipts:user:user_a",
      "receipts:org:org_1",
      `receipt:${saved.id}`,
    ])
  })

  test("rejects a malformed id before touching anything", async () => {
    signIn("user_a")

    expect(await deleteReceiptAction("not-a-uuid")).toEqual({
      status: "error",
      message: "Receipt not found.",
    })
    expect(fake.updatedTags).toEqual([])
    expect(blob.deleted).toEqual([])
  })

  test("asks a signed-out caller to sign in", async () => {
    expect(await deleteReceiptAction(crypto.randomUUID())).toMatchObject({
      status: "error",
      message: "Sign in to save receipts.",
    })
  })

  test("cannot delete another user's receipt", async () => {
    signIn("user_a")
    await scanReceiptAction(IDLE, form({ merchant: "Shop", total: "1" }))
    const [saved] = await getReceipts()
    fake.updatedTags.length = 0

    signIn("user_b")
    expect((await deleteReceiptAction(saved.id)).status).toBe("error")
    expect(fake.updatedTags).toEqual([])

    signIn("user_a")
    expect(await getReceipts()).toHaveLength(1)
  })
})

describe("suggestReceiptTypeAction", () => {
  test("returns the detected type for a signed-in user", async () => {
    signIn("user_a")
    expect(
      await suggestReceiptTypeAction({ merchant: "Rexall" })
    ).toMatchObject({
      status: "success",
      type: "medical",
    })
  })

  test("asks a signed-out user to sign in", async () => {
    expect(
      await suggestReceiptTypeAction({ merchant: "Rexall" })
    ).toMatchObject({
      status: "error",
      message: "Sign in to save receipts.",
    })
  })
})
