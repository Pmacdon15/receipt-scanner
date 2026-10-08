import { dateTimeInZone } from "@/lib/dates"
import {
  buildReport,
  categoryLabel,
  categoryShares,
  describePeriod,
  type ReportReceipt,
} from "@/lib/documents/report"
import { buildXlsx, type Cell, cellRef, type Sheet } from "@/lib/documents/xlsx"
import { receiptTypeLabel } from "@/lib/receipt-types"

export type ReportMeta = {
  /** "Personal receipts" or the organization's name. */
  scopeLabel: string
  from?: string
  to?: string
  generatedAt: Date
  /** IANA zone to show generatedAt in (the viewer's); UTC when unknown. */
  timeZone?: string
  /** True when the export hit its receipt limit and is missing some. */
  truncated?: boolean
}

const money = (cents: number | null): Cell =>
  cents == null ? null : { value: cents / 100, style: "money" }

/**
 * The receipt spreadsheet: a summary sheet, one row per receipt, and one row
 * per receipt-category share (what a pivot table or an accountant wants for a
 * split receipt).
 *
 * `photoPaths` maps receipt ids to where the photo sits in the ZIP download,
 * when the spreadsheet travels inside one.
 */
export function buildReportXlsx(
  receipts: readonly ReportReceipt[],
  meta: ReportMeta,
  photoPaths?: ReadonlyMap<string, string>
): Uint8Array {
  return buildXlsx(
    [
      summarySheet(receipts, meta),
      receiptsSheet(receipts, photoPaths),
      categoriesSheet(receipts),
    ],
    { title: "Receipt report", modified: meta.generatedAt }
  )
}

function summarySheet(
  receipts: readonly ReportReceipt[],
  meta: ReportMeta
): Sheet {
  const report = buildReport(receipts)
  const timeZone = meta.timeZone ?? "UTC"
  const rows: Cell[][] = [
    [{ value: "Receipt report", style: "title" }],
    [{ value: "Covering", style: "muted" }, meta.scopeLabel],
    [{ value: "Period", style: "muted" }, describePeriod(meta.from, meta.to)],
    [
      { value: "Generated", style: "muted" },
      `${dateTimeInZone(meta.generatedAt, timeZone)} ${timeZone}`,
    ],
    [
      { value: "Receipts", style: "muted" },
      { value: report.receiptCount, style: "integer" },
    ],
  ]
  if (meta.truncated) {
    rows.push([
      { value: "Note", style: "muted" },
      "More receipts matched than one export holds. Narrow the dates to get the rest.",
    ])
  }

  if (report.currencies.length === 0) {
    rows.push([], ["No receipts match these filters."])
  }

  for (const c of report.currencies) {
    rows.push(
      [],
      [{ value: `Totals (${c.currency})`, style: "bold" }],
      [
        { value: "Receipts", style: "muted" },
        { value: c.receiptCount, style: "integer" },
      ],
      [
        { value: "Total spent", style: "muted" },
        { value: c.totalCents / 100, style: "moneyBold" },
      ],
      [
        { value: "Tax", style: "muted" },
        money(c.taxCents),
        {
          value: `on ${c.taxKnown} of ${c.receiptCount} receipts`,
          style: "muted",
        },
      ],
      [
        { value: "Subtotal", style: "muted" },
        money(c.subtotalCents),
        {
          value: `on ${c.subtotalKnown} of ${c.receiptCount} receipts`,
          style: "muted",
        },
      ],
      [],
      [
        { value: "Category", style: "header" },
        { value: "Amount", style: "header" },
        { value: "Receipts", style: "header" },
        { value: "Share", style: "header" },
      ],
      ...c.byCategory.map((cat): Cell[] => [
        cat.label,
        money(cat.totalCents),
        { value: cat.receiptCount, style: "integer" },
        { value: cat.share, style: "percent" },
      ]),
      [],
      [
        { value: "Month", style: "header" },
        { value: "Amount", style: "header" },
        { value: "Receipts", style: "header" },
        { value: "Tax", style: "header" },
      ],
      ...c.byMonth.map((m): Cell[] => [
        m.label,
        money(m.totalCents),
        { value: m.receiptCount, style: "integer" },
        money(m.taxCents),
      ])
    )
  }

  return { name: "Summary", columns: [26, 16, 22, 12], rows }
}

