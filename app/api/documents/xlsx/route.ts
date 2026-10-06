/**
 * The receipt spreadsheet (.xlsx): a summary sheet, one row per receipt, and
 * one row per category share. Takes the same query string as /documents.
 */

import { auth } from "@clerk/nextjs/server"
import type { NextRequest } from "next/server"

import { getReceiptExport } from "@/lib/dal/receipts"
import {
  downloadHeaders,
  exportFileName,
  exportParamsFrom,
  reportMeta,
  responseBody,
} from "@/lib/documents/export-request"
import { buildReportXlsx } from "@/lib/documents/report-xlsx"
import { XLSX_CONTENT_TYPE } from "@/lib/documents/xlsx"

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const data = await getReceiptExport(exportParamsFrom(request))
  const xlsx = buildReportXlsx(data.receipts, reportMeta(data, new Date()))

  return new Response(responseBody(xlsx), {
    headers: downloadHeaders(XLSX_CONTENT_TYPE, exportFileName(data, "xlsx"), {
      length: xlsx.byteLength,
    }),
  })
}
