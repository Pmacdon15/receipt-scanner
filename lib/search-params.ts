import type { ReceiptSearchParams } from "@/lib/dal/receipts"
import type { ReceiptTypeId } from "@/lib/receipt-types"
import {
  searchParamsSchema,
  type ReceiptSort,
  type SearchScope,
} from "@/lib/schemas"

// The search page keeps all of its state in the URL, so a search can be
// bookmarked, shared with a teammate, and stepped through with the back button.

export type RawSearchParams = Record<string, string | string[] | undefined>

export const SORT_OPTIONS: { id: ReceiptSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "highest", label: "Highest total" },
  { id: "lowest", label: "Lowest total" },
]

// Every value in the URL is untrusted. searchParamsSchema drops anything
// invalid instead of erroring, so a stale or hand-edited link still works.
export function parseSearchParams(raw: RawSearchParams): ReceiptSearchParams {
  const parsed = searchParamsSchema.safeParse(raw)
  if (!parsed.success) return { scope: "mine" }

  const p = parsed.data
  return {
    scope: p.scope,
    query: p.q,
    receiptTypes: p.type.length > 0 ? p.type : undefined,
    purchasedFrom: p.from,
    purchasedTo: p.to,
    minTotalCents: p.min,
    maxTotalCents: p.max,
    sort: p.sort,
    page: p.page,
  }
}

function centsToInput(value: number | undefined) {
  return value === undefined ? undefined : (value / 100).toFixed(2)
}

// The canonical query string for a set of search params. The page URL, the
// autocomplete API URL and the client-side cache key are all built from this,
// so the same search always lands on the same cache entry.
export function searchQueryString(params: ReceiptSearchParams): string {
  const qs = new URLSearchParams()
  if (params.scope === "org") qs.set("scope", "org")
  const query = params.query?.trim()
  if (query) qs.set("q", query)
  for (const type of [...(params.receiptTypes ?? [])].sort()) {
    qs.append("type", type)
  }
  if (params.purchasedFrom) qs.set("from", params.purchasedFrom)
  if (params.purchasedTo) qs.set("to", params.purchasedTo)
  const min = centsToInput(params.minTotalCents)
  if (min) qs.set("min", min)
  const max = centsToInput(params.maxTotalCents)
  if (max) qs.set("max", max)
  if (params.sort && params.sort !== "newest") qs.set("sort", params.sort)
  if (params.page && params.page > 1) qs.set("page", String(params.page))
  return qs.toString()
}

// Applies changes to the current params. Any change other than the page
// number sends the user back to page 1.
export function nextSearchParams(
  current: ReceiptSearchParams,
  changes: Partial<ReceiptSearchParams> = {}
): ReceiptSearchParams {
  const next = { ...current, ...changes }
  if (!("page" in changes)) next.page = undefined
  return next
}

// Builds a /search URL from the current params plus changes.
export function searchHref(
  current: ReceiptSearchParams,
  changes: Partial<ReceiptSearchParams> = {}
): string {
  const query = searchQueryString(nextSearchParams(current, changes))
  return query ? `/search?${query}` : "/search"
}

// The /search URL for exactly these params (page included).
export function searchPageHref(params: ReceiptSearchParams): string {
  const query = searchQueryString(params)
  return query ? `/search?${query}` : "/search"
}

// The autocomplete route. Same params as the page, same parser on the server.
export function searchApiHref(params: ReceiptSearchParams): string {
  const query = searchQueryString(params)
  return query ? `/api/receipts/search?${query}` : "/api/receipts/search"
}

// URLSearchParams in the shape Next hands a page, so the route handler can
// run the exact same parser as the page.
export function rawSearchParamsFrom(search: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {}
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]
  }
  return raw
}

export function toggleType(
  current: ReceiptSearchParams,
  type: ReceiptTypeId
): ReceiptTypeId[] | undefined {
  const selected = new Set(current.receiptTypes ?? [])
  if (selected.has(type)) selected.delete(type)
  else selected.add(type)
  return selected.size > 0 ? [...selected] : undefined
}

export function hasActiveFilters(params: ReceiptSearchParams) {
  return Boolean(
    params.query ||
      params.receiptTypes?.length ||
      params.purchasedFrom ||
      params.purchasedTo ||
      params.minTotalCents !== undefined ||
      params.maxTotalCents !== undefined
  )
}

export function formValue(params: ReceiptSearchParams) {
  return {
    q: params.query ?? "",
    from: params.purchasedFrom ?? "",
    to: params.purchasedTo ?? "",
    min: centsToInput(params.minTotalCents) ?? "",
    max: centsToInput(params.maxTotalCents) ?? "",
    sort: params.sort ?? "newest",
  }
}

export type { SearchScope }
