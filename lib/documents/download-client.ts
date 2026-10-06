// Browser-side downloading for the documents page.
//
// The downloads used to be plain <a download> links. When a route answered
// with an error instead of the file, the browser saved the error text under the
// URL's last segment, which is how "zip.txt" happened (issue #14). Fetching
// first means a failure is shown to the user and never saved as a file.

export class DownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DownloadError"
  }
}

const SIGNED_OUT = "Your session has ended. Sign in again to download."

/** A short, user-facing reason a download request failed. */
export async function failureMessage(response: Response): Promise<string> {
  if (response.status === 401) return SIGNED_OUT
  try {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === "string" && body.error) return body.error
    }
  } catch {
    // Fall through to the generic message.
  }
  if (response.status === 413) {
    return "That is too much for one download. Pick a shorter date range."
  }
  return `The download failed (${response.status}). Try again in a moment.`
}

/** Fetches a same-origin URL and throws a DownloadError unless it is a 2xx. */
export async function fetchOk(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new DownloadError(
      "Could not reach the server. Check your connection and try again."
    )
  }
  if (!response.ok) throw new DownloadError(await failureMessage(response))
  return response
}

export async function fetchBytes(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetchOk(url, signal)
  return new Uint8Array(await response.arrayBuffer())
}

/** The file name from a Content-Disposition header, or the fallback. */
export function fileNameFrom(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition") ?? ""
  const match = /filename="([^"]+)"/.exec(header)
  return match?.[1] || fallback
}

/** Hands a Blob to the browser as a file download. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.rel = "noopener"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start reading the Blob before it is released.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Fetches a file and saves it, named as the server names it. */
export async function downloadFile(url: string, fallbackName: string) {
  const response = await fetchOk(url)
  const blob = await response.blob()
  saveBlob(blob, fileNameFrom(response, fallbackName))
}

/**
 * One receipt photo, through the per-receipt image route (which authorizes it).
 * Returns null when the photo is gone, so it is listed as missing in the
 * archive's README; throws when the session has ended, which would otherwise
 * leave every remaining photo missing.
 */
export async function fetchReceiptPhoto(
  receiptId: string,
  signal?: AbortSignal
): Promise<Uint8Array | null> {
  let response: Response
  try {
    response = await fetch(
      `/api/receipts/${encodeURIComponent(receiptId)}/image`,
      { credentials: "same-origin", cache: "no-store", signal }
    )
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
  if (response.status === 401) throw new DownloadError(SIGNED_OUT)
  if (!response.ok) return null
  return new Uint8Array(await response.arrayBuffer())
}
