import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test"
import type { NextRequest } from "next/server"

import { fake, resetFakes, signIn } from "../helpers/server-mocks"
import { createTestDb, type TestDb } from "../helpers/test-db"
import { readZip } from "../helpers/zip"

import { getReceiptExport } from "@/lib/dal/receipts"
import { insertReceipt, type InsertReceiptInput } from "@/lib/db/receipts"
import { newReceiptImagePathname } from "@/lib/receipt-image"

// Photos come out of the private blob store; record which ones are read.
const blobReads: string[] = []
mock.module("@vercel/blob", () => ({
  get: async (pathname: string) => {
    blobReads.push(pathname)
    return {
      statusCode: 200,
      stream: new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).body,
      blob: { contentType: "image/jpeg", size: 4 },
    }
  },
}))

const { GET: getPdf } = await import("@/app/api/documents/pdf/route")
const { GET: getXlsx } = await import("@/app/api/documents/xlsx/route")
const { GET: getZip } = await import("@/app/api/documents/zip/route")

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
  blobReads.length = 0
})

function receipt(
  overrides: Partial<InsertReceiptInput> = {}
): InsertReceiptInput {
  return {
    orgId: null,
    merchant: "Corner Store",
    purchasedOn: "2026-01-15",
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

const request = (path: string) =>
  new Request(`http://localhost${path}`) as unknown as NextRequest

describe("getReceiptExport", () => {
  test("covers only the signed-in user's receipts in the period, oldest first", async () => {
    await insertReceipt("user_a", receipt({ merchant: "Later", purchasedOn: "2026-02-10" }))
    await insertReceipt("user_a", receipt({ merchant: "Earlier", purchasedOn: "2026-01-05" }))
    await insertReceipt("user_a", receipt({ merchant: "Last year", purchasedOn: "2025-06-01" }))
    await insertReceipt("user_b", receipt({ merchant: "Not mine", purchasedOn: "2026-01-20" }))

    signIn("user_a")
    const data = await getReceiptExport({
      scope: "mine",
      purchasedFrom: "2026-01-01",
      purchasedTo: "2026-12-31",
    })

    expect(data.receipts.map((r) => r.merchant)).toEqual(["Earlier", "Later"])
    expect(data.truncated).toBe(false)
  })

  test("the team scope covers the active organization, and falls back without one", async () => {
    await insertReceipt("user_a", receipt({ merchant: "Mine, team", orgId: "org_1" }))
    await insertReceipt("user_b", receipt({ merchant: "Teammate", orgId: "org_1" }))
    await insertReceipt("user_c", receipt({ merchant: "Other team", orgId: "org_2" }))
    fake.orgs.set("org_1", "Acme")

    signIn("user_a", "org_1")
    const team = await getReceiptExport({ scope: "org" })
    expect(team.scope).toBe("org")
    expect(team.org?.name).toBe("Acme")
    expect(team.receipts.map((r) => r.merchant).sort()).toEqual([
      "Mine, team",
      "Teammate",
    ])

    signIn("user_a")
    const personal = await getReceiptExport({ scope: "org" })
    expect(personal.scope).toBe("mine")
    expect(personal.receipts.map((r) => r.merchant)).toEqual(["Mine, team"])
  })
})

describe("download routes", () => {
  test("refuse a signed-out caller", async () => {
    signIn(null)
    for (const get of [getPdf, getXlsx, getZip]) {
      const response = await get(request("/api/documents/x"))
      expect(response.status).toBe(401)
    }
  })

  test("the PDF downloads, or opens inline to print", async () => {
    await insertReceipt("user_a", receipt())
    signIn("user_a")

    const response = await getPdf(
      request("/api/documents/pdf?from=2026-01-01&to=2026-01-31")
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/pdf")
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="receipts-2026-01-01-to-2026-01-31.pdf"'
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-")

    const inline = await getPdf(request("/api/documents/pdf?disposition=inline"))
    expect(inline.headers.get("Content-Disposition")).toStartWith("inline;")
  })

  test("the spreadsheet holds only the caller's receipts", async () => {
    await insertReceipt("user_a", receipt({ merchant: "Costco" }))
    await insertReceipt("user_b", receipt({ merchant: "Secret Shop" }))
    signIn("user_a")

    const response = await getXlsx(request("/api/documents/xlsx"))
    expect(response.status).toBe(200)
    const files = readZip(new Uint8Array(await response.arrayBuffer()))
    const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet2.xml"))
    expect(sheet).toContain("Costco")
    expect(sheet).not.toContain("Secret Shop")
  })

  test("the ZIP files each photo by month and reads only the caller's photos", async () => {
    const mine = newReceiptImagePathname("user_a")
    const theirs = newReceiptImagePathname("user_b")
    await insertReceipt(
      "user_a",
      receipt({ merchant: "Costco", purchasedOn: "2026-01-15", totalCents: 4217, imageUrl: mine })
    )
    await insertReceipt("user_a", receipt({ merchant: "Typed in" }))
    await insertReceipt("user_b", receipt({ merchant: "Theirs", imageUrl: theirs }))
    signIn("user_a")

    const response = await getZip(
      request("/api/documents/zip?from=2026-01-01&to=2026-01-31")
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/zip")

    const files = readZip(new Uint8Array(await response.arrayBuffer()))
    const root = "receipts-2026-01-01-to-2026-01-31/"
    expect([...files.keys()]).toEqual([
      `${root}Receipt report.pdf`,
      `${root}Receipts.xlsx`,
      `${root}2026-01 January/2026-01-15 Costco 42.17.jpg`,
      `${root}README.txt`,
    ])
    expect(blobReads).toEqual([mine])
  })

  test("the ZIP can be filed by category", async () => {
    await insertReceipt(
      "user_a",
      receipt({
        merchant: "Shell",
        receiptType: "fuel",
        imageUrl: newReceiptImagePathname("user_a"),
      })
    )
    signIn("user_a")

    const response = await getZip(request("/api/documents/zip?organize=category"))
    const names = [...readZip(new Uint8Array(await response.arrayBuffer())).keys()]
    expect(names).toContain(
      "receipts-all-dates/Fuel & Transport/2026-01-15 Shell 10.00.jpg"
    )
  })
})
