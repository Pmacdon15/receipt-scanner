import { describe, expect, test } from "bun:test"

import {
  clientImageFileSchema,
  extractionResultSchema,
  imageUploadFileSchema,
  imageUploadResponseSchema,
  newReceiptSchema,
  primarySplitType,
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

describe("split receipts", () => {
  const base = { merchant: "Costco", total: "42.17" }

  test("parses a split that adds up to the total", () => {
    const result = scanReceiptFormSchema.safeParse({
      ...base,
      splits: JSON.stringify([
        { type: "grocery", amount: "30.00" },
        { type: "hardware", amount: "12.17" },
      ]),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.splits).toEqual([
        { type: "grocery", amountCents: 3000 },
        { type: "hardware", amountCents: 1217 },
      ])
    }
  })

  test("an empty split means one category", () => {
    const result = scanReceiptFormSchema.safeParse({ ...base, splits: "" })
    expect(result.success && result.data.splits).toBeNull()
  })

  test("reports a split that does not add up, on the splits field", () => {
    const result = scanReceiptFormSchema.safeParse({
      ...base,
      splits: JSON.stringify([
        { type: "grocery", amount: "30.00" },
        { type: "hardware", amount: "10.00" },
      ]),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path[0]).toBe("splits")
      expect(result.error.issues[0].message).toContain("short")
    }
  })

  test("rejects one-part splits, repeated categories and unknown ones", () => {
    const parse = (rows: unknown) =>
      scanReceiptFormSchema.safeParse({ ...base, splits: JSON.stringify(rows) })
        .success

    expect(parse([{ type: "grocery", amount: "42.17" }])).toBe(false)
    expect(
      parse([
        { type: "grocery", amount: "30.00" },
        { type: "grocery", amount: "12.17" },
      ])
    ).toBe(false)
    expect(
      parse([
        { type: "grocery", amount: "30.00" },
        { type: "nope", amount: "12.17" },
      ])
    ).toBe(false)
  })

  test("newReceiptSchema checks the split against totalCents", () => {
    const receipt = {
      merchant: "Costco",
      purchasedOn: null,
      currency: "CAD",
      subtotalCents: null,
      taxCents: null,
      totalCents: 4217,
      rawText: null,
      notes: null,
    }
    expect(
      newReceiptSchema.safeParse({
        ...receipt,
        splits: [
          { type: "grocery", amountCents: 3000 },
          { type: "hardware", amountCents: 1217 },
        ],
      }).success
    ).toBe(true)
    expect(
      newReceiptSchema.safeParse({
        ...receipt,
        splits: [
          { type: "grocery", amountCents: 3000 },
          { type: "hardware", amountCents: 1000 },
        ],
      }).success
    ).toBe(false)
  })

  test("primarySplitType picks the largest part, first on a tie", () => {
    expect(
      primarySplitType([
        { type: "hardware", amountCents: 1217 },
        { type: "grocery", amountCents: 3000 },
      ])
    ).toBe("grocery")
    expect(
      primarySplitType([
        { type: "office", amountCents: 500 },
        { type: "grocery", amountCents: 500 },
      ])
    ).toBe("office")
  })
})
