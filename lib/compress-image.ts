/**
 * Client-side image compression for receipt photos.
 *
 * Phone cameras produce 4-12MB JPEGs. Everything here runs in the browser so
 * the large original never leaves the device — only the shrunken result is
 * uploaded.
 *
 * The output is a binary JPEG `Blob`, posted as multipart form data to the
 * upload route. It used to be a base64 data URL sized to fit a Server Action's
 * 1MB body cap; the upload is now a Route Handler with far more headroom, so
 * there is no reason left to pay base64's ~33% inflation on every byte.
 */

import { IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES } from "@/lib/receipt-image"

/** Receipts are tall and thin; this keeps text legible without paying for a 4000px frame. */
const MAX_EDGE = 1600

/** Quality ladder, walked until the result fits the budget. */
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.46, 0.34]

/** Below this, dropping quality further destroys the text faster than it saves bytes. */
const MIN_EDGE = 640

export type CompressedImage = {
  /** The encoded JPEG, ready to upload. */
  blob: Blob
  /** Size of the encoded JPEG in bytes, which is what the budget is measured against. */
  bytes: number
  width: number
  height: number
}

export class ImageCompressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageCompressionError"
  }
}

export function isSupportedImage(file: File) {
  return file.type.startsWith("image/")
}

/**
 * Downscales and re-encodes `file` until the JPEG fits `maxBytes`.
 *
 * Walks the quality ladder first, then halves the long edge and walks it again,
 * because dropping resolution recovers far more bytes than the last few quality
 * steps once an image is already heavily compressed.
 */
export async function compressImage(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES
): Promise<CompressedImage> {
  if (!isSupportedImage(file)) {
    throw new ImageCompressionError("That file is not an image.")
  }

  const bitmap = await loadBitmap(file)

  try {
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height))
    let smallest: CompressedImage | null = null

    while (edge >= MIN_EDGE) {
      const { canvas, width, height } = drawScaled(bitmap, edge)

      for (const quality of QUALITY_STEPS) {
        const blob = await encodeJpeg(canvas, quality)
        const candidate = { blob, bytes: blob.size, width, height }

        if (candidate.bytes <= maxBytes) return candidate
        if (!smallest || candidate.bytes < smallest.bytes) smallest = candidate
      }

      edge = Math.round(edge / 2)
    }

    // Nothing fit. Hand back the smallest attempt so the caller can report a
    // real size in the error rather than a generic failure.
    throw new ImageCompressionError(
      smallest
        ? `Could not get this photo under ${formatBytes(maxBytes)} — the smallest version was still ${formatBytes(smallest.bytes)}. Try a tighter crop.`
        : "Could not compress that photo."
    )
  } finally {
    bitmap.close()
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    throw new ImageCompressionError(
      "That image could not be read. It may be corrupt or an unsupported format."
    )
  }
}

/** Promise wrapper for `canvas.toBlob`, which is callback-only. */
function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else {
          reject(
            new ImageCompressionError(
              "This browser could not encode the image."
            )
          )
        }
      },
      IMAGE_CONTENT_TYPE,
      quality
    )
  })
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new ImageCompressionError("This browser could not process the image.")
  }

  // Receipt text is the whole point of the capture, so pay for the better filter.
  context.imageSmoothingQuality = "high"
  // JPEG has no alpha; without this, transparent source pixels turn black.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)

  return { canvas, width, height }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
