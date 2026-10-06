import { formatDate, formatMoney } from "@/lib/money"
import {
  RECEIPT_TYPES,
  receiptTypeLabel,
  type ReceiptTypeId,
} from "@/lib/receipt-types"
import type { ReceiptSplit } from "@/lib/schemas"

// The numbers behind the documents page, the PDF report and the spreadsheet.
// Pure functions over already-loaded receipts, so all three show the same
// totals and the maths is tested in one place.

/** The parts of a receipt a report needs. ExportedReceipt satisfies it. */
export type ReportReceipt = {
  id: string
  merchant: string
  purchasedOn: string | null
  currency: string
  subtotalCents: number | null
  taxCents: number | null
  totalCents: number
  receiptType: ReceiptTypeId
  splits: ReceiptSplit[] | null
  notes: string | null
  hasImage: boolean
  uploadedBy?: string
}

export type CategoryTotal = {
  type: ReceiptTypeId
  label: string
  /** Receipts with any money in this category (a split counts in each). */
  receiptCount: number
  totalCents: number
  /** Share of the currency's total, 0–1. */
  share: number
}

export type MonthTotal = {
  /** "2026-09", or null for receipts without a purchase date. */
  month: string | null
  label: string
  receiptCount: number
  totalCents: number
  taxCents: number
}

export type CurrencyTotals = {
  currency: string
  receiptCount: number
  totalCents: number
  /** Sums of the receipts that have the figure; see the *Known counts. */
  subtotalCents: number
  taxCents: number
  subtotalKnown: number
  taxKnown: number
  byCategory: CategoryTotal[]
  byMonth: MonthTotal[]
}

export type ReceiptReport = {
  receiptCount: number
  withPhotoCount: number
  undatedCount: number
  /** One block per currency, the one with the most receipts first. */
  currencies: CurrencyTotals[]
  firstDate: string | null
  lastDate: string | null
}

/**
 * How a receipt's total divides across categories: its split when it has one,
 * otherwise the whole total in its one category.
 */
export function categoryShares(
  receipt: Pick<ReportReceipt, "receiptType" | "splits" | "totalCents">
): ReceiptSplit[] {
  if (receipt.splits && receipt.splits.length > 0) return receipt.splits
  return [{ type: receipt.receiptType, amountCents: receipt.totalCents }]
}

/** "Grocery" or "Grocery + Hardware & Supplies" for a split receipt. */
export function categoryLabel(
  receipt: Pick<ReportReceipt, "receiptType" | "splits" | "totalCents">
): string {
  return categoryShares(receipt)
    .map((s) => receiptTypeLabel(s.type))
    .join(" + ")
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "September 2026" for "2026-09". */
export function monthLabel(month: string | null): string {
  if (!month) return "No date"
  const date = new Date(`${month}-01T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? month : MONTH_LABEL.format(date)
}

function monthOf(purchasedOn: string | null): string | null {
  return purchasedOn && /^\d{4}-\d{2}/.test(purchasedOn)
    ? purchasedOn.slice(0, 7)
    : null
}

const TYPE_ORDER = new Map(RECEIPT_TYPES.map((t, i) => [t.id, i]))

export function buildReport(receipts: readonly ReportReceipt[]): ReceiptReport {
  const byCurrency = new Map<string, ReportReceipt[]>()
  let withPhotoCount = 0
  let undatedCount = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const receipt of receipts) {
    const list = byCurrency.get(receipt.currency)
    if (list) list.push(receipt)
    else byCurrency.set(receipt.currency, [receipt])

    if (receipt.hasImage) withPhotoCount++
    if (receipt.purchasedOn) {
      if (!firstDate || receipt.purchasedOn < firstDate) {
        firstDate = receipt.purchasedOn
      }
      if (!lastDate || receipt.purchasedOn > lastDate) {
        lastDate = receipt.purchasedOn
      }
    } else {
      undatedCount++
    }
  }

  const currencies = [...byCurrency.entries()]
    .map(([currency, list]) => currencyTotals(currency, list))
    .sort(
      (a, b) =>
        b.receiptCount - a.receiptCount || a.currency.localeCompare(b.currency)
    )

  return {
    receiptCount: receipts.length,
    withPhotoCount,
    undatedCount,
    currencies,
    firstDate,
    lastDate,
  }
}

function currencyTotals(
  currency: string,
  receipts: readonly ReportReceipt[]
): CurrencyTotals {
  let totalCents = 0
  let subtotalCents = 0
  let taxCents = 0
  let subtotalKnown = 0
  let taxKnown = 0

  const categories = new Map<
    ReceiptTypeId,
    { receiptCount: number; totalCents: number }
  >()
  const months = new Map<
    string | null,
    { receiptCount: number; totalCents: number; taxCents: number }
  >()

  for (const receipt of receipts) {
    totalCents += receipt.totalCents
    if (receipt.subtotalCents != null) {
      subtotalCents += receipt.subtotalCents
      subtotalKnown++
    }
    if (receipt.taxCents != null) {
      taxCents += receipt.taxCents
      taxKnown++
    }

    for (const share of categoryShares(receipt)) {
      const entry = categories.get(share.type) ?? {
        receiptCount: 0,
        totalCents: 0,
      }
      entry.receiptCount++
      entry.totalCents += share.amountCents
      categories.set(share.type, entry)
    }

    const month = monthOf(receipt.purchasedOn)
    const entry = months.get(month) ?? {
      receiptCount: 0,
      totalCents: 0,
      taxCents: 0,
    }
    entry.receiptCount++
    entry.totalCents += receipt.totalCents
    entry.taxCents += receipt.taxCents ?? 0
    months.set(month, entry)
  }

  const byCategory: CategoryTotal[] = [...categories.entries()]
    .map(([type, entry]) => ({
      type,
      label: receiptTypeLabel(type),
      receiptCount: entry.receiptCount,
      totalCents: entry.totalCents,
      share: totalCents > 0 ? entry.totalCents / totalCents : 0,
    }))
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents ||
        (TYPE_ORDER.get(a.type) ?? 0) - (TYPE_ORDER.get(b.type) ?? 0)
    )

  // Chronological, with undated receipts last.
  const byMonth: MonthTotal[] = [...months.entries()]
    .map(([month, entry]) => ({ month, label: monthLabel(month), ...entry }))
    .sort((a, b) => {
      if (a.month === b.month) return 0
      if (a.month === null) return 1
      if (b.month === null) return -1
      return a.month < b.month ? -1 : 1
    })

  return {
    currency,
    receiptCount: receipts.length,
    totalCents,
    subtotalCents,
    taxCents,
    subtotalKnown,
    taxKnown,
    byCategory,
    byMonth,
  }
}

/** "Sep 1, 2026 – Sep 30, 2026", "Since Jan 1, 2026", "All dates". */
export function describePeriod(from?: string, to?: string): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  if (from) return `Since ${formatDate(from)}`
  if (to) return `Through ${formatDate(to)}`
  return "All dates"
}

/** The headline total: one currency formatted, or each one joined. */
export function formatCurrencyTotals(report: ReceiptReport): string {
  if (report.currencies.length === 0) return formatMoney(0)
  return report.currencies
    .map((c) => formatMoney(c.totalCents, c.currency))
    .join(" + ")
}

/** A safe base filename for downloads: "receipts-2026-09-01-to-2026-09-30". */
export function exportBaseName(from?: string, to?: string): string {
  if (from && to) return `receipts-${from}-to-${to}`
  if (from) return `receipts-since-${from}`
  if (to) return `receipts-through-${to}`
  return "receipts-all-dates"
}
