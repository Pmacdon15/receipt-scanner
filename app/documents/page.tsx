import { auth } from "@clerk/nextjs/server"
import { LockIcon, TriangleAlertIcon } from "lucide-react"
import type { Metadata } from "next"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import { DownloadPanel } from "@/components/documents/download-panel"
import { PeriodFilters } from "@/components/documents/period-filters"
import { ReportView } from "@/components/documents/report-view"
import { Button } from "@/components/ui/button"
import { getReceiptExport } from "@/lib/dal/receipts"
import { EXPORT_LIMIT } from "@/lib/db/receipts"
import { periodPresets } from "@/lib/documents/periods"
import { ARCHIVE_PHOTO_LIMIT } from "@/lib/documents/receipt-archive"
import {
  buildReport,
  describePeriod,
  formatCurrencyTotals,
} from "@/lib/documents/report"
import type { RawSearchParams } from "@/lib/search-params"
import { parseSearchParams, searchQueryString } from "@/lib/search-params"

export const metadata: Metadata = {
  title: "Documents",
  description:
    "Totals for any period as a printable PDF, a spreadsheet, or a ZIP of every receipt photo.",
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { userId } = await auth()
  if (!userId) return <SignedOutPrompt />

  const data = await getReceiptExport(parseSearchParams(await searchParams))
  const report = buildReport(data.receipts)
  const { params } = data

  const scopeLabel =
    data.scope === "org" && data.org ? data.org.name : "My receipts"
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <header className="flex flex-col gap-2 print:hidden">
        <h1 className="font-semibold text-3xl tracking-tight">Documents</h1>
        <p className="text-pretty text-muted-foreground">
          {scopeLabel} ·{" "}
          {describePeriod(params.purchasedFrom, params.purchasedTo)} ·{" "}
          {report.receiptCount} receipt{report.receiptCount === 1 ? "" : "s"}{" "}
          totalling {formatCurrencyTotals(report)}
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        <PeriodFilters
          params={params}
          presets={periodPresets(today)}
          org={data.org}
        />

        {data.truncated && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200 print:hidden">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            More than {EXPORT_LIMIT.toLocaleString("en-CA")} receipts match, so
            this shows the first {EXPORT_LIMIT.toLocaleString("en-CA")}. Pick a
            shorter date range to cover the rest.
          </p>
        )}

        <DownloadPanel
          query={searchQueryString(params)}
          receiptCount={report.receiptCount}
          photoCount={report.withPhotoCount}
          photoLimit={ARCHIVE_PHOTO_LIMIT}
        />

        <ReportView
          report={report}
          receipts={data.receipts}
          scopeLabel={scopeLabel}
          from={params.purchasedFrom}
          to={params.purchasedTo}
          showUploader={data.scope === "org"}
        />
      </div>
    </div>
  )
}

function SignedOutPrompt() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h1 className="mt-5 font-semibold text-2xl tracking-tight">
        Sign in to see your documents
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        Reports and downloads are built from your private receipts, so this page
        needs you signed in.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <ReturnSignInButton>
          <Button variant="outline" className="w-full sm:w-auto">
            Sign in
          </Button>
        </ReturnSignInButton>
        <ReturnSignUpButton>
          <Button className="w-full sm:w-auto">Create an account</Button>
        </ReturnSignUpButton>
      </div>
    </div>
  )
}
