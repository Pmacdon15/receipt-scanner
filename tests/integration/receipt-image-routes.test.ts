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

import { insertReceipt } from "@/lib/db/receipts"
import { newReceiptImagePathname } from "@/lib/receipt-image"

// Mock @vercel/blob
const blobStore = {
  put: mock<
    (
      pathname: string,
      body: unknown,
      options?: unknown
    ) => Promise<{ pathname: string }>
  >(async (pathname) => ({ pathname })),
  get: mock<
    (
      pathname: string,
      options?: unknown
    ) => Promise<{
      statusCode: number
      stream: ReadableStream
      blob: { contentType: string; size: number }
    } | null>
  >(async () => ({
    statusCode: 200,
    stream: new ReadableStream(),
    blob: { contentType: "image/jpeg", size: 4 },
  })),
}

mock.module("@vercel/blob", () => blobStore)

const { POST } = await import("@/app/api/receipts/image/route")
const { GET } = await import("@/app/api/receipts/[id]/image/route")

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
  blobStore.put.mockClear()
  blobStore.get.mockClear()
})

describe("POST /api/receipts/image", () => {
  test("refuses unauthenticated upload with 401", async () => {
    signIn(null)
    const formData = new FormData()
    formData.append(
      "file",
      new Blob(["bytes"], { type: "image/jpeg" }),
      "test.jpg"
    )

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  test("refuses upload when no photo is attached", async () => {
    signIn("user_a")
    const formData = new FormData()

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: string }
    expect(json.error).toBe("No photo was attached.")
  })

  test("refuses non-JPEG file with 415", async () => {
    signIn("user_a")
    const formData = new FormData()
    formData.append(
      "file",
      new Blob(["bytes"], { type: "image/png" }),
      "test.png"
    )

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(415)
    const json = (await response.json()) as { error: string }
    expect(json.error).toBe("Only JPEG photos can be uploaded.")
  })

  test("refuses empty photo with 400", async () => {
    signIn("user_a")
    const formData = new FormData()
    formData.append("file", new Blob([], { type: "image/jpeg" }), "test.jpg")

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: string }
    expect(json.error).toBe("That photo was empty.")
  })

  test("refuses oversized photo with 413", async () => {
    signIn("user_a")
    const formData = new FormData()
    const largeBytes = new Uint8Array(4 * 1024 * 1024)
    formData.append(
      "file",
      new Blob([largeBytes], { type: "image/jpeg" }),
      "test.jpg"
    )

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(413)
    const json = (await response.json()) as { error: string }
    expect(json.error).toBe("That photo is too large.")
  })

  test("saves valid JPEG upload and returns pathname", async () => {
    signIn("user_a")
    const formData = new FormData()
    formData.append(
      "file",
      new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
      "receipt.jpg"
    )

    const request = new Request("http://localhost/api/receipts/image", {
      method: "POST",
      body: formData,
    }) as unknown as NextRequest

    const response = await POST(request)
    expect(response.status).toBe(200)

    const json = (await response.json()) as { pathname: string }
    expect(json.pathname).toMatch(/^receipts\/user_a\/[0-9a-f-]{36}\.jpg$/)
    expect(blobStore.put).toHaveBeenCalledTimes(1)
  })
})

describe("GET /api/receipts/[id]/image", () => {
  test("refuses unauthenticated request with 401", async () => {
    signIn(null)
    const request = new Request(
      "http://localhost/api/receipts/00000000-0000-0000-0000-000000000000/image"
    ) as unknown as NextRequest

    const response = await GET(request, {
      params: Promise.resolve({ id: crypto.randomUUID() }),
    })
    expect(response.status).toBe(401)
  })

  test("returns 404 for non-uuid id", async () => {
    signIn("user_a")
    const request = new Request(
      "http://localhost/api/receipts/not-a-uuid/image"
    ) as unknown as NextRequest

    const response = await GET(request, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(response.status).toBe(404)
  })

  test("returns 404 when receipt has no image", async () => {
    signIn("user_a")
    const row = await insertReceipt("user_a", {
      orgId: null,
      merchant: "Store",
      purchasedOn: null,
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
    })

    const request = new Request(
      `http://localhost/api/receipts/${row.id}/image`
    ) as unknown as NextRequest

    const response = await GET(request, {
      params: Promise.resolve({ id: row.id }),
    })
    expect(response.status).toBe(404)
  })

  test("returns 404 when receipt belongs to another user", async () => {
    signIn("user_a")
    const pathname = newReceiptImagePathname("user_a")
    const row = await insertReceipt("user_a", {
      orgId: null,
      merchant: "Store",
      purchasedOn: null,
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
      imageUrl: pathname,
      notes: null,
    })

    signIn("user_b")
    const request = new Request(
      `http://localhost/api/receipts/${row.id}/image`
    ) as unknown as NextRequest

    const response = await GET(request, {
      params: Promise.resolve({ id: row.id }),
    })
    expect(response.status).toBe(404)
  })

  test("serves image stream when owner requests receipt photo", async () => {
    signIn("user_a")
    const pathname = newReceiptImagePathname("user_a")
    const row = await insertReceipt("user_a", {
      orgId: null,
      merchant: "Store",
      purchasedOn: null,
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
      imageUrl: pathname,
      notes: null,
    })

    const request = new Request(
      `http://localhost/api/receipts/${row.id}/image`
    ) as unknown as NextRequest

    const response = await GET(request, {
      params: Promise.resolve({ id: row.id }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
    expect(blobStore.get).toHaveBeenCalledWith(pathname, { access: "private" })
  })
})
