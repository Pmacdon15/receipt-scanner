import { describe, expect, test } from "bun:test"

import {
  formatBytes,
  ImageCompressionError,
  isSupportedImage,
} from "@/lib/compress-image"

describe("compress-image", () => {
  describe("isSupportedImage", () => {
    test("returns true for image MIME types", () => {
      const jpegFile = new File(["bytes"], "photo.jpg", { type: "image/jpeg" })
      const pngFile = new File(["bytes"], "photo.png", { type: "image/png" })
      const webpFile = new File(["bytes"], "photo.webp", { type: "image/webp" })

      expect(isSupportedImage(jpegFile)).toBe(true)
      expect(isSupportedImage(pngFile)).toBe(true)
      expect(isSupportedImage(webpFile)).toBe(true)
    })

    test("returns false for non-image MIME types", () => {
      const pdfFile = new File(["bytes"], "doc.pdf", {
        type: "application/pdf",
      })
      const textFile = new File(["bytes"], "doc.txt", { type: "text/plain" })
      const emptyTypeFile = new File(["bytes"], "unknown", { type: "" })

      expect(isSupportedImage(pdfFile)).toBe(false)
      expect(isSupportedImage(textFile)).toBe(false)
      expect(isSupportedImage(emptyTypeFile)).toBe(false)
    })
  })

  describe("formatBytes", () => {
    test("formats byte counts into human-readable strings", () => {
      expect(formatBytes(0)).toBe("0 B")
      expect(formatBytes(500)).toBe("500 B")
      expect(formatBytes(1024)).toBe("1 KB")
      expect(formatBytes(2048)).toBe("2 KB")
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
      expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB")
    })
  })

  describe("ImageCompressionError", () => {
    test("is an Error instance with proper name and message", () => {
      const err = new ImageCompressionError("Test failure")
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe("ImageCompressionError")
      expect(err.message).toBe("Test failure")
    })
  })
})
