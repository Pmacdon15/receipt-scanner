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

// Builds a /search URL from the current params plus changes. Any change other
// than the page number sends the user back to page 1.
export function searchHref(
  current: ReceiptSearchParams,
  changes: Partial<ReceiptSearchParams> = {}
): string {
  const next = { ...current, ...changes }
  if (!("page" in changes)) next.page = undefined

  const params = new URLSearchParams()
  if (next.scope === "org") params.set("scope", "org")
  if (next.query) params.set("q", next.query)
  for (const type of next.receiptTypes ?? []) params.append("type", type)
  if (next.purchasedFrom) params.set("from", next.purchasedFrom)
  if (next.purchasedTo) params.set("to", next.purchasedTo)
  const min = centsToInput(next.minTotalCents)
  if (min) params.set("min", min)
  const max = centsToInput(next.maxTotalCents)
  if (max) params.set("max", max)
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort)
  if (next.page && next.page > 1) params.set("page", String(next.page))

  const query = params.toString()
  return query ? `/search?${query}` : "/search"
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
