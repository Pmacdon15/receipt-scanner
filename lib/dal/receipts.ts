import { cache } from "react"
import { auth, clerkClient } from "@clerk/nextjs/server"

import { classifyReceipt } from "@/lib/classify-receipt"
import {
  deleteReceipt,
  insertReceipt,
  selectReceiptById,
  selectReceipts,
  searchReceipts as searchReceiptRows,
  selectReceiptTotals,
  updateReceiptType,
  type ReceiptRow,
  type ReceiptSort,
  type ReceiptTotals,
  type ReceiptTypeFacet,
} from "@/lib/db/receipts"
import {
  FALLBACK_RECEIPT_TYPE,
  isReceiptTypeId,
  type ReceiptTypeId,
} from "@/lib/receipt-types"

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in.")
    this.name = "UnauthorizedError"
  }
}

// Every export below goes through this, so no query reaches the database
// without a user id scoping it.
const requireUserId = cache(async (): Promise<string> => {
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
    notes: row.notes,
    hasImage: row.has_image,
    createdAt: row.created_at,
  }
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
  const row = await selectReceiptById(userId, id)
  if (!row) return null

  // This is the one read that carries image_url. Narrow it to the shared shape
  // so the data URL is not handed to a client component by accident; callers
  // that want the photo should reach for getReceiptImage.
  const { image_url, ...rest } = row
  return toReceipt({ ...rest, has_image: image_url !== null })
})

/** The receipt's scanned photo as a data URL, read on its own because it is large. */
export const getReceiptImage = cache(async (id: string) => {
  const userId = await requireUserId()
  const row = await selectReceiptById(userId, id)
  return row?.image_url ?? null
})

export const getReceiptTotals = cache(async (): Promise<ReceiptTotals> => {
  const userId = await requireUserId()
  return selectReceiptTotals(userId)
})

export type NewReceipt = {
  merchant: string
  purchasedOn: string | null
  currency: string
  subtotalCents: number | null
  taxCents: number | null
  totalCents: number
  receiptType?: ReceiptTypeId
  rawText: string | null
  /** Compressed data URL from the scan capture, or null when entered by hand. */
  imageUrl?: string | null
  notes: string | null
}

export async function createReceipt(input: NewReceipt): Promise<Receipt> {
  const userId = await requireUserId()
  const orgId = await getActiveOrgId()

  const detected = classifyReceipt({
    merchant: input.merchant,
    rawText: input.rawText,
  })

  // A type the user picked always wins; the detected guess is still stored so
  // the UI can show what detection would have chosen.
  const userPicked = input.receiptType !== undefined

  const row = await insertReceipt(userId, {
    orgId,
    merchant: input.merchant,
    purchasedOn: input.purchasedOn,
    currency: input.currency,
    subtotalCents: input.subtotalCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    receiptType: userPicked ? input.receiptType! : detected.type,
    typeSource: userPicked ? "user" : "auto",
    detectedType: detected.confidence > 0 ? detected.type : null,
    detectedConfidence: detected.confidence > 0 ? detected.confidence : null,
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
  const row = await updateReceiptType(userId, id, receiptType)
  return row ? toReceipt(row) : null
}

export async function removeReceipt(id: string): Promise<boolean> {
  const userId = await requireUserId()
  return deleteReceipt(userId, id)
}

// Exposed so the scan form can preview a guess before anything is saved.
export async function suggestReceiptType(input: {
  merchant?: string | null
  rawText?: string | null
}) {
  await requireUserId()
  return classifyReceipt(input)
}

export type SearchScope = "mine" | "org"

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

export const searchReceipts = cache(
  async (params: ReceiptSearchParams): Promise<ReceiptSearchResults> => {
    const userId = await requireUserId()
    const orgId = await getActiveOrgId()

    const scope: SearchScope = params.scope === "org" && orgId ? "org" : "mine"
    const pageSize = clampInt(params.pageSize, 25, 1, 100)
    const page = clampInt(params.page, 1, 1, 10_000)

    const result = await searchReceiptRows(
      scope === "org"
        ? { kind: "org", orgId: orgId! }
        : { kind: "user", userId },
      {
        query: params.query,
        receiptTypes: params.receiptTypes,
        purchasedFrom: params.purchasedFrom,
        purchasedTo: params.purchasedTo,
        minTotalCents: params.minTotalCents,
        maxTotalCents: params.maxTotalCents,
        sort: params.sort,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }
    )

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
