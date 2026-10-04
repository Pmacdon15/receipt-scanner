import { getSql } from "./client"
import type { ReceiptTypeId } from "@/lib/receipt-types"

export type ReceiptRow = {
  id: string
  user_id: string
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
  raw_text: string | null
  image_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type InsertReceiptInput = {
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
  rawText: string | null
  notes: string | null
}

export async function selectReceipts(
  userId: string,
  options: { limit?: number; receiptType?: ReceiptTypeId } = {}
): Promise<ReceiptRow[]> {
  const sql = getSql()
  const limit = options.limit ?? 50

  const rows = options.receiptType
    ? await sql`
        select * from receipts
        where user_id = ${userId} and receipt_type = ${options.receiptType}
        order by purchased_on desc nulls last, created_at desc
        limit ${limit}
      `
    : await sql`
        select * from receipts
        where user_id = ${userId}
        order by purchased_on desc nulls last, created_at desc
        limit ${limit}
      `

  return rows as ReceiptRow[]
}

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

export async function insertReceipt(
  userId: string,
  input: InsertReceiptInput
): Promise<ReceiptRow> {
  const sql = getSql()
  const rows = (await sql`
    insert into receipts (
      user_id, merchant, purchased_on, currency,
      subtotal_cents, tax_cents, total_cents,
      receipt_type, type_source, detected_type, detected_confidence,
      raw_text, notes
    ) values (
      ${userId}, ${input.merchant}, ${input.purchasedOn}, ${input.currency},
      ${input.subtotalCents}, ${input.taxCents}, ${input.totalCents},
      ${input.receiptType}, ${input.typeSource}, ${input.detectedType}, ${input.detectedConfidence},
      ${input.rawText}, ${input.notes}
    )
    returning *
  `) as ReceiptRow[]

  return rows[0]
}

export async function updateReceiptType(
  userId: string,
  id: string,
  receiptType: ReceiptTypeId
): Promise<ReceiptRow | null> {
  const sql = getSql()
  const rows = (await sql`
    update receipts
    set receipt_type = ${receiptType},
        type_source = 'user',
        updated_at = now()
    where user_id = ${userId} and id = ${id}
    returning *
  `) as ReceiptRow[]

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
