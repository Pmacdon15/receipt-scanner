import { describePeriod, exportBaseName, monthLabel } from "@/lib/documents/report"
import type { ReportReceipt } from "@/lib/documents/report"
import { zipStream, type ZipEntry, type ZipWriter } from "@/lib/documents/zip"
import { receiptTypeLabel } from "@/lib/receipt-types"

// The "download all my receipts" ZIP: every photo, filed into folders, with
// the PDF report and the spreadsheet alongside so the archive stands on its
// own (for an accountant, or a tax-time backup).
//
//   receipts-2026-01-01-to-2026-03-31/
//     Receipt report.pdf
//     Receipts.xlsx
//     2026-01 January/
//       2026-01-14 Costco 123.45.jpg
//     ...

export const ARCHIVE_ORGANIZE = ["month", "category", "none"] as const
export type ArchiveOrganize = (typeof ARCHIVE_ORGANIZE)[number]

export function parseOrganize(value: string | null | undefined): ArchiveOrganize {
  return ARCHIVE_ORGANIZE.includes(value as ArchiveOrganize)
    ? (value as ArchiveOrganize)
    : "month"
}

/**
 * Photos one archive may hold. Each is fetched from blob storage while the
 * download streams, so this keeps a request inside the function time limit;
 * past it the user is asked to narrow the dates.
 */
export const ARCHIVE_PHOTO_LIMIT = 1_000

// Characters Windows, macOS or common unzip tools reject in a file name.
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g

