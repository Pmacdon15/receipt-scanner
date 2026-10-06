/**
 * Every receipt photo in one ZIP, filed by month (default), by category
 * (`?organize=category`) or in one folder (`?organize=none`), with the PDF
 * report and the spreadsheet included. Takes the same query string as
 * /documents.
 *
 * Authorization works as it does for a single photo: the pathnames come from
 * rows the DAL already scoped to what the signed-in user can see (their own
 * receipts, or their active organization's), never from the request.
 *
 * The archive streams, reading a few photos ahead, so memory stays at a
 * handful of photos however many receipts are in it.
 */

import { auth } from "@clerk/nextjs/server"
import { get } from "@vercel/blob"
import type { NextRequest } from "next/server"

import { getReceiptExportWithPhotos } from "@/lib/dal/receipts"
import {
  downloadHeaders,
  exportFileName,
  exportParamsFrom,
  queryValue,
  reportMeta,
} from "@/lib/documents/export-request"
import {
  ARCHIVE_PHOTO_LIMIT,
  archivePhotoPaths,
  parseOrganize,
  receiptArchiveStream,
} from "@/lib/documents/receipt-archive"
import { buildReportPdf } from "@/lib/documents/report-pdf"
import { buildReportXlsx } from "@/lib/documents/report-xlsx"

// Reading hundreds of photos from blob storage takes a while.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const { data, imagePathnames } = await getReceiptExportWithPhotos(
    exportParamsFrom(request)
  )

  if (imagePathnames.size > ARCHIVE_PHOTO_LIMIT) {
    return new Response(
      `That range has ${imagePathnames.size} receipt photos, more than the ${ARCHIVE_PHOTO_LIMIT} one download holds. Pick a shorter date range.`,
      { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    )
  }

  const generatedAt = new Date()
  const meta = reportMeta(data, generatedAt)
  const organize = parseOrganize(queryValue(request, "organize"))
  const photoPaths = archivePhotoPaths(
    data.receipts.filter((r) => imagePathnames.has(r.id)),
    organize
  )

  const pdf = await buildReportPdf(data.receipts, meta)
  const xlsx = buildReportXlsx(data.receipts, meta, photoPaths)

  const stream = receiptArchiveStream({
    receipts: data.receipts,
    organize,
    from: meta.from,
    to: meta.to,
    scopeLabel: meta.scopeLabel,
    generatedAt,
    photoPaths,
    documents: { pdf, xlsx },
    readPhoto: async (receiptId) => {
      const pathname = imagePathnames.get(receiptId)
      if (!pathname) return null
      try {
        const result = await get(pathname, { access: "private" })
        if (!result || result.statusCode !== 200) return null
        return new Uint8Array(await new Response(result.stream).arrayBuffer())
      } catch (error) {
        console.error("receipt photo read failed for export", error)
        return null
      }
    },
  })

  return new Response(stream, {
    headers: downloadHeaders("application/zip", exportFileName(data, "zip")),
  })
}
