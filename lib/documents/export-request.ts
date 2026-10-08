import type { NextRequest } from "next/server"

import type { ReceiptExport, ReceiptSearchParams } from "@/lib/dal/receipts"
import { resolveTimeZone } from "@/lib/dates"
import { exportBaseName } from "@/lib/documents/report"
import type { ReportMeta } from "@/lib/documents/report-xlsx"
import { parseSearchParams, rawSearchParamsFrom } from "@/lib/search-params"

// Shared by the three download routes: they take the same query string as the
// documents page (and search), so a link built from one works for the others.

export function exportParamsFrom(request: NextRequest): ReceiptSearchParams {
  return parseSearchParams(
    rawSearchParamsFrom(new URL(request.url).searchParams)
  )
}

/** One query value from the request URL, outside the shared filters. */
export function queryValue(request: NextRequest, name: string): string | null {
  return new URL(request.url).searchParams.get(name)
}

/**
 * The viewer's timezone, sent by the download panel as `?tz=`. The server's
 * clock is a fine source for when a file was made, but which *day* that was
 * depends on where the viewer is (#22). UTC when missing or invalid.
 */
export function timeZoneFrom(request: NextRequest): string {
  return resolveTimeZone(queryValue(request, "tz"))
}

export function reportMeta(
  data: ReceiptExport,
  generatedAt: Date,
  timeZone = "UTC"
): ReportMeta {
  return {
    scopeLabel:
      data.scope === "org" && data.org ? data.org.name : "Personal receipts",
    from: data.params.purchasedFrom,
    to: data.params.purchasedTo,
    generatedAt,
    timeZone,
    truncated: data.truncated,
  }
}

export function exportFileName(data: ReceiptExport, extension: string) {
  const base = exportBaseName(
    data.params.purchasedFrom,
    data.params.purchasedTo
  )
  return `${data.scope === "org" ? `team-${base}` : base}.${extension}`
}

/** Headers for a private, per-user download. */
export function downloadHeaders(
  contentType: string,
  fileName: string,
  { inline = false, length }: { inline?: boolean; length?: number } = {}
): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // File names are built from dates only, so they are plain ASCII.
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }
  if (length !== undefined) headers["Content-Length"] = String(length)
  return headers
}

/** A copy of the bytes as an ArrayBuffer, which every BodyInit typing accepts. */
export function responseBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}
