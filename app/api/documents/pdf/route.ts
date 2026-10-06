/**
 * The printable PDF report for the documents page: totals by category and
 * month, then every receipt. Takes the same query string as /documents.
 * `?disposition=inline` opens it in the browser's viewer (to print) instead of
 * downloading it.
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
} from "@/lib/documents/export-request"
import { buildReportPdf } from "@/lib/documents/report-pdf"

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const data = await getReceiptExport(exportParamsFrom(request))
  const pdf = await buildReportPdf(data.receipts, reportMeta(data, new Date()))

  return new Response(responseBody(pdf), {
    headers: downloadHeaders("application/pdf", exportFileName(data, "pdf"), {
      inline: queryValue(request, "disposition") === "inline",
      length: pdf.byteLength,
    }),
  })
}
