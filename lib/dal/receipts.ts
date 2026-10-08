import { auth, clerkClient } from "@clerk/nextjs/server"
import { cache } from "react"

import { classifyReceiptSafely } from "@/lib/classify-receipt"
import {
  deleteReceipt,
  insertReceipt,
  type ReceiptListRow,
  type ReceiptOwner,
  type ReceiptScope,
  type ReceiptTotals,
  type ReceiptTypeFacet,
  searchReceipts as searchReceiptRows,
  selectMerchantSuggestions,
  selectReceiptById,
  selectReceipts,
  selectReceiptsForExport,
  selectReceiptTotals,
  selectVisibleReceiptImage,
  updateReceiptSplits,
  updateReceiptType,
} from "@/lib/db/receipts"
import { formatMoney } from "@/lib/money"
import { isOwnReceiptImagePathname } from "@/lib/receipt-image"
import {
  FALLBACK_RECEIPT_TYPE,
  isReceiptTypeId,
  type ReceiptTypeId,
} from "@/lib/receipt-types"
import {
  firstErrorMessage,
  type NewReceipt,
  newReceiptSchema,
  primarySplitType,
  type ReceiptSort,
  type ReceiptSplit,
  receiptIdSchema,
  receiptSplitsSchema,
  receiptTypeIdSchema,
  type SearchScope,
  type SuggestReceiptTypeInput,
  suggestReceiptTypeInputSchema,
  sumSplits,
} from "@/lib/schemas"

export type { NewReceipt, ReceiptSplit, SearchScope }

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in.")
    this.name = "UnauthorizedError"
  }
}

// Input that failed schema validation at the DAL boundary. The message is
// safe to show to the user.
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidInputError"
  }
}

// Every export below goes through this, so no query reaches the database
// without a user id scoping it. Exported because the scan action needs the id
// to check a submitted blob pathname against the caller's own folder.
export const requireUserId = cache(async (): Promise<string> => {
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
  return userId
})

// The organization the user has active in Clerk, if any. Receipts saved while
// it is active are shared with its members.
const getActiveOrgId = cache(async (): Promise<string | null> => {
  const { orgId } = await auth()
  return orgId ?? null
})

export type Receipt = {
  id: string
  userId: string
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
  /**
   * How the total is divided across categories, largest first as saved, or
   * null when the whole receipt is one category (receiptType).
   */
  splits: ReceiptSplit[] | null
  notes: string | null
  /** True when a photo was scanned for this receipt. */
  hasImage: boolean
  createdAt: string
}

function toReceipt(row: ReceiptListRow): Receipt {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    merchant: row.merchant,
    purchasedOn: row.purchased_on,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    receiptType: isReceiptTypeId(row.receipt_type)
      ? row.receipt_type
      : FALLBACK_RECEIPT_TYPE,
    typeSource: row.type_source,
    detectedType: isReceiptTypeId(row.detected_type) ? row.detected_type : null,
    detectedConfidence: row.detected_confidence,
    splits: readSplits(row.splits),
    notes: row.notes,
    hasImage: row.has_image,
    createdAt: row.created_at,
  }
}

