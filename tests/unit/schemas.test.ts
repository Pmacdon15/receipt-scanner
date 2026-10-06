import { describe, expect, test } from "bun:test"

import {
  clientImageFileSchema,
  extractionResultSchema,
  imageUploadFileSchema,
  imageUploadResponseSchema,
  newReceiptSchema,
  receiptImagePathnameSchema,
  scanReceiptFormSchema,
} from "@/lib/schemas"

describe("schemas", () => {
  describe("receiptImagePathnameSchema", () => {
    test("validates properly formatted receipt photo pathnames", () => {
      const valid =
        "receipts/user_abc/12345678-1234-1234-1234-123456789abc.jpg"
      expect(receiptImagePathnameSchema.safeParse(valid).success).toBe(true)
    })

    test("rejects malformed receipt photo pathnames", () => {
      expect(receiptImagePathnameSchema.safeParse("").success).toBe(false)
      expect(
        receiptImagePathnameSchema.safeParse("receipts/user/not-a-uuid.jpg")
          .success
      ).toBe(false)
      expect(
        receiptImagePathnameSchema.safeParse(
          "receipts/user/12345678-1234-1234-1234-123456789abc.png"
        ).success
      ).toBe(false)
    })
  })

  describe("imageUploadFileSchema", () => {
    test("accepts JPEG Blob within size budget", () => {
      const blob = new Blob(["test"], { type: "image/jpeg" })
      expect(imageUploadFileSchema.safeParse(blob).success).toBe(true)
    })

    test("rejects non-Blob inputs", () => {
      expect(imageUploadFileSchema.safeParse("not a blob").success).toBe(false)
    })

    test("rejects non-JPEG content type", () => {
      const blob = new Blob(["test"], { type: "image/png" })
      const result = imageUploadFileSchema.safeParse(blob)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Only JPEG photos can be uploaded."
        )
      }
    })

    test("rejects empty blob", () => {
      const blob = new Blob([], { type: "image/jpeg" })
      const result = imageUploadFileSchema.safeParse(blob)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("That photo was empty.")
      }
    })
  })

  describe("clientImageFileSchema", () => {
    test("accepts image files", () => {
      const file = new File(["bytes"], "test.jpg", { type: "image/jpeg" })
      expect(clientImageFileSchema.safeParse(file).success).toBe(true)
    })

    test("rejects non-image files", () => {
      const file = new File(["bytes"], "test.pdf", { type: "application/pdf" })
      expect(clientImageFileSchema.safeParse(file).success).toBe(false)
    })
  })

  describe("imageUploadResponseSchema", () => {
    test("validates upload API response", () => {
      const valid = {
        pathname:
          "receipts/user_123/12345678-1234-1234-1234-123456789abc.jpg",
      }
      expect(imageUploadResponseSchema.safeParse(valid).success).toBe(true)
    })

    test("rejects invalid upload API response", () => {
      expect(
        imageUploadResponseSchema.safeParse({ pathname: "bad-path" }).success
      ).toBe(false)
      expect(
        imageUploadResponseSchema.safeParse({}).success
      ).toBe(false)
    })
  })

  describe("scanReceiptFormSchema with image", () => {
    test("accepts form data with valid imagePathname", () => {
      const result = scanReceiptFormSchema.safeParse({
        merchant: "Costco",
        total: "123.45",
        imagePathname:
          "receipts/user_123/12345678-1234-1234-1234-123456789abc.jpg",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imagePathname).toBe(
          "receipts/user_123/12345678-1234-1234-1234-123456789abc.jpg"
        )
      }
    })

    test("accepts form data without imagePathname", () => {
      const result = scanReceiptFormSchema.safeParse({
        merchant: "Costco",
        total: "123.45",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imagePathname).toBeUndefined()
      }
    })
  })

  describe("newReceiptSchema with imageUrl", () => {
    test("accepts valid receipt with imageUrl", () => {
      const result = newReceiptSchema.safeParse({
        merchant: "Costco",
        purchasedOn: "2025-01-01",
        currency: "CAD",
        subtotalCents: null,
        taxCents: null,
        totalCents: 5000,
        imageUrl:
          "receipts/user_123/12345678-1234-1234-1234-123456789abc.jpg",
        notes: null,
        rawText: null,
      })
      expect(result.success).toBe(true)
    })
  })

  describe("extractionResultSchema", () => {
    test("validates extraction output", () => {
      const result = extractionResultSchema.safeParse({
        recognised: false,
        fields: {},
      })
      expect(result.success).toBe(true)
    })
  })
})
