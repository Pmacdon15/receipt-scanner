/**
 * The receipt spreadsheet (.xlsx): a summary sheet, one row per receipt, and
 * one row per category share. Takes the same query string as /documents.
 * With `?photos=month|category|none` (the photo ZIP asks for it), the Photo
 * column names each receipt's file inside that archive.
 */

import { auth } from "@clerk/nextjs/server"
import type { NextRequest } from "next/server"

import { getReceiptExport } from "@/lib/dal/receipts"
import {
  downloadHeaders,
  exportFileName,
  exportParamsFrom,
  queryValue,
  reportMeta,
  responseBody,
  timeZoneFrom,
} from "@/lib/documents/export-request"
import {
  archivePhotoPaths,
  parseOrganize,
} from "@/lib/documents/receipt-archive"
import { buildReportXlsx } from "@/lib/documents/report-xlsx"
import { XLSX_CONTENT_TYPE } from "@/lib/documents/xlsx"

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const data = await getReceiptExport(exportParamsFrom(request))
  const photos = queryValue(request, "photos")
  const photoPaths = photos
    ? archivePhotoPaths(data.receipts, parseOrganize(photos))
    : undefined
  const xlsx = buildReportXlsx(
    data.receipts,
    reportMeta(data, new Date(), timeZoneFrom(request)),
    photoPaths
  )

  return new Response(responseBody(xlsx), {
    headers: downloadHeaders(XLSX_CONTENT_TYPE, exportFileName(data, "xlsx"), {
      length: xlsx.byteLength,
    }),
  })
}
