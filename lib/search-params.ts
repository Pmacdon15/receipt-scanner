import type { ReceiptSearchParams, SearchScope } from "@/lib/dal/receipts"
import type { ReceiptSort } from "@/lib/db/receipts"
import { parseMoneyToCents } from "@/lib/money"
import { isReceiptTypeId, type ReceiptTypeId } from "@/lib/receipt-types"

// The search page keeps all of its state in the URL, so a search can be
// bookmarked, shared with a teammate, and stepped through with the back button.

export type RawSearchParams = Record<string, string | string[] | undefined>

export const SORT_OPTIONS: { id: ReceiptSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "highest", label: "Highest total" },
  { id: "lowest", label: "Lowest total" },
]

const SORT_IDS = new Set<string>(SORT_OPTIONS.map((s) => s.id))
const DATE = /^\d{4}-\d{2}-\d{2}$/

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function first(value: string | string[] | undefined): string {
  return all(value)[0]?.trim() ?? ""
}

function validDate(value: string): string | undefined {
  if (!DATE.test(value)) return undefined
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    ? undefined
    : value
}

function cents(value: string): number | undefined {
  const parsed = parseMoneyToCents(value)
  return parsed === null || parsed < 0 ? undefined : parsed
}

export function parseSearchParams(raw: RawSearchParams): ReceiptSearchParams {
  const receiptTypes = [
    ...new Set(
      all(raw.type)
        .flatMap((t) => t.split(","))
        .filter(isReceiptTypeId)
    ),
  ] as ReceiptTypeId[]

  const sort = first(raw.sort)
  const page = Number(first(raw.page))

  return {
    scope: first(raw.scope) === "org" ? "org" : "mine",
    query: first(raw.q).slice(0, 200) || undefined,
    receiptTypes: receiptTypes.length > 0 ? receiptTypes : undefined,
    purchasedFrom: validDate(first(raw.from)),
    purchasedTo: validDate(first(raw.to)),
    minTotalCents: cents(first(raw.min)),
    maxTotalCents: cents(first(raw.max)),
    sort: SORT_IDS.has(sort) ? (sort as ReceiptSort) : undefined,
    page: Number.isFinite(page) && page > 1 ? page : undefined,
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
