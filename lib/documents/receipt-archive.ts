import { dateTimeInZone } from "@/lib/dates"
import type { ReportReceipt } from "@/lib/documents/report"
import {
  describePeriod,
  exportBaseName,
  monthLabel,
} from "@/lib/documents/report"
import { ZipWriter } from "@/lib/documents/zip"
import { receiptTypeLabel } from "@/lib/receipt-types"

// The "download all my receipts" ZIP: every photo, filed into folders, with
// the PDF report and the spreadsheet alongside so the archive stands on its
// own (for an accountant, or a tax-time backup).
//
// The archive is assembled in the browser. The server only says which photos
// go where (buildArchiveManifest, served by /api/documents/photos); the
// browser then fetches each photo through /api/receipts/[id]/image, one small
// authorized request at a time, and zips them locally. Sending the whole
// archive through one serverless function hit its size and time limits, and
// any error it returned was saved by the browser as "zip.txt" (issue #14).
//
//   receipts-2026-01-01-to-2026-03-31/
//     Receipt report.pdf
//     Receipts.xlsx
//     2026-01 January/
//       2026-01-14 Costco 123.45.jpg
//     ...

export const ARCHIVE_ORGANIZE = ["month", "category", "none"] as const
export type ArchiveOrganize = (typeof ARCHIVE_ORGANIZE)[number]

export function parseOrganize(
  value: string | null | undefined
): ArchiveOrganize {
  return ARCHIVE_ORGANIZE.includes(value as ArchiveOrganize)
    ? (value as ArchiveOrganize)
    : "month"
}

/**
 * Photos one archive may hold. The browser keeps the archive in memory until
 * it is saved, so past this the user is asked to narrow the dates.
 */
export const ARCHIVE_PHOTO_LIMIT = 500

// Characters Windows, macOS or common unzip tools reject in a file name.
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what this strips.
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
  return month ? `${month} ${monthLabel(month).split(" ")[0]}/` : "No date/"
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

/** One photo in the archive: whose it is, and where it goes. */
export type ArchivePhoto = {
  receiptId: string
  /** Path inside the archive's root folder, from archivePhotoPaths. */
  path: string
  purchasedOn: string | null
  merchant: string
  totalCents: number
  currency: string
}

/**
 * Everything the browser needs to assemble the archive. Holds receipt ids and
 * archive paths only: never blob pathnames, which stay on the server.
 */
export type ArchiveManifest = {
  /** The folder everything sits in, e.g. "receipts-2026-01-01-to-2026-03-31". */
  rootName: string
  /** The name to save the download as. */
  fileName: string
  organize: ArchiveOrganize
  scopeLabel: string
  from?: string
  to?: string
  /** ISO timestamp. */
  generatedAt: string
  /** IANA zone the README shows generatedAt in; UTC when unknown. */
  timeZone?: string
  receiptCount: number
  photos: ArchivePhoto[]
}

export function buildArchiveManifest(
  receipts: readonly ReportReceipt[],
  {
    organize,
    scopeLabel,
    from,
    to,
    generatedAt,
    timeZone = "UTC",
    fileName,
  }: {
    organize: ArchiveOrganize
    scopeLabel: string
    from?: string
    to?: string
    generatedAt: Date
    timeZone?: string
    fileName: string
  }
): ArchiveManifest {
  const paths = archivePhotoPaths(receipts, organize)
  return {
    rootName: exportBaseName(from, to),
    fileName,
    organize,
    scopeLabel,
    from,
    to,
    generatedAt: generatedAt.toISOString(),
    timeZone,
    receiptCount: receipts.length,
    photos: receipts.flatMap((r) => {
      const path = paths.get(r.id)
      return path
        ? [
            {
              receiptId: r.id,
              path,
              purchasedOn: r.purchasedOn,
              merchant: r.merchant,
              totalCents: r.totalCents,
              currency: r.currency,
            },
          ]
        : []
    }),
  }
}

export type ArchiveProgress = { done: number; total: number }

export type BuildArchiveInput = {
  manifest: ArchiveManifest
  /** The report and spreadsheet for the same filters. */
  documents: { pdf: Uint8Array; xlsx: Uint8Array }
  /**
   * Reads one receipt's photo, or null when it cannot be read (it is then
   * listed in the README). Throw to abandon the whole archive.
   */
  readPhoto: (receiptId: string) => Promise<Uint8Array | null>
  /** Photos fetched at the same time. */
  concurrency?: number
  onProgress?: (progress: ArchiveProgress) => void
  signal?: AbortSignal
}

