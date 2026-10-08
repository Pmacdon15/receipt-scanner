import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib"

import { dateInZone } from "@/lib/dates"
import {
  buildReport,
  categoryLabel,
  describePeriod,
  type ReportReceipt,
} from "@/lib/documents/report"
import type { ReportMeta } from "@/lib/documents/report-xlsx"
import { formatDate, formatMoney } from "@/lib/money"
import { site } from "@/lib/site"

// The printable PDF report: totals, a breakdown by category and by month, and
// an itemised list of every receipt. US Letter, built with pdf-lib's standard
// fonts so nothing has to be embedded or fetched at request time.

const PAGE = { width: 612, height: 792 }
const MARGIN = 48
const FOOTER = 32
const CONTENT_WIDTH = PAGE.width - MARGIN * 2

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.42, 0.45, 0.5)
const RULE = rgb(0.86, 0.87, 0.89)
const PANEL = rgb(0.96, 0.96, 0.97)
const BAR = rgb(0.25, 0.27, 0.32)

// Windows-1252 characters above 0x7F that are not Latin-1 code points.
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""))

// Letters with no Unicode decomposition to fold them by.
const NO_DECOMPOSITION: Record<string, string> = {
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  ı: "i",
  Ŧ: "T",
  ŧ: "t",
}

/**
 * The standard PDF fonts only cover Windows-1252, and pdf-lib throws on
 * anything else. Merchant names come from OCR, so accents are folded away
 * where that works (Ł → L) and anything left becomes "?".
 */
export function toWinAnsi(value: string): string {
  let out = ""
  for (const ch of value.replace(/[\r\n\t]+/g, " ")) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_EXTRA.has(ch)
    ) {
      out += ch
      continue
    }
    const folded = (NO_DECOMPOSITION[ch] ?? ch)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
    if (/^[\x20-\x7e]+$/.test(folded)) out += folded
    // Emoji and their joiners carry no meaning on a receipt line; drop them.
    else if (
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: tests one code point at a time, so a lone joiner is a valid match.
      !/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]/u.test(ch)
    )
      out += "?"
  }
  return out
}

type Align = "left" | "right"
type Column = { label: string; width: number; align?: Align }

class Writer {
  page!: PDFPage
  y = 0
  pages: PDFPage[] = []

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont
  ) {
    this.newPage()
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height])
    this.pages.push(this.page)
    this.y = PAGE.height - MARGIN
  }

  /** Starts a new page unless `height` more points fit on this one. */
  ensure(height: number): boolean {
    if (this.y - height < MARGIN + FOOTER) {
      this.newPage()
      return true
    }
    return false
  }

  text(
    value: string,
    x: number,
    {
      size = 10,
      font = this.font,
      color = INK,
      width,
      align = "left",
    }: {
      size?: number
      font?: PDFFont
      color?: ReturnType<typeof rgb>
      width?: number
      align?: Align
    } = {}
  ) {
    const fitted =
      width === undefined
        ? toWinAnsi(value)
        : truncate(toWinAnsi(value), font, size, width)
    const drawX =
      align === "right" && width !== undefined
        ? x + width - font.widthOfTextAtSize(fitted, size)
        : x
    this.page.drawText(fitted, { x: drawX, y: this.y, size, font, color })
  }

  rule(y = this.y, color = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.75,
      color,
    })
  }
}

function truncate(text: string, font: PDFFont, size: number, max: number) {
  if (font.widthOfTextAtSize(text, size) <= max) return text
  let end = text.length
  while (
    end > 0 &&
    font.widthOfTextAtSize(`${text.slice(0, end)}…`, size) > max
  ) {
    end--
  }
  return `${text.slice(0, end).trimEnd()}…`
}

function heading(w: Writer, title: string) {
  // Room for the heading, a table header and a couple of rows, so a heading
  // never sits alone at the bottom of a page.
  w.ensure(100)
  w.y -= 22
  w.text(title, MARGIN, { size: 13, font: w.bold })
  w.y -= 10
}

