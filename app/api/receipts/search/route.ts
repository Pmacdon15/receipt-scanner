/**
 * Receipt search for the client: the search box's autocomplete, and any
 * search the browser fetches itself (prefetching the next page, refreshing the
 * cached default view).
 *
 * route → DAL (searchReceiptsWithSuggestions) → db. The DAL is the auth gate:
 * every read goes through requireUserId, and a signed-out caller surfaces here
 * as UnauthorizedError → 401. Query params are parsed with the same lenient
 * schema as the /search page, so the page and this route always agree on what
 * a URL means.
 */

import type { NextRequest } from "next/server"

import {
  searchReceiptsWithSuggestions,
  UnauthorizedError,
} from "@/lib/dal/receipts"
import { parseSearchParams, rawSearchParamsFrom } from "@/lib/search-params"

// Per-user data: never let a shared cache or the browser's HTTP cache hold it.
// Client-side caching is TanStack Query's job, keyed by user and org.
const PRIVATE = { "Cache-Control": "private, no-store" }

export async function GET(request: NextRequest) {
  const params = parseSearchParams(
    rawSearchParamsFrom(new URL(request.url).searchParams)
  )

  try {
    const data = await searchReceiptsWithSuggestions(params)
    return Response.json(data, { headers: PRIVATE })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Sign in to search receipts." },
        { status: 401, headers: PRIVATE }
      )
    }
    console.error("receipt search failed", error)
    return Response.json(
      { error: "Search is not available right now. Try again." },
      { status: 500, headers: PRIVATE }
    )
  }
}