// A stored split that no longer parses (a category was renamed, say) is shown
// as an unsplit receipt rather than breaking the page.
function readSplits(value: unknown): ReceiptSplit[] | null {
  if (value == null) return null
  const parsed = receiptSplitsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const getReceipts = cache(
  async (options: { limit?: number; receiptType?: ReceiptTypeId } = {}) => {
    const userId = await requireUserId()
    const rows = await selectReceipts(userId, options)
    return rows.map(toReceipt)
  }
)

export const getReceipt = cache(async (id: string) => {
  const userId = await requireUserId()
  if (!receiptIdSchema.safeParse(id).success) return null
  const row = await selectReceiptById(userId, id)
  if (!row) return null

  // This is the one read that carries image_url. Narrow it to the shared shape
  // so the blob pathname is not handed to a client component by accident;
  // callers that want the photo should reach for getReceiptImage.
  const { image_url, ...rest } = row
  return toReceipt({ ...rest, has_image: image_url !== null })
})

/**
 * The blob pathname of the receipt's scanned photo, or null when it has none.
 *
 * Scoped to what the signed-in user can already see in search: their own
 * receipts, plus any saved into their active organization. That is what makes
 * it safe for the image route to serve whatever comes back: any other receipt
 * reads as missing here.
 */
export const getReceiptImage = cache(async (id: string) => {
  const userId = await requireUserId()
  const orgId = await getActiveOrgId()
  if (!receiptIdSchema.safeParse(id).success) return null
  return selectVisibleReceiptImage(userId, orgId, id)
})

export const getReceiptTotals = cache(async (): Promise<ReceiptTotals> => {
  const userId = await requireUserId()
  return selectReceiptTotals(userId)
})

export async function createReceipt(raw: NewReceipt): Promise<Receipt> {
  const userId = await requireUserId()
  const orgId = await getActiveOrgId()

  // Re-checked here so nothing reaches insertReceipt unvalidated, whichever
  // caller it came from.
  const parsed = newReceiptSchema.safeParse(raw)
  if (!parsed.success) {
    throw new InvalidInputError(
      firstErrorMessage(parsed.error, "That receipt is not valid.")
    )
  }
  const input = parsed.data

  // Belt and braces behind the action's own check: the pathname is only ever
  // user input, and this is the chokepoint that knows whose receipt it is.
  if (
    input.imageUrl != null &&
    !isOwnReceiptImagePathname(input.imageUrl, userId)
  ) {
    throw new InvalidInputError(
      "Refusing to attach a photo outside the user's folder."
    )
  }

  // A guess made before saving (reading the photo) beats the keyword one.
  const detected =
    input.detected ??
    classifyReceiptSafely({
      merchant: input.merchant,
      rawText: input.rawText,
    })

  // A split is filed under its largest category. Otherwise a type the user
  // picked wins; either way the detected guess is still stored so the UI can
  // show what detection would have chosen.
  const splits = input.splits ?? null
  const userPicked = splits !== null || input.receiptType !== undefined
  const chosenType = splits ? primarySplitType(splits) : input.receiptType

  const row = await insertReceipt(userId, {
    orgId,
    merchant: input.merchant,
    purchasedOn: input.purchasedOn,
    currency: input.currency,
    subtotalCents: input.subtotalCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    receiptType: chosenType ?? detected.type,
    typeSource: userPicked ? "user" : "auto",
    detectedType: detected.confidence > 0 ? detected.type : null,
    detectedConfidence: detected.confidence > 0 ? detected.confidence : null,
    splits,
    rawText: input.rawText,
    imageUrl: input.imageUrl ?? null,
    notes: input.notes,
  })

  return toReceipt(row)
}

export async function setReceiptType(
  id: string,
  receiptType: ReceiptTypeId
): Promise<Receipt | null> {
  const userId = await requireUserId()
  if (!receiptIdSchema.safeParse(id).success) return null
  if (!receiptTypeIdSchema.safeParse(receiptType).success) {
    throw new InvalidInputError("Unknown receipt type.")
  }
  const row = await updateReceiptType(userId, id, receiptType)
  return row ? toReceipt(row) : null
}

/**
 * Changes how a saved receipt is divided across categories — correcting what
 * the photo reader detected, or splitting a receipt saved as one category.
 */
export async function setReceiptSplits(
  id: string,
  splits: ReceiptSplit[]
): Promise<Receipt | null> {
  const userId = await requireUserId()
  if (!receiptIdSchema.safeParse(id).success) return null

  const parsed = receiptSplitsSchema.safeParse(splits)
  if (!parsed.success) {
    throw new InvalidInputError(
      firstErrorMessage(parsed.error, "That split is not valid.")
    )
  }

  const row = await updateReceiptSplits(
    userId,
    id,
    parsed.data,
    primarySplitType(parsed.data)
  )
  if (row) return toReceipt(row)

  // Nothing updated: either the receipt is not theirs, or the parts do not
  // add up to its total. Tell those apart only for the user's own receipt.
  const existing = await selectReceiptById(userId, id)
  if (!existing) return null
  throw new InvalidInputError(
    `The split adds up to ${formatMoney(sumSplits(parsed.data), existing.currency)} but the receipt total is ${formatMoney(existing.total_cents, existing.currency)}.`
  )
}

/**
 * Deletes the signed-in user's receipt. Returns whose it was, for expiring the
 * cache, or null when it is not theirs (or does not exist).
 */
export async function removeReceipt(id: string): Promise<ReceiptOwner | null> {
  const userId = await requireUserId()
  if (!receiptIdSchema.safeParse(id).success) return null
  return deleteReceipt(userId, id)
}

// Exposed so the scan form can preview a guess before anything is saved.
export async function suggestReceiptType(input: SuggestReceiptTypeInput) {
  await requireUserId()
  const parsed = suggestReceiptTypeInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new InvalidInputError(
      firstErrorMessage(parsed.error, "That text is too long to check.")
    )
  }
  return classifyReceiptSafely(parsed.data)
}

export type ReceiptSearchParams = {
  scope: SearchScope
  query?: string
  receiptTypes?: ReceiptTypeId[]
  purchasedFrom?: string
  purchasedTo?: string
  minTotalCents?: number
  maxTotalCents?: number
  sort?: ReceiptSort
  page?: number
  pageSize?: number
}

export type SearchedReceipt = Receipt & {
  isMine: boolean
  uploadedBy: string
}

export type ReceiptSearchResults = {
  // The scope actually searched: "org" falls back to "mine" when no
  // organization is active, so the page never shows another org's data.
  scope: SearchScope
  org: { id: string; name: string } | null
  receipts: SearchedReceipt[]
  matchCount: number
  matchTotalCents: number
  typeFacets: ReceiptTypeFacet[]
  page: number
  pageCount: number
  pageSize: number
}

// "org" falls back to "mine" when no organization is active, so a search never
// reaches another organization's receipts.
async function resolveSearchScope(requested: SearchScope) {
  const userId = await requireUserId()
  const orgId = await getActiveOrgId()
  const where: ReceiptScope =
    requested === "org" && orgId
      ? { kind: "org", orgId }
      : { kind: "user", userId }
  const scope: SearchScope = where.kind === "org" ? "org" : "mine"
  return { userId, orgId, scope, where }
}

