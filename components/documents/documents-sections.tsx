import { LockIcon, TriangleAlertIcon } from "lucide-react"
import { Suspense } from "react"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import {
  DownloadsSkeleton,
  FiltersSkeleton,
  ReportSkeleton,
  SummarySkeleton,
} from "@/components/documents/documents-skeleton"
import { DownloadPanel } from "@/components/documents/download-panel"
import { PeriodFilters } from "@/components/documents/period-filters"
import { ReportView } from "@/components/documents/report-view"
import { Button } from "@/components/ui/button"
import type { ReceiptExport } from "@/lib/dal/receipts"
import { EXPORT_LIMIT } from "@/lib/db/receipts"
import { periodPresets } from "@/lib/documents/periods"
import { ARCHIVE_PHOTO_LIMIT } from "@/lib/documents/receipt-archive"
import {
  buildReport,
  describePeriod,
  formatCurrencyTotals,
} from "@/lib/documents/report"
import { searchQueryString } from "@/lib/search-params"

// The request-time parts of /documents. Nothing here is async and nothing
// awaits: each region resolves the promise it needs inline with .then()
// inside its own <Suspense>, so only that region waits.

/** Everything below the heading for a signed-in viewer. */
export function DocumentsBody({ data }: { data: Promise<ReceiptExport> }) {
  const report = data.then((d) => buildReport(d.receipts))
  const scopeLabel = data.then((d) =>
    d.scope === "org" && d.org ? d.org.name : "My receipts"
  )

  return (
    <>
      <div className="mt-2 print:hidden">
        <Suspense fallback={<SummarySkeleton />}>
          {Promise.all([data, report, scopeLabel]).then(([d, r, label]) => (
            <p className="text-pretty text-muted-foreground">
              {label} ·{" "}
              {describePeriod(d.params.purchasedFrom, d.params.purchasedTo)} ·{" "}
              {r.receiptCount} receipt{r.receiptCount === 1 ? "" : "s"}{" "}
              totalling {formatCurrencyTotals(r)}
            </p>
          ))}
        </Suspense>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Suspense fallback={<FiltersSkeleton />}>
          {data.then((d) => (
            <PeriodFilters
              params={d.params}
              // Server UTC date; doesn't follow the user's timezone yet (#22).
              presets={periodPresets(new Date().toISOString().slice(0, 10))}
              org={d.org}
            />
          ))}
        </Suspense>

        <Suspense fallback={null}>
          {data.then((d) => (d.truncated ? <TruncationNotice /> : null))}
        </Suspense>

        <Suspense fallback={<DownloadsSkeleton />}>
          {Promise.all([data, report]).then(([d, r]) => (
            <DownloadPanel
              query={searchQueryString(d.params)}
              receiptCount={r.receiptCount}
              photoCount={r.withPhotoCount}
              photoLimit={ARCHIVE_PHOTO_LIMIT}
            />
          ))}
        </Suspense>

        <Suspense fallback={<ReportSkeleton />}>
          {Promise.all([data, report, scopeLabel]).then(([d, r, label]) => (
            <ReportView
              report={r}
              receipts={d.receipts}
              scopeLabel={label}
              from={d.params.purchasedFrom}
              to={d.params.purchasedTo}
              showUploader={d.scope === "org"}
            />
          ))}
        </Suspense>
      </div>
    </>
  )
}

function TruncationNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200 print:hidden">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      More than {EXPORT_LIMIT.toLocaleString("en-CA")} receipts match, so this
      shows the first {EXPORT_LIMIT.toLocaleString("en-CA")}. Pick a shorter
      date range to cover the rest.
    </p>
  )
}

export function SignedOutPrompt() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h2 className="mt-5 font-semibold text-2xl tracking-tight">
        Sign in to see your documents
      </h2>
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
