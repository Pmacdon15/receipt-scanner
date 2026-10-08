import type { Metadata } from "next"
import { Suspense } from "react"

import { ReceiptSearch } from "@/components/search/receipt-search"
import { SearchSkeleton } from "@/components/search/search-skeleton"
import { loadSearchPage } from "@/lib/dal/search-page"
import type { RawSearchParams } from "@/lib/search-params"

export const metadata: Metadata = {
  title: "Search",
  description: "Find receipts by type, merchant, date, or amount.",
}

// Cache Components (#17): not async, no await. The page starts the load and
// hands the promise to the client, which unwraps it with use() under Suspense.
// The frame and heading are in the static shell, and navigations inside a
// transition keep the current results on screen (plus any optimistic ones)
// instead of falling back to the skeleton.
export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const data = loadSearchPage(searchParams)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-semibold text-3xl tracking-tight">Search receipts</h1>

      <Suspense fallback={<SearchSkeleton />}>
        <ReceiptSearch data={data} />
      </Suspense>
    </div>
  )
}