export const searchReceipts = cache(
  async (params: ReceiptSearchParams): Promise<ReceiptSearchResults> => {
    const { userId, orgId, scope, where } = await resolveSearchScope(
      params.scope
    )
    const pageSize = clampInt(params.pageSize, 25, 1, 100)
    const page = clampInt(params.page, 1, 1, 10_000)

    const result = await searchReceiptRows(where, {
      query: params.query,
      receiptTypes: params.receiptTypes,
      purchasedFrom: params.purchasedFrom,
      purchasedTo: params.purchasedTo,
      minTotalCents: params.minTotalCents,
      maxTotalCents: params.maxTotalCents,
      sort: params.sort,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })

    const receipts = result.rows.map(toReceipt)
    const names =
      scope === "org"
        ? await getUserNames(receipts.map((r) => r.userId))
        : new Map<string, string>()

    return {
      scope,
      org: orgId ? { id: orgId, name: await getOrgName(orgId) } : null,
      receipts: receipts.map((r) => ({
        ...r,
        isMine: r.userId === userId,
        uploadedBy:
          r.userId === userId ? "You" : (names.get(r.userId) ?? "A teammate"),
      })),
      matchCount: result.matchCount,
      matchTotalCents: result.matchTotalCents,
      typeFacets: result.typeFacets,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.matchCount / pageSize)),
    }
  }
)

export type MerchantSuggestion = {
  merchant: string
  receiptCount: number
}

export type ReceiptSearchWithSuggestions = ReceiptSearchResults & {
  suggestions: MerchantSuggestion[]
}

/**
 * A full page of search results plus merchant suggestions for the query.
 *
 * Backs the search box's autocomplete (via /api/receipts/search). It returns
 * the same result shape the page renders, so whatever the autocomplete has
 * already fetched can be shown straight away when that search is submitted.
 */
export async function searchReceiptsWithSuggestions(
  params: ReceiptSearchParams
): Promise<ReceiptSearchWithSuggestions> {
  const { where } = await resolveSearchScope(params.scope)
  const query = params.query?.trim() ?? ""

  const [results, suggestions] = await Promise.all([
    searchReceipts(params),
    query ? selectMerchantSuggestions(where, query) : Promise.resolve([]),
  ])

  return {
    ...results,
    suggestions: suggestions.map((s) => ({
      merchant: s.merchant,
      receiptCount: s.receipt_count,
    })),
  }
}

export type ExportedReceipt = SearchedReceipt

export type ReceiptExport = {
  /** The scope actually exported ("org" falls back to "mine", as in search). */
  scope: SearchScope
  org: { id: string; name: string } | null
  /** The filters actually applied, with the scope narrowed if it was. */
  params: ReceiptSearchParams
  receipts: ExportedReceipt[]
  /** More receipts matched than one export holds (see EXPORT_LIMIT). */
  truncated: boolean
}

/**
 * Every receipt the documents page and its downloads cover: the same filters
 * and the same scope rules as search, without paging.
 */
export const getReceiptExport = cache(
  async (params: ReceiptSearchParams): Promise<ReceiptExport> => {
    const { userId, orgId, scope, where } = await resolveSearchScope(
      params.scope
    )

    const result = await selectReceiptsForExport(where, {
      query: params.query,
      receiptTypes: params.receiptTypes,
      purchasedFrom: params.purchasedFrom,
      purchasedTo: params.purchasedTo,
      minTotalCents: params.minTotalCents,
      maxTotalCents: params.maxTotalCents,
    })

    const receipts = result.rows.map(toReceipt)
    const names =
      scope === "org"
        ? await getUserNames(receipts.map((r) => r.userId))
        : new Map<string, string>()

    return {
      scope,
      org: orgId ? { id: orgId, name: await getOrgName(orgId) } : null,
      params: { ...params, scope, sort: undefined, page: undefined },
      receipts: receipts.map((r) => ({
        ...r,
        isMine: r.userId === userId,
        uploadedBy:
          r.userId === userId ? "You" : (names.get(r.userId) ?? "A teammate"),
      })),
      truncated: result.truncated,
    }
  }
)

function clampInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

// Names are display-only, so a Clerk hiccup falls back to generic labels
// rather than failing the search.
async function getUserNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()

  try {
    const client = await clerkClient()
    const { data } = await client.users.getUserList({
      userId: unique,
      limit: unique.length,
    })
    return new Map(
      data.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.username ||
          u.primaryEmailAddress?.emailAddress ||
          "A teammate",
      ])
    )
  } catch (error) {
    console.error("could not load uploader names", error)
    return new Map()
  }
}

const getOrgName = cache(async (orgId: string): Promise<string> => {
  try {
    const client = await clerkClient()
    const org = await client.organizations.getOrganization({
      organizationId: orgId,
    })
    return org.name
  } catch (error) {
    console.error("could not load organization name", error)
    return "Your organization"
  }
})
