import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { Suspense } from "react"

import {
  DocumentsBody,
  SignedOutPrompt,
} from "@/components/documents/documents-sections"
import { DocumentsBodySkeleton } from "@/components/documents/documents-skeleton"
import { getReceiptExport } from "@/lib/dal/receipts"
import type { RawSearchParams } from "@/lib/search-params"
import { parseSearchParams } from "@/lib/search-params"

export const metadata: Metadata = {
  title: "Documents",
  description:
    "Totals for any period as a printable PDF, a spreadsheet, or a ZIP of every receipt photo.",
}

// Cache Components (#17): not async, no await anywhere on this route. The page
// only chains promises with .then() and resolves them inline inside <Suspense>,
// so the frame and heading are in the static shell and each region streams in
// behind its own fallback.
export default function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <h1 className="font-semibold text-3xl tracking-tight print:hidden">
        Documents
      </h1>

      <Suspense fallback={<DocumentsBodySkeleton />}>
        {auth().then(({ userId }) =>
          userId ? (
            // Started only once we know the viewer is signed in, so a
            // signed-out visit never runs the query.
            <DocumentsBody
              data={searchParams
                .then(parseSearchParams)
                .then(getReceiptExport)}
            />
          ) : (
            <SignedOutPrompt />
          )
        )}
      </Suspense>
    </div>
  )
}
