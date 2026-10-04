import { cache } from "react"
import { auth } from "@clerk/nextjs/server"

import { classifyReceipt } from "@/lib/classify-receipt"
import {
  deleteReceipt,
  insertReceipt,
  selectReceiptById,
  selectReceipts,
  selectReceiptTotals,
  updateReceiptType,
  type ReceiptRow,
  type ReceiptTotals,
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

export type Receipt = {
  id: string
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
  createdAt: string
}

function toReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
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
  return row ? toReceipt(row) : null
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
  notes: string | null
}

export async function createReceipt(input: NewReceipt): Promise<Receipt> {
  const userId = await requireUserId()

  const detected = classifyReceipt({
    merchant: input.merchant,
    rawText: input.rawText,
  })

  // A type the user picked always wins; the detected guess is still stored so
  // the UI can show what detection would have chosen.
  const userPicked = input.receiptType !== undefined

  const row = await insertReceipt(userId, {
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