const RECEIPT_HEADERS = [
  "Date",
  "Merchant",
  "Category",
  "Split",
  "Subtotal",
  "Tax",
  "Total",
  "Currency",
  "Notes",
  "Uploaded by",
  "Photo",
  "Receipt ID",
] as const

function receiptsSheet(
  receipts: readonly ReportReceipt[],
  photoPaths?: ReadonlyMap<string, string>
): Sheet {
  const header: Cell[] = RECEIPT_HEADERS.map((h) => ({
    value: h,
    style: "header",
  }))

  const body: Cell[][] = receipts.map((r) => [
    r.purchasedOn
      ? { date: r.purchasedOn }
      : { value: "No date", style: "muted" },
    r.merchant,
    categoryLabel(r),
    r.splits
      ? r.splits
          .map(
            (s) =>
              `${receiptTypeLabel(s.type)} ${(s.amountCents / 100).toFixed(2)}`
          )
          .join("; ")
      : null,
    money(r.subtotalCents),
    money(r.taxCents),
    money(r.totalCents),
    r.currency,
    r.notes,
    r.uploadedBy ?? null,
    photoPaths?.get(r.id) ?? (r.hasImage ? "Yes" : "No"),
    { value: r.id, style: "muted" },
  ])

  const rows: Cell[][] = [header, ...body]

  // Totals under a blank row so sorting and the filter leave them alone. Only
  // meaningful for one currency; a mixed export sums per currency on Summary.
  const currencies = new Set(receipts.map((r) => r.currency))
  if (receipts.length > 0 && currencies.size === 1) {
    const last = receipts.length // 0-based index of the last data row
    const sum = (col: number, cents: (r: ReportReceipt) => number | null) => ({
      formula: `SUM(${cellRef(1, col)}:${cellRef(last, col)})`,
      value: receipts.reduce((t, r) => t + (cents(r) ?? 0), 0) / 100,
      style: "moneyBold" as const,
    })
    rows.push(
      [],
      [
        { value: "Total", style: "bold" },
        { value: `${receipts.length} receipts`, style: "muted" },
        null,
        null,
        sum(4, (r) => r.subtotalCents),
        sum(5, (r) => r.taxCents),
        sum(6, (r) => r.totalCents),
        [...currencies][0],
      ]
    )
  }

  return {
    name: "Receipts",
    columns: [12, 30, 24, 34, 12, 11, 12, 9, 36, 18, 44, 38],
    rows,
    freezeRows: 1,
    autoFilterRow: 0,
    landscape: true,
  }
}

function categoriesSheet(receipts: readonly ReportReceipt[]): Sheet {
  const header: Cell[] = [
    "Date",
    "Merchant",
    "Category",
    "Amount",
    "Currency",
    "Split receipt",
    "Receipt ID",
  ].map((h) => ({ value: h, style: "header" }))

  const rows: Cell[][] = [header]
  for (const r of receipts) {
    const shares = categoryShares(r)
    for (const share of shares) {
      rows.push([
        r.purchasedOn
          ? { date: r.purchasedOn }
          : { value: "No date", style: "muted" },
        r.merchant,
        receiptTypeLabel(share.type),
        money(share.amountCents),
        r.currency,
        shares.length > 1 ? "Yes" : "No",
        { value: r.id, style: "muted" },
      ])
    }
  }

  return {
    name: "By category",
    columns: [12, 30, 24, 12, 9, 13, 38],
    rows,
    freezeRows: 1,
    autoFilterRow: 0,
  }
}
