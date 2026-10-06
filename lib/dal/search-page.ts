import { auth } from "@clerk/nextjs/server"

import {
  type ReceiptSearchParams,
  type ReceiptSearchResults,
  searchReceipts,
} from "@/lib/dal/receipts"
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params"

/** Who the cached client data belongs to. Part of every search cache key. */
export type SearchViewer = {
  userId: string
  orgId: string | null
}

export type SearchPageData =
  | { status: "signed-out" }
  | {
      status: "ready"
      viewer: SearchViewer
      /** The params actually searched (scope may have been narrowed). */
      params: ReceiptSearchParams
      results: ReceiptSearchResults
    }

/**
 * Everything /search renders on first load.
 *
 * The page does not await this: it hands the promise to the client component,
 * which unwraps it with `use()` inside a Suspense boundary. Signed-out is a
 * value rather than a thrown error so the client can show the sign-in prompt.
 */
export async function loadSearchPage(
  searchParams: Promise<RawSearchParams>
): Promise<SearchPageData> {
  const { userId, orgId } = await auth()
  if (!userId) return { status: "signed-out" }

  const params = parseSearchParams(await searchParams)
  const results = await searchReceipts(params)

  return {
    status: "ready",
    viewer: { userId, orgId: orgId ?? null },
    // The DAL may have narrowed "org" to "mine"; keep the client consistent.
    params: { ...params, scope: results.scope },
    results,
  }
}
