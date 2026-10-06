/**
 * Which receipt photos go in the "Download .zip" archive, and where each one
 * goes. Takes the same query string as /documents, plus `organize`
 * (month, category or none).
 *
 * The browser builds the ZIP itself (lib/documents/receipt-archive.ts): it
 * reads this list, fetches each photo through /api/receipts/[id]/image (which
 * authorizes every photo on its own), and zips them locally. Streaming the
 * whole archive through one function ran into its size and time limits, and
 * the error came back as a text file saved as "zip.txt" (issue #14).
 *
 * Only receipt ids and archive paths go out; blob pathnames stay on the server.
 * Errors are JSON, so the page can show them instead of saving them.
 */

import type { NextRequest } from "next/server"

import { getReceiptExport, UnauthorizedError } from "@/lib/dal/receipts"
import {
  exportFileName,
  exportParamsFrom,
  queryValue,
  reportMeta,
} from "@/lib/documents/export-request"
import {
  ARCHIVE_PHOTO_LIMIT,
  buildArchiveManifest,
  parseOrganize,
} from "@/lib/documents/receipt-archive"

const PRIVATE = { "Cache-Control": "private, no-store" }

export async function GET(request: NextRequest) {
  try {
    const data = await getReceiptExport(exportParamsFrom(request))
    const meta = reportMeta(data, new Date())
    const manifest = buildArchiveManifest(data.receipts, {
      organize: parseOrganize(queryValue(request, "organize")),
      scopeLabel: meta.scopeLabel,
      from: meta.from,
      to: meta.to,
      generatedAt: meta.generatedAt,
      fileName: exportFileName(data, "zip"),
    })

    if (manifest.photos.length > ARCHIVE_PHOTO_LIMIT) {
      return Response.json(
        {
          error: `This period has ${manifest.photos.length} receipt photos, more than the ${ARCHIVE_PHOTO_LIMIT} one download holds. Pick a shorter date range.`,
        },
        { status: 413, headers: PRIVATE }
      )
    }

    return Response.json(manifest, { headers: PRIVATE })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Your session has ended. Sign in again to download." },
        { status: 401, headers: PRIVATE }
      )
    }
    console.error("receipt photo manifest failed", error)
    return Response.json(
      { error: "Could not list the receipt photos. Try again in a moment." },
      { status: 500, headers: PRIVATE }
    )
  }
}
