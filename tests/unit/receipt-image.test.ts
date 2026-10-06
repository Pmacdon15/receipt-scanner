import { describe, expect, test } from "bun:test"

import {
  IMAGE_CONTENT_TYPE,
  isOwnReceiptImagePathname,
  MAX_IMAGE_BYTES,
  newReceiptImagePathname,
} from "@/lib/receipt-image"

describe("receipt-image", () => {
  describe("newReceiptImagePathname", () => {
    test("builds a namespaced JPEG pathname with a UUID", () => {
      const pathname = newReceiptImagePathname("user_123")
      expect(pathname).toMatch(
        /^receipts\/user_123\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
      )
    })

    test("generates unique filenames each time", () => {
      const path1 = newReceiptImagePathname("user_123")
      const path2 = newReceiptImagePathname("user_123")
      expect(path1).not.toBe(path2)
    })

    test("refuses invalid or unsafe user ids", () => {
      expect(() => newReceiptImagePathname("")).toThrow(
        "Cannot build a blob pathname for this user id."
      )
      expect(() => newReceiptImagePathname("user/with/slashes")).toThrow(
        "Cannot build a blob pathname for this user id."
      )
      expect(() => newReceiptImagePathname("../escaped")).toThrow(
        "Cannot build a blob pathname for this user id."
      )
      expect(() => newReceiptImagePathname("user with spaces")).toThrow(
        "Cannot build a blob pathname for this user id."
      )
    })
  })

  describe("isOwnReceiptImagePathname", () => {
    test("accepts pathnames minted for the given user", () => {
      const pathname = newReceiptImagePathname("user_abc")
      expect(isOwnReceiptImagePathname(pathname, "user_abc")).toBe(true)
    })

    test("refuses pathnames minted for a different user", () => {
      const pathname = newReceiptImagePathname("user_abc")
      expect(isOwnReceiptImagePathname(pathname, "user_xyz")).toBe(false)
    })

    test("refuses path traversal attempts", () => {
      const uuid = "12345678-1234-1234-1234-123456789abc"
      expect(
        isOwnReceiptImagePathname(
          `receipts/user_abc/../user_xyz/${uuid}.jpg`,
          "user_abc"
        )
      ).toBe(false)
      expect(
        isOwnReceiptImagePathname(
          `receipts/user_abc/subdir/${uuid}.jpg`,
          "user_abc"
        )
      ).toBe(false)
    })

    test("refuses non-JPEG extensions or arbitrary filenames", () => {
      expect(
        isOwnReceiptImagePathname(
          "receipts/user_abc/12345678-1234-1234-1234-123456789abc.png",
          "user_abc"
        )
      ).toBe(false)
      expect(
        isOwnReceiptImagePathname("receipts/user_abc/receipt.jpg", "user_abc")
      ).toBe(false)
    })

    test("refuses non-string or malformed inputs safely", () => {
      expect(isOwnReceiptImagePathname(null, "user_abc")).toBe(false)
      expect(isOwnReceiptImagePathname(undefined, "user_abc")).toBe(false)
      expect(isOwnReceiptImagePathname(12345, "user_abc")).toBe(false)
      expect(isOwnReceiptImagePathname({}, "user_abc")).toBe(false)
      expect(isOwnReceiptImagePathname("", "user_abc")).toBe(false)
      expect(
        isOwnReceiptImagePathname(
          "receipts/user_abc/12345678-1234-1234-1234-123456789abc.jpg",
          "unsafe/user"
        )
      ).toBe(false)
    })
  })

  describe("constants", () => {
    test("matches accepted image upload config", () => {
      expect(IMAGE_CONTENT_TYPE).toBe("image/jpeg")
      expect(MAX_IMAGE_BYTES).toBe(3 * 1024 * 1024)
    })
  })
})
