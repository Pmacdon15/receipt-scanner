import { getSql } from "./client"
import type { ReceiptTypeId } from "@/lib/receipt-types"
import type { ReceiptSort, ReceiptSplit } from "@/lib/schemas"

export type { ReceiptSort }

export type ReceiptRow = {
  id: string
  user_id: string
  org_id: string | null
  merchant: string
  purchased_on: string | null
  currency: string
  subtotal_cents: number | null
  tax_cents: number | null
  total_cents: number
  receipt_type: ReceiptTypeId
  type_source: "user" | "auto"
  detected_type: ReceiptTypeId | null
  detected_confidence: number | null
  /** Per-category amounts when the receipt is split; null for one category. */
  splits: ReceiptSplit[] | null
  raw_text: string | null
  /** Vercel Blob pathname of the scanned photo, or null when there is none. */
  image_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * A receipt without its image pathname.
 *
 * image_url used to hold the photo itself as a ~900KB data URL, so keeping it
 * out of list queries was about not dragging tens of megabytes out of Postgres.
 * It now holds a short Vercel Blob pathname, and the exclusion stays for a
 * different reason: `has_image` is all the list UI needs, and these rows are
 * handed to client components, so narrowing here keeps the storage key for
 * someone's receipt photo out of the page payload. selectReceiptById is still
 * the only read that returns it.
 */
export type ReceiptListRow = Omit<ReceiptRow, "image_url"> & {
  has_image: boolean
}

export type InsertReceiptInput = {
  orgId: string | null
  merchant: string
  purchasedOn: string | null
  currency: string
  subtotalCents: number | null
  taxCents: number | null
  totalCents: number
  receiptType: ReceiptTypeId
  typeSource: "user" | "auto"
  detectedType: ReceiptTypeId | null
  detectedConfidence: number | null
  splits: ReceiptSplit[] | null
  rawText: string | null
  /** Blob pathname from the upload route, or null for a hand-entered receipt. */
  imageUrl?: string | null
  notes: string | null
}

export async function selectReceipts(
  userId: string,
  options: { limit?: number; receiptType?: ReceiptTypeId } = {}
): Promise<ReceiptListRow[]> {
  const sql = getSql()
  const limit = options.limit ?? 50

  const rows = options.receiptType
    ? await sql`
        select
          id, user_id, merchant, purchased_on, currency,
          subtotal_cents, tax_cents, total_cents,
          receipt_type, type_source, detected_type, detected_confidence, splits,
          raw_text, notes, created_at, updated_at,
          image_url is not null as has_image
        from receipts
        where user_id = ${userId} and receipt_type = ${options.receiptType}
        order by purchased_on desc nulls last, created_at desc
        limit ${limit}
      `
    : await sql`
        select
          id, user_id, merchant, purchased_on, currency,
          subtotal_cents, tax_cents, total_cents,
          receipt_type, type_source, detected_type, detected_confidence, splits,
          raw_text, notes, created_at, updated_at,
          image_url is not null as has_image
        from receipts
        where user_id = ${userId}
        order by purchased_on desc nulls last, created_at desc
        limit ${limit}
      `

  return rows as ReceiptListRow[]
}

/** The one query that returns image_url, for showing a single receipt's photo. */
export async function selectReceiptById(
  userId: string,
  id: string
): Promise<ReceiptRow | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from receipts where user_id = ${userId} and id = ${id} limit 1
  `) as ReceiptRow[]

  return rows[0] ?? null
}

/**
 * A receipt's photo pathname when the user may see it: they saved it, or it
 * was saved into their active organization (the same rule the org search
 * uses). Returns only the pathname, so nothing else of a teammate's row leaks.
 */
export async function selectVisibleReceiptImage(
  userId: string,
  orgId: string | null,
  id: string
): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    select image_url from receipts
    where id = ${id}
      and (user_id = ${userId} or (${orgId}::text is not null and org_id = ${orgId}))
    limit 1
  `) as Pick<ReceiptRow, "image_url">[]

  return rows[0]?.image_url ?? null
}