/** A file or folder name safe on every desktop OS, never empty. */
export function safeName(value: string, max = 60): string {
  const cleaned = value
    .replace(UNSAFE_NAME, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    // Windows drops trailing dots and spaces, which would break uniqueness.
    .replace(/[. ]+$/, "")
    .replace(/^\.+/, "")
  return cleaned || "Receipt"
}

function folderFor(receipt: ReportReceipt, organize: ArchiveOrganize) {
  if (organize === "none") return ""
  if (organize === "category") {
    return `${safeName(receiptTypeLabel(receipt.receiptType))}/`
  }
  const month = receipt.purchasedOn?.slice(0, 7) ?? null
  return month
    ? `${month} ${monthLabel(month).split(" ")[0]}/`
    : "No date/"
}

function photoFileName(receipt: ReportReceipt) {
  const parts = [
    receipt.purchasedOn ?? "No date",
    safeName(receipt.merchant),
    (receipt.totalCents / 100).toFixed(2),
  ]
  if (receipt.currency !== "CAD") parts.push(receipt.currency)
  if (receipt.splits) parts.push("(split)")
  return parts.join(" ")
}

/**
 * Where each receipt's photo goes inside the archive, relative to its root
 * folder. Receipts without a photo are left out. Names that would collide
 * (two receipts at the same shop for the same amount on one day) get " (2)".
 */
export function archivePhotoPaths(
  receipts: readonly ReportReceipt[],
  organize: ArchiveOrganize
): Map<string, string> {
  const paths = new Map<string, string>()
  const used = new Set<string>()

  for (const receipt of receipts) {
    if (!receipt.hasImage) continue
    const base = `${folderFor(receipt, organize)}${photoFileName(receipt)}`
    let path = `${base}.jpg`
    for (let n = 2; used.has(path.toLowerCase()); n++) {
      path = `${base} (${n}).jpg`
    }
    used.add(path.toLowerCase())
    paths.set(receipt.id, path)
  }

  return paths
}

export type ArchiveInput = {
  receipts: readonly ReportReceipt[]
  organize: ArchiveOrganize
  from?: string
  to?: string
  scopeLabel: string
  generatedAt: Date
  /** Where each receipt's photo goes; from archivePhotoPaths. */
  photoPaths: ReadonlyMap<string, string>
  /** The report and spreadsheet, built with the same photoPaths. */
  documents: { pdf: Uint8Array; xlsx: Uint8Array }
  /** Reads one receipt's photo, or null when it cannot be read. */
  readPhoto: (receiptId: string) => Promise<Uint8Array | null>
  /** Photos read ahead of the one being written. */
  concurrency?: number
}

/** The archive as a stream. Its root folder is exportBaseName(from, to). */
export function receiptArchiveStream(input: ArchiveInput) {
  return zipStream((writer) => archiveEntries(input, writer))
}

async function* archiveEntries(
  input: ArchiveInput,
  writer: ZipWriter
): AsyncGenerator<ZipEntry> {
  const root = `${exportBaseName(input.from, input.to)}/`
  const modified = input.generatedAt

  yield {
    name: `${root}Receipt report.pdf`,
    data: input.documents.pdf,
    modified,
    compress: true,
  }
  yield {
    name: `${root}Receipts.xlsx`,
    data: input.documents.xlsx,
    modified,
  }

  const queue = input.receipts.filter((r) => input.photoPaths.has(r.id))
  const missing: ReportReceipt[] = []
  const skipped: ReportReceipt[] = []

  // Read a few photos ahead, but write them in order.
  const ahead = Math.max(1, input.concurrency ?? 4)
  const pending: Promise<Uint8Array | null>[] = []
  const read = (receipt: ReportReceipt) =>
    input.readPhoto(receipt.id).catch(() => null)

  for (let i = 0; i < Math.min(ahead, queue.length); i++) {
    pending.push(read(queue[i]))
  }

  for (let i = 0; i < queue.length; i++) {
    const receipt = queue[i]
    const data = await pending[i]
    if (i + ahead < queue.length) pending.push(read(queue[i + ahead]))
    // Let the finished read be collected rather than held by the array.
    pending[i] = Promise.resolve(null)

    if (!data) {
      missing.push(receipt)
      continue
    }
    if (!writer.fits(data.length)) {
      skipped.push(receipt, ...queue.slice(i + 1))
      break
    }

    yield {
      name: `${root}${input.photoPaths.get(receipt.id)}`,
      data,
      modified: photoDate(receipt.purchasedOn) ?? modified,
    }
  }

  yield {
    name: `${root}README.txt`,
    data: new TextEncoder().encode(readme(input, missing, skipped)),
    modified,
    compress: true,
  }
}

/** Noon UTC on the purchase date, so the unzipped file sorts by it. */
function photoDate(purchasedOn: string | null): Date | null {
  if (!purchasedOn) return null
  const date = new Date(`${purchasedOn.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function readme(
  input: ArchiveInput,
  missing: readonly ReportReceipt[],
  skipped: readonly ReportReceipt[]
) {
  const withPhoto = input.photoPaths.size
  const included = withPhoto - missing.length - skipped.length
  const withoutPhoto = input.receipts.length - withPhoto
  const organized =
    input.organize === "month"
      ? "Photos are filed in a folder per month."
      : input.organize === "category"
        ? "Photos are filed in a folder per category (a split receipt goes under its largest category)."
        : "Photos are all in one folder."

  const lines = [
    "Receipt export",
    "==============",
    "",
    `Covering: ${input.scopeLabel}`,
    `Period:   ${describePeriod(input.from, input.to)}`,
    `Created:  ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `${input.receipts.length} receipt${input.receipts.length === 1 ? "" : "s"}, ${included} photo${included === 1 ? "" : "s"} included.`,
    organized,
    "",
    "Receipt report.pdf  totals by category and month, and every receipt.",
    "Receipts.xlsx       one row per receipt; the Photo column says which",
    "                    file in this folder belongs to it.",
  ]

  if (withoutPhoto > 0) {
    lines.push(
      "",
      `${withoutPhoto} receipt${withoutPhoto === 1 ? " was" : "s were"} entered by hand with no photo; they are in the report and spreadsheet only.`
    )
  }
  const listed = (title: string, list: readonly ReportReceipt[]) => {
    if (list.length === 0) return
    lines.push("", title)
    for (const r of list) {
      lines.push(
        `  - ${r.purchasedOn ?? "No date"}  ${r.merchant}  ${(r.totalCents / 100).toFixed(2)} ${r.currency}`
      )
    }
  }
  listed("These photos could not be read and are missing:", missing)
  listed(
    "These photos did not fit in one archive; download a shorter date range:",
    skipped
  )

  return `${lines.join("\r\n")}\r\n`
}
