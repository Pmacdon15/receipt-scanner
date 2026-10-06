import { describe, expect, test } from "bun:test"

import {
  extractReceiptFields,
  extractReceiptFieldsSafely,
  NOT_RECOGNISED,
  toExtractionResult,
} from "@/lib/extract-receipt"
import { newReceiptImagePathname } from "@/lib/receipt-image"

const validPath = newReceiptImagePathname("user_123")
const jpeg = async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function replyBody(input: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      content: [{ type: "tool_use", name: "record_receipt", input }],
    }),
    { status }
  )
}

function claudeReply(input: unknown, status = 200) {
  return (async () => replyBody(input, status)) as unknown as typeof fetch
}

describe("extractReceiptFields", () => {
  test("is off without an API key", async () => {
    const result = await extractReceiptFields(validPath, {
      apiKey: null,
      readImage: jpeg,
    })
    expect(result).toEqual(NOT_RECOGNISED)
  })

  test("handles a malformed pathname by returning NOT_RECOGNISED", async () => {
    const result = await extractReceiptFields("not-a-valid-path", {
      apiKey: "key",
    })
    expect(result).toEqual(NOT_RECOGNISED)
  })

  test("sends the photo to Claude and maps the tool answer", async () => {
    const sent: { headers: Record<string, string>; body: string }[] = []
    const fetchSpy = (async (_url: string, init: RequestInit) => {
      sent.push({
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      })
      return replyBody({
        merchant: "Costco",
        purchased_on: "2026-10-01",
        total: 42.17,
        category: "grocery",
        category_confidence: 0.8,
      })
    }) as unknown as typeof fetch

    const result = await extractReceiptFields(validPath, {
      apiKey: "key",
      model: "test-model",
      readImage: jpeg,
      fetch: fetchSpy,
    })

    expect(result).toEqual({
      recognised: true,
      fields: {
        merchant: "Costco",
        purchasedOn: "2026-10-01",
        total: "42.17",
        receiptType: "grocery",
        confidence: 0.8,
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].headers["x-api-key"]).toBe("key")
    const body = JSON.parse(sent[0].body)
    expect(body.model).toBe("test-model")
    expect(body.messages[0].content[0].type).toBe("image")
  })

  test("the safe wrapper turns an API error into NOT_RECOGNISED", async () => {
    const result = await extractReceiptFieldsSafely(validPath, {
      apiKey: "key",
      readImage: jpeg,
      fetch: claudeReply({}, 500),
    })
    expect(result).toEqual(NOT_RECOGNISED)
  })
})

describe("toExtractionResult", () => {
  test("keeps a split and makes it add up to the total", () => {
    const result = toExtractionResult({
      total: 42.17,
      splits: [
        { category: "hardware", amount: 12.16 },
        { category: "grocery", amount: 30 },
      ],
    })
    // One cent of rounding goes onto the largest part.
    expect(result.fields.splits).toEqual([
      { type: "grocery", amount: "30.01" },
      { type: "hardware", amount: "12.16" },
    ])
  })

  test("drops a split that is far off the total", () => {
    const result = toExtractionResult({
      total: 42.17,
      splits: [
        { category: "hardware", amount: 5 },
        { category: "grocery", amount: 30 },
      ],
    })
    expect(result.fields.splits).toBeUndefined()
  })

  test("merges repeated categories and drops unknown ones", () => {
    const result = toExtractionResult({
      total: 10,
      splits: [
        { category: "grocery", amount: 3 },
        { category: "grocery", amount: 2 },
        { category: "spaceships", amount: 1 },
        { category: "office", amount: 5 },
      ],
    })
    // 3 + 2 + 5 = 10, so nothing is left over once "spaceships" is dropped.
    expect(result.fields.splits).toEqual([
      { type: "grocery", amount: "5.00" },
      { type: "office", amount: "5.00" },
    ])
  })

  test("drops fields that do not validate", () => {
    const result = toExtractionResult({
      purchased_on: "2026-02-31",
      category: "spaceships",
      total: -4,
    })
    expect(result).toEqual(NOT_RECOGNISED)
  })
})