export async function insertReceipt(
  userId: string,
  input: InsertReceiptInput
): Promise<ReceiptListRow> {
  const sql = getSql()
  const rows = (await sql`
    insert into receipts (
      user_id, org_id, merchant, purchased_on, currency,
      subtotal_cents, tax_cents, total_cents,
      receipt_type, type_source, detected_type, detected_confidence, splits,
      raw_text, image_url, notes
    ) values (
      ${userId}, ${input.orgId}, ${input.merchant}, ${input.purchasedOn}, ${input.currency},
      ${input.subtotalCents}, ${input.taxCents}, ${input.totalCents},
      ${input.receiptType}, ${input.typeSource}, ${input.detectedType}, ${input.detectedConfidence},
      ${input.splits === null ? null : JSON.stringify(input.splits)}::jsonb,
      ${input.rawText}, ${input.imageUrl}, ${input.notes}
    )
    returning
      id, user_id, org_id, merchant, purchased_on, currency,
      subtotal_cents, tax_cents, total_cents,
      receipt_type, type_source, detected_type, detected_confidence, splits,
      raw_text, notes, created_at, updated_at,
      image_url is not null as has_image
  `) as ReceiptListRow[]

  return rows[0]
}

export async function updateReceiptType(
  userId: string,
  id: string,
  receiptType: ReceiptTypeId
): Promise<ReceiptListRow | null> {
  const sql = getSql()
  const rows = (await sql`
    update receipts
    set receipt_type = ${receiptType},
        type_source = 'user',
        -- Picking one type for the whole receipt replaces any split.
        splits = null,
        updated_at = now()
    where user_id = ${userId} and id = ${id}
    returning
      id, user_id, merchant, purchased_on, currency,
      subtotal_cents, tax_cents, total_cents,
      receipt_type, type_source, detected_type, detected_confidence, splits,
      raw_text, notes, created_at, updated_at,
      image_url is not null as has_image
  `) as ReceiptListRow[]

  return rows[0] ?? null
}

/**
 * Replaces a receipt's split (and files it under `receiptType`, its largest
 * part). Only updates when the parts add up to the stored total, so a split
 * can never drift from the receipt it belongs to; null means it did not.
 */
export async function updateReceiptSplits(
  userId: string,
  id: string,
  splits: ReceiptSplit[],
  receiptType: ReceiptTypeId
): Promise<ReceiptListRow | null> {
  const sql = getSql()
  const sum = splits.reduce((total, s) => total + s.amountCents, 0)
  const rows = (await sql`
    update receipts
    set splits = ${JSON.stringify(splits)}::jsonb,
        receipt_type = ${receiptType},
        type_source = 'user',
        updated_at = now()
    where user_id = ${userId} and id = ${id} and total_cents = ${sum}
    returning
      id, user_id, org_id, merchant, purchased_on, currency,
      subtotal_cents, tax_cents, total_cents,
      receipt_type, type_source, detected_type, detected_confidence, splits,
      raw_text, notes, created_at, updated_at,
      image_url is not null as has_image
  `) as ReceiptListRow[]

  return rows[0] ?? null
}