export type BuiltArchive = {
  /** The archive's bytes, in order; hand them to `new Blob(parts)`. */
  parts: Uint8Array[]
  included: number
  missing: ArchivePhoto[]
  skipped: ArchivePhoto[]
}

/** The whole archive, photos fetched a few at a time and written in order. */
export async function buildReceiptArchive({
  manifest,
  documents,
  readPhoto,
  concurrency = 4,
  onProgress,
  signal,
}: BuildArchiveInput): Promise<BuiltArchive> {
  const writer = new ZipWriter()
  const parts: Uint8Array[] = []
  const root = `${manifest.rootName}/`
  const generatedAt = new Date(manifest.generatedAt)
  const add = (name: string, data: Uint8Array, modified = generatedAt) => {
    parts.push(...writer.add({ name: `${root}${name}`, data, modified }))
  }

  add("Receipt report.pdf", documents.pdf)
  add("Receipts.xlsx", documents.xlsx)

  const queue = manifest.photos
  const missing: ArchivePhoto[] = []
  const skipped: ArchivePhoto[] = []
  let included = 0

  const ahead = Math.max(1, concurrency)
  const pending: (Promise<Uint8Array | null> | null)[] = []
  const start = (i: number) => {
    // A failed read becomes a rejected promise held until its turn; mark it
    // handled now so it is not reported as unhandled in the meantime.
    const read = readPhoto(queue[i].receiptId)
    read.catch(() => {})
    pending[i] = read
  }
  for (let i = 0; i < Math.min(ahead, queue.length); i++) start(i)

  onProgress?.({ done: 0, total: queue.length })
  for (let i = 0; i < queue.length; i++) {
    signal?.throwIfAborted()
    const photo = queue[i]
    const data = await pending[i]
    pending[i] = null
    if (i + ahead < queue.length) start(i + ahead)

    if (!data) {
      missing.push(photo)
    } else if (!writer.fits(data.length)) {
      skipped.push(...queue.slice(i))
      break
    } else {
      add(photo.path, data, photoDate(photo.purchasedOn) ?? generatedAt)
      included++
    }
    onProgress?.({ done: i + 1, total: queue.length })
  }
  signal?.throwIfAborted()

  add(
    "README.txt",
    new TextEncoder().encode(archiveReadme(manifest, missing, skipped))
  )
  parts.push(writer.finish())

  return { parts, included, missing, skipped }
}

/**
 * The archive as a file to save. The cast is needed because a plain
 * Uint8Array may sit on a SharedArrayBuffer, which the Blob typings (since
 * TypeScript 5.7) refuse; the writer only ever makes ordinary ArrayBuffers.
 */
export function archiveBlob(archive: Pick<BuiltArchive, "parts">): Blob {
  return new Blob(archive.parts as BlobPart[], { type: "application/zip" })
}

/** Noon UTC on the purchase date, so the unzipped file sorts by it. */
function photoDate(purchasedOn: string | null): Date | null {
  if (!purchasedOn) return null
  const date = new Date(`${purchasedOn.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function archiveReadme(
  manifest: ArchiveManifest,
  missing: readonly ArchivePhoto[] = [],
  skipped: readonly ArchivePhoto[] = []
) {
  const withPhoto = manifest.photos.length
  const included = withPhoto - missing.length - skipped.length
  const withoutPhoto = manifest.receiptCount - withPhoto
  const timeZone = manifest.timeZone ?? "UTC"
  const organized =
    manifest.organize === "month"
      ? "Photos are filed in a folder per month."
      : manifest.organize === "category"
        ? "Photos are filed in a folder per category (a split receipt goes under its largest category)."
        : "Photos are all in one folder."

  const lines = [
    "Receipt export",
    "==============",
    "",
    `Covering: ${manifest.scopeLabel}`,
    `Period:   ${describePeriod(manifest.from, manifest.to)}`,
    `Created:  ${dateTimeInZone(new Date(manifest.generatedAt), timeZone)} ${timeZone}`,
    "",
    `${manifest.receiptCount} receipt${manifest.receiptCount === 1 ? "" : "s"}, ${included} photo${included === 1 ? "" : "s"} included.`,
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
  const listed = (title: string, list: readonly ArchivePhoto[]) => {
    if (list.length === 0) return
    lines.push("", title)
    for (const p of list) {
      lines.push(
        `  - ${p.purchasedOn ?? "No date"}  ${p.merchant}  ${(p.totalCents / 100).toFixed(2)} ${p.currency}`
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