function table(
  w: Writer,
  columns: Column[],
  rows: string[][],
  {
    boldLast = false,
    bars,
  }: { boldLast?: boolean; bars?: { column: number; values: number[] } } = {}
) {
  const rowHeight = 17
  const gap = 8

  const drawHeader = () => {
    w.y -= 4
    let x = MARGIN
    for (const col of columns) {
      w.text(col.label.toUpperCase(), x, {
        size: 7.5,
        font: w.bold,
        color: MUTED,
        width: col.width - gap,
        align: col.align,
      })
      x += col.width
    }
    w.y -= 6
    w.rule()
  }

  // Keep a header with at least two rows rather than orphaning it.
  w.ensure(rowHeight * 3)
  drawHeader()

  rows.forEach((row, r) => {
    if (w.ensure(rowHeight)) drawHeader()
    w.y -= rowHeight - 4
    const isLast = boldLast && r === rows.length - 1
    let x = MARGIN
    row.forEach((value, c) => {
      const col = columns[c]
      if (bars && bars.column === c) {
        const share = Math.max(0, Math.min(1, bars.values[r] ?? 0))
        const barWidth = col.width - gap - 34
        w.page.drawRectangle({
          x,
          y: w.y - 1,
          width: barWidth,
          height: 7,
          color: PANEL,
        })
        if (share > 0) {
          w.page.drawRectangle({
            x,
            y: w.y - 1,
            width: Math.max(1, barWidth * share),
            height: 7,
            color: BAR,
          })
        }
        w.text(value, x + barWidth + 4, {
          size: 9,
          color: MUTED,
          width: 30,
          align: "right",
        })
      } else {
        w.text(value, x, {
          size: 9,
          font: isLast ? w.bold : w.font,
          width: col.width - gap,
          align: col.align,
        })
      }
      x += col.width
    })
    w.y -= 4
    w.rule(w.y, isLast ? MUTED : RULE)
  })
}

function statPanels(w: Writer, stats: { label: string; value: string }[]) {
  const height = 46
  const gap = 10
  const width = (CONTENT_WIDTH - gap * (stats.length - 1)) / stats.length
  w.ensure(height + 12)
  w.y -= height + 6
  stats.forEach((stat, i) => {
    const x = MARGIN + i * (width + gap)
    w.page.drawRectangle({ x, y: w.y, width, height, color: PANEL })
    const top = w.y
    w.y = top + height - 15
    w.text(stat.label.toUpperCase(), x + 10, {
      size: 7.5,
      font: w.bold,
      color: MUTED,
      width: width - 20,
    })
    w.y = top + 12
    w.text(stat.value, x + 10, { size: 14, font: w.bold, width: width - 20 })
    w.y = top
  })
}

