import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"

import {
  extractReceiptAction,
  type ScanFormState,
  scanReceiptAction,
} from "@/app/actions/receipts"
import {
  FEATURES,
  ORG_SIZE_TIERS,
  RECEIPTS_PER_YEAR_TIERS,
  resolveLimit,
  startOfYear,
} from "@/lib/billing/plans"
import {
  type BillingContext,
  checkEntitlements,
  EntitlementError,
} from "@/lib/dal/entitlements"
import { newReceiptImagePathname } from "@/lib/receipt-image"
import { resetBlob } from "../helpers/blob-mock"
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

const FREE = [FEATURES.receipts500PerYear, FEATURES.orgSize1]
const PRO = [
  FEATURES.receipts2000PerYear,
  FEATURES.orgSize3,
  FEATURES.autoDetect,
]

function onPlan(features: string[]) {
  for (const feature of features) fake.features.add(feature)
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const save = () =>
  scanReceiptAction(IDLE, form({ merchant: "Shop", total: "1" }))

/** Inserts `count` receipts for the user, created at `createdAt`. */
async function seedReceipts(
  userId: string,
  count: number,
  createdAt = new Date().toISOString()
) {
  await testDb.db.query(
    `insert into receipts (user_id, merchant, total_cents, created_at)
     select $1::text, 'Seeded', 100, $3::timestamptz from generate_series(1, $2::int)`,
    [userId, count, createdAt]
  )
}

describe("resolveLimit", () => {
  test("picks the highest tier held, and falls back to the lowest", () => {
    const has = (held: string[]) => (f: string) => held.includes(f)

    expect(resolveLimit(RECEIPTS_PER_YEAR_TIERS, has(PRO))).toEqual({
      limit: 2000,
      isTop: true,
    })
    expect(resolveLimit(RECEIPTS_PER_YEAR_TIERS, has(FREE))).toEqual({
      limit: 500,
      isTop: false,
    })
    expect(resolveLimit(ORG_SIZE_TIERS, has([]))).toEqual({
      limit: 1,
      isTop: false,
    })
  })

  test("the year starts on January 1st UTC", () => {
    expect(startOfYear(new Date("2026-10-11T17:00:00Z"))).toBe(
      "2026-01-01T00:00:00.000Z"
    )
  })
})

describe("receipt limit", () => {
  test("a free user can save up to 500 receipts this year", async () => {
    signIn("user_a")
    onPlan(FREE)
    await seedReceipts("user_a", 499)

    expect((await save()).status).toBe("success")

    const blocked = await save()
    expect(blocked).toEqual({
      status: "error",
      message:
        "You've used all 500 receipt scans for this year. Upgrade to Pro for more.",
      fieldErrors: {},
      upgrade: true,
    })
  })

  test("receipts from last year do not count", async () => {
    signIn("user_a")
    onPlan(FREE)
    await seedReceipts("user_a", 500, "2000-06-01T00:00:00Z")

    expect((await save()).status).toBe("success")
  })

  test("someone with no plan Features gets the free limit", async () => {
    signIn("user_a")
    await seedReceipts("user_a", 500)

    expect((await save()).status).toBe("error")
  })

  test("pro allows 2,000 and offers no upgrade at the cap", async () => {
    signIn("user_a")
    onPlan(PRO)
    await seedReceipts("user_a", 1999)

    expect((await save()).status).toBe("success")
    expect(await save()).toMatchObject({
      status: "error",
      message: "You've used all 2,000 receipt scans for this year.",
      upgrade: false,
    })
  })

  test("only the caller's own receipts count", async () => {
    signIn("user_a")
    onPlan(FREE)
    await seedReceipts("user_b", 500)

    expect((await save()).status).toBe("success")
  })
})

describe("organization size", () => {
  test("free allows a one-person organization", async () => {
    signIn("user_a", "org_1")
    onPlan(FREE)
    fake.orgMembers.set("org_1", 1)

    expect((await save()).status).toBe("success")
  })

  test("free blocks an organization with two members", async () => {
    signIn("user_a", "org_1")
    onPlan(FREE)
    fake.orgMembers.set("org_1", 2)

    expect(await save()).toMatchObject({
      status: "error",
      message:
        "Your plan allows organizations of up to 1 member, and this one has 2. Upgrade to Pro for more.",
      upgrade: true,
    })
  })

  test("pro allows three members but not four", async () => {
    signIn("user_a", "org_1")
    onPlan(PRO)
    fake.orgMembers.set("org_1", 3)
    expect((await save()).status).toBe("success")

    fake.orgMembers.set("org_1", 4)
    expect(await save()).toMatchObject({ status: "error", upgrade: false })
  })

  test("is not checked when no organization is active", async () => {
    signIn("user_a")
    onPlan(FREE)
    fake.clerkDown = true

    expect((await save()).status).toBe("success")
  })

  test("fails closed when Clerk cannot say how big the org is", async () => {
    signIn("user_a", "org_1")
    onPlan(PRO)
    fake.clerkDown = true

    expect(await save()).toMatchObject({
      status: "error",
      message: "Couldn't check your organization's size. Try again.",
    })
  })
})

describe("checkEntitlements", () => {
  test("reports every failed check in one message", async () => {
    signIn("user_a", "org_1")
    onPlan(FREE)
    fake.orgMembers.set("org_1", 2)
    await seedReceipts("user_a", 500)

    const result = await save()
    expect(result).toEqual({
      status: "error",
      message:
        "You've used all 500 receipt scans for this year. Your plan allows organizations of up to 1 member, and this one has 2. Upgrade to Pro for more.",
      fieldErrors: {},
      upgrade: true,
    })
  })

  test("runs the checks in parallel", async () => {
    signIn("user_a")
    const started: string[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const slow = (name: string) => async (_ctx: BillingContext) => {
      started.push(name)
      await gate
    }

    const run = checkEntitlements(slow("a"), slow("b"))
    // Both have started before either has finished.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual(["a", "b"])
    release()
    await run
  })

  test("collects the codes of every failure", async () => {
    signIn("user_a")
    const fail = (code: "receipt_limit" | "org_size") => async () => {
      throw new EntitlementError([code], code)
    }

    const error = await checkEntitlements(
      fail("receipt_limit"),
      fail("org_size")
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EntitlementError)
    expect((error as EntitlementError).codes).toEqual([
      "receipt_limit",
      "org_size",
    ])
  })

  test("passes other errors through untouched", async () => {
    signIn("user_a")
    const boom = new Error("boom")
    await expect(
      checkEntitlements(async () => {
        throw boom
      })
    ).rejects.toBe(boom)
  })
})

describe("extractReceiptAction (auto-detect)", () => {
  test("is blocked on the free plan", async () => {
    signIn("user_a")
    onPlan(FREE)

    expect(
      await extractReceiptAction(newReceiptImagePathname("user_a"))
    ).toEqual({
      status: "error",
      message:
        "Auto-detect is a Pro feature, so fill the details in by hand. Upgrade to Pro for more.",
      upgrade: true,
    })
  })

  test("runs on pro", async () => {
    signIn("user_a")
    onPlan(PRO)

    const result = await extractReceiptAction(
      newReceiptImagePathname("user_a")
    )
    expect(result.status).toBe("success")
  })

  test("is blocked when the yearly limit is used up, even on pro", async () => {
    signIn("user_a")
    onPlan(PRO)
    await seedReceipts("user_a", 2000)

    expect(
      await extractReceiptAction(newReceiptImagePathname("user_a"))
    ).toMatchObject({ status: "error", upgrade: false })
  })
})