export async function deleteReceipt(
  userId: string,
  id: string
): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    delete from receipts where user_id = ${userId} and id = ${id} returning id
  `) as { id: string }[]

  return rows.length > 0
}

export type ReceiptTotals = {
  receipt_count: number
  total_cents: number
  type_count: number
}

export async function selectReceiptTotals(
  userId: string
): Promise<ReceiptTotals> {
  const sql = getSql()
  const rows = (await sql`
    select
      count(*)::int                        as receipt_count,
      coalesce(sum(total_cents), 0)::int   as total_cents,
      count(distinct receipt_type)::int    as type_count
    from receipts
    where user_id = ${userId}
  `) as ReceiptTotals[]

  return rows[0] ?? { receipt_count: 0, total_cents: 0, type_count: 0 }
}

// Whose receipts a search covers. "user" is everything the person saved
// themselves (in any organization); "org" is everything saved into one
// organization, by any member.
export type ReceiptScope =
  { kind: "user"; userId: string } | { kind: "org"; orgId: string }

export type ReceiptSearchFilters = {
  query?: string
  receiptTypes?: ReceiptTypeId[]
  purchasedFrom?: string
  purchasedTo?: string
  minTotalCents?: number
  maxTotalCents?: number
  sort?: ReceiptSort
  limit?: number
  offset?: number
}

const ORDER_BY: Record<ReceiptSort, string> = {
  newest: "purchased_on desc nulls last, created_at desc",
  oldest: "purchased_on asc nulls last, created_at asc",
  highest: "total_cents desc, purchased_on desc nulls last",
  lowest: "total_cents asc, purchased_on desc nulls last",
}

export type ReceiptTypeFacet = {
  receipt_type: string
  receipt_count: number
  total_cents: number
}

export type ReceiptSearchResult = {
  rows: ReceiptListRow[]
  matchCount: number
  matchTotalCents: number
  // Counts per type for every filter except the type filter itself, so the
  // type chips can show what each one would return.
  typeFacets: ReceiptTypeFacet[]
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function scopeClause(scope: ReceiptScope, add: (value: unknown) => string) {
  return scope.kind === "user"
    ? `user_id = ${add(scope.userId)}`
    : `org_id = ${add(scope.orgId)}`
}

// A term that reads as an amount ("12.50", "$7") also matches receipt totals,
// so a search for the total on a receipt finds it.
const AMOUNT_TERM = /^\$?\d{1,7}(?:\.\d{1,2})?$/
const MAX_TERMS = 8

// Splits the query into words. Every word has to match somewhere (merchant,
// notes or receipt text), in any order: "costco gas" finds a Costco receipt
// whose text mentions gas, which a single substring match would miss.
export function searchTerms(query: string | undefined): string[] {
  return (query ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS)
}

function buildWhere(
  scope: ReceiptScope,
  filters: ReceiptSearchFilters,
  { includeTypes }: { includeTypes: boolean }
) {
  const params: unknown[] = []
  const add = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const clauses = [scopeClause(scope, add)]

  for (const term of searchTerms(filters.query)) {
    const pattern = add(`%${escapeLike(term)}%`)
    const matches = [
      `merchant ilike ${pattern}`,
      `notes ilike ${pattern}`,
      `raw_text ilike ${pattern}`,
    ]
    if (AMOUNT_TERM.test(term)) {
      const cents = Math.round(Number(term.replace("$", "")) * 100)
      matches.push(`total_cents = ${add(cents)}`)
    }
    clauses.push(`(${matches.join(" or ")})`)
  }

  if (includeTypes && filters.receiptTypes && filters.receiptTypes.length > 0) {
    // A split receipt matches any of the categories it is split across, not
    // just the one it is filed under.
    const types = add(filters.receiptTypes)
    clauses.push(
      `(receipt_type = any(${types}::text[]) or exists (
         select 1 from jsonb_array_elements(coalesce(splits, '[]'::jsonb)) s
         where s->>'type' = any(${types}::text[])
       ))`
    )
  }

  if (filters.purchasedFrom) {
    clauses.push(`purchased_on >= ${add(filters.purchasedFrom)}::date`)
  }
  if (filters.purchasedTo) {
    clauses.push(`purchased_on <= ${add(filters.purchasedTo)}::date`)
  }
  if (filters.minTotalCents !== undefined) {
    clauses.push(`total_cents >= ${add(filters.minTotalCents)}`)
  }
  if (filters.maxTotalCents !== undefined) {
    clauses.push(`total_cents <= ${add(filters.maxTotalCents)}`)
  }

  return { where: clauses.join(" and "), params }
}

export type MerchantSuggestionRow = {
  merchant: string
  receipt_count: number
}

/**
 * Merchant names for the search box's autocomplete.
 *
 * Matches anywhere in the name, but names that start with what was typed come
 * first, then the merchants with the most receipts. Case variants of the same
 * name ("COSTCO", "Costco") are folded into one suggestion.
 */
export async function selectMerchantSuggestions(
  scope: ReceiptScope,
  query: string,
  limit = 6
): Promise<MerchantSuggestionRow[]> {
  const text = query.trim()
  if (!text) return []

  const sql = getSql()
  const params: unknown[] = []
  const add = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const where = scopeClause(scope, add)
  const contains = add(`%${escapeLike(text)}%`)
  const prefix = add(`${escapeLike(text)}%`)
  const max = Math.min(Math.max(Math.trunc(limit), 1), 20)

  const rows = await sql.query(
    `select min(merchant) as merchant, count(*)::int as receipt_count
     from receipts
     where ${where} and merchant ilike ${contains}
     group by lower(merchant)
     order by bool_or(merchant ilike ${prefix}) desc,
              count(*) desc,
              min(merchant) asc
     limit ${max}`,
    params
  )

  return rows as MerchantSuggestionRow[]
}

export async function searchReceipts(
  scope: ReceiptScope,
  filters: ReceiptSearchFilters = {}
): Promise<ReceiptSearchResult> {
  const sql = getSql()
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  const orderBy = ORDER_BY[filters.sort ?? "newest"]

  const filtered = buildWhere(scope, filters, { includeTypes: true })
  const faceted = buildWhere(scope, filters, { includeTypes: false })

  // Column list and ORDER BY come from fixed strings above; every user value
  // is a bound parameter.
  const [rows, summary, typeFacets] = await Promise.all([
    sql.query(
      `select
         id, user_id, org_id, merchant, purchased_on, currency,
         subtotal_cents, tax_cents, total_cents,
         receipt_type, type_source, detected_type, detected_confidence, splits,
         raw_text, notes, created_at, updated_at,
         image_url is not null as has_image
       from receipts where ${filtered.where}
       order by ${orderBy}
       limit ${limit} offset ${offset}`,
      filtered.params
    ),
    sql.query(
      `select count(*)::int as match_count,
              coalesce(sum(total_cents), 0)::bigint as match_total_cents
       from receipts where ${filtered.where}`,
      filtered.params
    ),
    // A split receipt counts once under each of its categories, with only that
    // category's share of the money.
    sql.query(
      `select facet.facet_type as receipt_type,
              count(*)::int as receipt_count,
              coalesce(sum(facet.facet_cents), 0)::bigint as total_cents
       from receipts
       cross join lateral (
         select s->>'type' as facet_type, (s->>'amountCents')::bigint as facet_cents
         from jsonb_array_elements(splits) s
         where splits is not null
         union all
         select receipt_type, total_cents::bigint
         where splits is null
       ) facet
       where ${faceted.where}
       group by facet.facet_type`,
      faceted.params
    ),
  ])

  const totals = (
    summary as { match_count: number; match_total_cents: string | number }[]
  )[0]

  return {
    rows: rows as ReceiptListRow[],
    matchCount: totals?.match_count ?? 0,
    matchTotalCents: Number(totals?.match_total_cents ?? 0),
    typeFacets: (
      typeFacets as {
        receipt_type: string
        receipt_count: number
        total_cents: string | number
      }[]
    ).map((f) => ({
      receipt_type: f.receipt_type,
      receipt_count: f.receipt_count,
      total_cents: Number(f.total_cents),
    })),
  }
}

/**
 * The most receipts one export covers. A report or download over more than
 * this asks the user to narrow the date range rather than building a file
 * that takes minutes to produce.
 */
export const EXPORT_LIMIT = 5_000

export type ReceiptExportResult = {
  rows: ReceiptListRow[]
  /** True when more receipts matched than EXPORT_LIMIT; rows holds the first ones. */
  truncated: boolean
}

/**
 * Every receipt matching the same filters search uses, oldest first, for the
 * documents page and its downloads.
 *
 * raw_text is left out (it can be 20KB a receipt and no export shows it), and
 * so is image_url, as in every list query: the photo ZIP fetches each photo
 * through the per-receipt image route instead.
 */
export async function selectReceiptsForExport(
  scope: ReceiptScope,
  filters: ReceiptSearchFilters = {}
): Promise<ReceiptExportResult> {
  const sql = getSql()
  const { where, params } = buildWhere(scope, filters, { includeTypes: true })

  // Columns and ORDER BY are fixed strings; every user value is a parameter.
  // One extra row tells a full export apart from a truncated one.
  const rows = (await sql.query(
    `select
       id, user_id, org_id, merchant, purchased_on, currency,
       subtotal_cents, tax_cents, total_cents,
       receipt_type, type_source, detected_type, detected_confidence, splits,
       null::text as raw_text, notes, created_at, updated_at,
       image_url is not null as has_image
     from receipts where ${where}
     order by purchased_on asc nulls last, created_at asc
     limit ${EXPORT_LIMIT + 1}`,
    params
  )) as ReceiptListRow[]

  return {
    rows: rows.slice(0, EXPORT_LIMIT),
    truncated: rows.length > EXPORT_LIMIT,
  }
}
