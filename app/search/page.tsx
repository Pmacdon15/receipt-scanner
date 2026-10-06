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

// Deliberately not async: the page starts the load and hands the promise to
// the client, which unwraps it with use() under Suspense. The shell streams
// immediately, and navigations inside a transition keep the current results
// on screen (plus any optimistic ones) instead of falling back to the skeleton.
export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const data = loadSearchPage(searchParams)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <Suspense fallback={<SearchSkeleton />}>
        <ReceiptSearch data={data} />
      </Suspense>
    </div>
  )
}
