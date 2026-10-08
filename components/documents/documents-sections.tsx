import { TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import { DownloadPanel } from "@/components/documents/download-panel"
import { PeriodFilters } from "@/components/documents/period-filters"
import { ReportView } from "@/components/documents/report-view"
import type { ReceiptExport } from "@/lib/dal/receipts"
import { EXPORT_LIMIT } from "@/lib/db/receipts"
import { periodPresets } from "@/lib/documents/periods"
import { ARCHIVE_PHOTO_LIMIT } from "@/lib/documents/receipt-archive"
import {
  describePeriod,
  formatCurrencyTotals,
  type ReceiptReport,
} from "@/lib/documents/report"
import { searchQueryString } from "@/lib/search-params"

// The pieces of /documents that need request data. The page never awaits:
// it hands each of these the promises it needs, and each sits in its own
// Suspense boundary, so only the part that reads a promise waits on it.

/** Renders children when signed in, otherwise `signedOut`. */
export async function SignedInOnly({
  signedIn,
  signedOut,
  children,
}: {
  signedIn: Promise<boolean>
  signedOut: ReactNode
  children: ReactNode
}) {
  return (await signedIn) ? children : signedOut
}

export async function DocumentsSummary({
  data,
  report,
  scopeLabel,
}: {
  data: Promise<ReceiptExport>
  report: Promise<ReceiptReport>
  scopeLabel: Promise<string>
}) {
  const [{ params }, r, label] = await Promise.all([data, report, scopeLabel])

  return (
    <p className="text-pretty text-muted-foreground">
      {label} · {describePeriod(params.purchasedFrom, params.purchasedTo)} ·{" "}
      {r.receiptCount} receipt{r.receiptCount === 1 ? "" : "s"} totalling{" "}
      {formatCurrencyTotals(r)}
    </p>
  )
}

export async function DocumentsFilters({
  data,
}: {
  data: Promise<ReceiptExport>
}) {
  const { params, org } = await data
  // Server UTC date; doesn't follow the user's timezone yet (see #22).
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PeriodFilters params={params} presets={periodPresets(today)} org={org} />
  )
}

export async function TruncationNotice({
  data,
}: {
  data: Promise<ReceiptExport>
}) {
  if (!(await data).truncated) return null

  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200 print:hidden">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      More than {EXPORT_LIMIT.toLocaleString("en-CA")} receipts match, so this
      shows the first {EXPORT_LIMIT.toLocaleString("en-CA")}. Pick a shorter
      date range to cover the rest.
    </p>
  )
}

export async function DocumentsDownloads({
  data,
  report,
}: {
  data: Promise<ReceiptExport>
  report: Promise<ReceiptReport>
}) {
  const [{ params }, r] = await Promise.all([data, report])

  return (
    <DownloadPanel
      query={searchQueryString(params)}
      receiptCount={r.receiptCount}
      photoCount={r.withPhotoCount}
      photoLimit={ARCHIVE_PHOTO_LIMIT}
    />
  )
}

export async function DocumentsReport({
  data,
  report,
  scopeLabel,
}: {
  data: Promise<ReceiptExport>
  report: Promise<ReceiptReport>
  scopeLabel: Promise<string>
}) {
  const [d, r, label] = await Promise.all([data, report, scopeLabel])

  return (
    <ReportView
      report={r}
      receipts={d.receipts}
      scopeLabel={label}
      from={d.params.purchasedFrom}
      to={d.params.purchasedTo}
      showUploader={d.scope === "org"}
    />
  )
}
