import { auth } from "@clerk/nextjs/server"
import { LockIcon } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import {
  DocumentsDownloads,
  DocumentsFilters,
  DocumentsReport,
  DocumentsSummary,
  SignedInOnly,
  TruncationNotice,
} from "@/components/documents/documents-sections"
import {
  DocumentsSkeleton,
  DownloadsSkeleton,
  FiltersSkeleton,
  ReportSkeleton,
  SummarySkeleton,
} from "@/components/documents/documents-skeleton"
import { Button } from "@/components/ui/button"
import { getReceiptExport, type ReceiptExport } from "@/lib/dal/receipts"
import { buildReport } from "@/lib/documents/report"
import type { RawSearchParams } from "@/lib/search-params"
import { parseSearchParams } from "@/lib/search-params"

export const metadata: Metadata = {
  title: "Documents",
  description:
    "Totals for any period as a printable PDF, a spreadsheet, or a ZIP of every receipt photo.",
}

// Deliberately not async and no awaits (Cache Components, #17). The page only
// builds promises with .then() and passes them down; each component that
// reads one sits in its own Suspense boundary, so the static parts land in
// the prerendered shell and only the data-dependent pieces stream in.
export default function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const signedIn = auth().then(({ userId }) => userId !== null)

  // Only load when signed in. Signed out, nothing below the gate renders, so
  // the data promise is left pending instead of rejecting unobserved.
  const data: Promise<ReceiptExport> = signedIn.then((ok) =>
    ok
      ? searchParams.then(parseSearchParams).then(getReceiptExport)
      : new Promise<never>(() => {})
  )
  const report = data.then((d) => buildReport(d.receipts))
  const scopeLabel = data.then((d) =>
    d.scope === "org" && d.org ? d.org.name : "My receipts"
  )

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <DocumentsSkeleton />
        </div>
      }
    >
      <SignedInOnly signedIn={signedIn} signedOut={<SignedOutPrompt />}>
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 print:max-w-none print:p-0">
          <header className="flex flex-col gap-2 print:hidden">
            <h1 className="font-semibold text-3xl tracking-tight">Documents</h1>
            <Suspense fallback={<SummarySkeleton />}>
              <DocumentsSummary
                data={data}
                report={report}
                scopeLabel={scopeLabel}
              />
            </Suspense>
          </header>

          <div className="mt-6 flex flex-col gap-6">
            <Suspense fallback={<FiltersSkeleton />}>
              <DocumentsFilters data={data} />
            </Suspense>

            <Suspense fallback={null}>
              <TruncationNotice data={data} />
            </Suspense>

            <Suspense fallback={<DownloadsSkeleton />}>
              <DocumentsDownloads data={data} report={report} />
            </Suspense>

            <Suspense fallback={<ReportSkeleton />}>
              <DocumentsReport
                data={data}
                report={report}
                scopeLabel={scopeLabel}
              />
            </Suspense>
          </div>
        </div>
      </SignedInOnly>
    </Suspense>
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
