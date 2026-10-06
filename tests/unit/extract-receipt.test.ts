import { describe, expect, test } from "bun:test"

import {
  extractReceiptFields,
  extractReceiptFieldsSafely,
  NOT_RECOGNISED,
} from "@/lib/extract-receipt"
import { newReceiptImagePathname } from "@/lib/receipt-image"

describe("extract-receipt", () => {
  test("returns NOT_RECOGNISED result for valid photo pathname while OCR is a seam", async () => {
    const validPath = newReceiptImagePathname("user_123")
    const result = await extractReceiptFields(validPath)

    expect(result).toEqual(NOT_RECOGNISED)
    expect(result.recognised).toBe(false)
    expect(result.fields).toEqual({})
  })

  test("handles malformed pathname by returning NOT_RECOGNISED", async () => {
    const result = await extractReceiptFields("not-a-valid-path")
    expect(result).toEqual(NOT_RECOGNISED)
  })

  test("extractReceiptFieldsSafely delegates to extractReceiptFields", async () => {
    const validPath = newReceiptImagePathname("user_123")
    const result = await extractReceiptFieldsSafely(validPath)
    expect(result).toEqual(NOT_RECOGNISED)
  })
})
