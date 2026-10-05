/**
 * Client-side image compression for receipt photos.
 *
 * Phone cameras produce 4-12MB JPEGs, which a Server Action will not accept:
 * its request body is capped at 1MB. Everything here runs in the browser so the
 * large original never leaves the device — only the shrunken result is sent,
 * which keeps the scan inside the default cap with no bodySizeLimit override.
 *
 * The budget is measured against the finished data URL rather than the raw
 * encoded bytes, because the data URL is what actually crosses the wire and
 * base64 inflates the payload by roughly a third.
 */

/**
 * Data-URL budget. Held below the 1MB Server Action cap rather than at it: the
 * cap covers the whole request, so the remaining form fields and the bytes
 * multipart adds for boundaries and part headers have to fit in the gap too.
 */
export const MAX_DATA_URL_BYTES = 900 * 1024

/** Receipts are tall and thin; this keeps text legible without paying for a 4000px frame. */
const MAX_EDGE = 1600

/** Quality ladder, walked until the result fits the budget. */
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.46, 0.34]

/** Below this, dropping quality further destroys the text faster than it saves bytes. */
const MIN_EDGE = 640

export type CompressedImage = {
  dataUrl: string
  /** Size of the data URL in bytes, which is what the budget is measured against. */
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
 * Downscales and re-encodes `file` until its data URL fits `maxBytes`.
 *
 * Walks the quality ladder first, then halves the long edge and walks it again,
 * because dropping resolution recovers far more bytes than the last few quality
 * steps once an image is already heavily compressed.
 */
export async function compressImage(
  file: File,
  maxBytes: number = MAX_DATA_URL_BYTES
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
        const dataUrl = canvas.toDataURL("image/jpeg", quality)
        const candidate = { dataUrl, bytes: dataUrl.length, width, height }

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