/** The PDF report's bytes. */
export async function buildReportPdf(
  receipts: readonly ReportReceipt[],
  meta: ReportMeta
): Promise<Uint8Array> {
  const report = buildReport(receipts)
  const doc = await PDFDocument.create()
  doc.setTitle(`Receipt report — ${describePeriod(meta.from, meta.to)}`)
  doc.setAuthor(site.name)
  doc.setCreator(site.name)
  doc.setCreationDate(meta.generatedAt)

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold)

  // Title block
  w.y -= 18
  w.text("Receipt report", MARGIN, { size: 22, font: bold })
  w.y -= 18
  w.text(
    `${meta.scopeLabel}  ·  ${describePeriod(meta.from, meta.to)}`,
    MARGIN,
    {
      size: 11,
      color: MUTED,
      width: CONTENT_WIDTH,
    }
  )
  w.y -= 14
  w.text(
    `${report.receiptCount} receipt${report.receiptCount === 1 ? "" : "s"}  ·  generated ${formatDate(dateInZone(meta.generatedAt, meta.timeZone ?? "UTC"))}`,
    MARGIN,
    { size: 9, color: MUTED }
  )
  if (meta.truncated) {
    w.y -= 13
    w.text(
      "More receipts matched than one report holds. Narrow the dates to see the rest.",
      MARGIN,
      { size: 9, color: rgb(0.7, 0.25, 0.1) }
    )
  }
  w.y -= 10
  w.rule()

  if (report.currencies.length === 0) {
    w.y -= 30
    w.text("No receipts match these filters.", MARGIN, {
      size: 11,
      color: MUTED,
    })
  }

  for (const c of report.currencies) {
    if (report.currencies.length > 1) heading(w, `${c.currency} receipts`)

    statPanels(w, [
      { label: "Total spent", value: formatMoney(c.totalCents, c.currency) },
      { label: "Tax", value: formatMoney(c.taxCents, c.currency) },
      { label: "Subtotal", value: formatMoney(c.subtotalCents, c.currency) },
      { label: "Receipts", value: String(c.receiptCount) },
    ])
    if (c.taxKnown < c.receiptCount || c.subtotalKnown < c.receiptCount) {
      w.y -= 13
      w.text(
        `Tax is recorded on ${c.taxKnown} of ${c.receiptCount} receipts and the subtotal on ${c.subtotalKnown}.`,
        MARGIN,
        { size: 8, color: MUTED }
      )
    }

    heading(w, "By category")
    table(
      w,
      [
        { label: "Category", width: 200 },
        { label: "Receipts", width: 70, align: "right" },
        { label: "Amount", width: 110, align: "right" },
        { label: "Share", width: CONTENT_WIDTH - 380 },
      ],
      [
        ...c.byCategory.map((cat) => [
          cat.label,
          String(cat.receiptCount),
          formatMoney(cat.totalCents, c.currency),
          `${Math.round(cat.share * 100)}%`,
        ]),
      ],
      { bars: { column: 3, values: c.byCategory.map((cat) => cat.share) } }
    )
    if (receipts.some((r) => r.currency === c.currency && r.splits)) {
      w.y -= 12
      w.text(
        "A split receipt counts under each of its categories, with only that category's share of the money.",
        MARGIN,
        { size: 8, color: MUTED }
      )
    }

    heading(w, "By month")
    table(
      w,
      [
        { label: "Month", width: 200 },
        { label: "Receipts", width: 70, align: "right" },
        { label: "Tax", width: 110, align: "right" },
        { label: "Amount", width: CONTENT_WIDTH - 380, align: "right" },
      ],
      [
        ...c.byMonth.map((m) => [
          m.label,
          String(m.receiptCount),
          formatMoney(m.taxCents, c.currency),
          formatMoney(m.totalCents, c.currency),
        ]),
        [
          "Total",
          String(c.receiptCount),
          formatMoney(c.taxCents, c.currency),
          formatMoney(c.totalCents, c.currency),
        ],
      ],
      { boldLast: true }
    )
  }

  if (receipts.length > 0) {
    // The itemised list starts on its own page so the summary prints alone.
    w.newPage()
    w.y += 22
    heading(w, "Receipts")
    const showUploader = receipts.some(
      (r) => r.uploadedBy && r.uploadedBy !== "You"
    )
    const columns: Column[] = showUploader
      ? [
          { label: "Date", width: 66 },
          { label: "Merchant", width: 130 },
          { label: "Category", width: 110 },
          { label: "Uploaded by", width: 74 },
          { label: "Tax", width: 58, align: "right" },
          { label: "Total", width: CONTENT_WIDTH - 438, align: "right" },
        ]
      : [
          { label: "Date", width: 70 },
          { label: "Merchant", width: 170 },
          { label: "Category", width: 140 },
          { label: "Tax", width: 60, align: "right" },
          { label: "Total", width: CONTENT_WIDTH - 440, align: "right" },
        ]
    table(
      w,
      columns,
      receipts.map((r) => [
        r.purchasedOn ? formatDate(r.purchasedOn) : "No date",
        r.merchant,
        categoryLabel(r),
        ...(showUploader ? [r.uploadedBy ?? ""] : []),
        r.taxCents == null ? "—" : formatMoney(r.taxCents, r.currency),
        formatMoney(r.totalCents, r.currency),
      ])
    )
  }

  // Footers, once the page count is known.
  w.pages.forEach((page, i) => {
    const y = MARGIN - 8
    page.drawText(toWinAnsi(`${site.name}  ·  Receipt report`), {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: MUTED,
    })
    const label = `Page ${i + 1} of ${w.pages.length}`
    page.drawText(label, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(label, 8),
      y,
      size: 8,
      font,
      color: MUTED,
    })
  })

  return doc.save()
}
