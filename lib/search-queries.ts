import { queryOptions } from "@tanstack/react-query"

import type {
  ReceiptSearchParams,
  ReceiptSearchResults,
  ReceiptSearchWithSuggestions,
} from "@/lib/dal/receipts"
import type { SearchViewer } from "@/lib/dal/search-page"
import { searchApiHref, searchQueryString } from "@/lib/search-params"

// Client-side cache for receipt searches (TanStack Query).
//
// Keys start with the user and active org, so switching account or
// organization can never show a cached result from the other one. The last
// part is the canonical query string, so the autocomplete, the page's own
// results and prefetched pages all share entries.

export const receiptSearchKeys = {
  all: (viewer: SearchViewer) =>
    ["receipts", viewer.userId, viewer.orgId ?? "personal", "search"] as const,
  search: (viewer: SearchViewer, params: ReceiptSearchParams) =>
    [...receiptSearchKeys.all(viewer), searchQueryString(params)] as const,
}

export class SearchRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "SearchRequestError"
  }
}

export async function fetchReceiptSearch(
  params: ReceiptSearchParams,
  signal?: AbortSignal
): Promise<ReceiptSearchWithSuggestions> {
  const response = await fetch(searchApiHref(params), {
    signal,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new SearchRequestError(
      body?.error ?? "Search failed. Try again.",
      response.status
    )
  }

  return response.json()
}

export function receiptSearchQueryOptions(
  viewer: SearchViewer,
  params: ReceiptSearchParams
) {
  return queryOptions({
    queryKey: receiptSearchKeys.search(viewer, params),
    queryFn: ({ signal }) => fetchReceiptSearch(params, signal),
    // A 401 will not fix itself on retry.
    retry: (count, error) =>
      !(error instanceof SearchRequestError && error.status === 401) &&
      count < 2,
  })
}

/** Server-rendered results in the shape the cache holds. */
export function asCachedSearch(
  results: ReceiptSearchResults
): ReceiptSearchWithSuggestions {
  return { ...results, suggestions: [] }
}
