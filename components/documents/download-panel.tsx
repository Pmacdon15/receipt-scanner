"use client"

import {
  FileArchiveIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PrinterIcon,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useBrowserTimeZone } from "@/hooks/use-browser-clock"
import {
  DownloadError,
  downloadFile,
  fetchBytes,
  fetchOk,
  fetchReceiptPhoto,
  saveBlob,
} from "@/lib/documents/download-client"
import {
  type ArchiveManifest,
  type ArchiveOrganize,
  type ArchiveProgress,
  archiveBlob,
  buildReceiptArchive,
} from "@/lib/documents/receipt-archive"

const ORGANIZE_OPTIONS: { id: ArchiveOrganize; label: string }[] = [
  { id: "month", label: "Folder per month" },
  { id: "category", label: "Folder per category" },
  { id: "none", label: "One folder" },
]

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

type Busy = "pdf" | "xlsx" | "zip" | null

/**
 * The downloads for the current period. Each route builds its file from the
 * same query string as the page, so what you download is what the page shows.
 *
 * Every download is fetched before it is saved, so a failure shows as a
 * message instead of being saved as a text file (issue #14). The photo ZIP is
 * assembled here in the browser, photo by photo.
 */
export function DownloadPanel({
  query,
  receiptCount,
  photoCount,
  photoLimit,
}: {
  /** The page's query string, without a leading "?". */
  query: string
  receiptCount: number
  photoCount: number
  photoLimit: number
}) {
  const [organize, setOrganize] = React.useState<ArchiveOrganize>("month")
  const [busy, setBusy] = React.useState<Busy>(null)
  const [progress, setProgress] = React.useState<ArchiveProgress | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  // Stop fetching photos if the user leaves the page mid-download.
  React.useEffect(() => () => abortRef.current?.abort(), [])

  // The files say which day they were made; that day is the viewer's (#22).
  const timeZone = useBrowserTimeZone()

  const href = (kind: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams(query)
    if (timeZone) qs.set("tz", timeZone)
    for (const [key, value] of Object.entries(extra)) qs.set(key, value)
    const s = qs.toString()
    return `/api/documents/${kind}${s ? `?${s}` : ""}`
  }

  const empty = receiptCount === 0
  const tooManyPhotos = photoCount > photoLimit

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    if (busy) return
    setBusy(kind)
    try {
      await task()
    } catch (error) {
      if (abortRef.current?.signal.aborted) {
        toast("Download cancelled.")
      } else {
        console.error("download failed", error)
        toast.error(
          error instanceof DownloadError
            ? error.message
            : "The download failed. Try again in a moment."
        )
      }
    } finally {
      abortRef.current = null
      setBusy(null)
      setProgress(null)
    }
  }

  const downloadPdf = () =>
    run("pdf", () => downloadFile(href("pdf"), "receipt-report.pdf"))

  const downloadXlsx = () =>
    run("xlsx", () => downloadFile(href("xlsx"), "receipts.xlsx"))

  const downloadZip = () =>
    run("zip", async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      const manifest = (await (
        await fetchOk(href("photos", { organize }), signal)
      ).json()) as ArchiveManifest
      setProgress({ done: 0, total: manifest.photos.length })

      const [pdf, xlsx] = await Promise.all([
        fetchBytes(href("pdf"), signal),
        fetchBytes(href("xlsx", { photos: organize }), signal),
      ])

      const archive = await buildReceiptArchive({
        manifest,
        documents: { pdf, xlsx },
        readPhoto: (id) => fetchReceiptPhoto(id, signal),
        onProgress: setProgress,
        signal,
      })

      saveBlob(archiveBlob(archive), manifest.fileName)

      const notIncluded = archive.missing.length + archive.skipped.length
      if (notIncluded > 0) {
        toast.warning(
          `Downloaded ${archive.included} of ${manifest.photos.length} photos. README.txt in the ZIP lists the ${notIncluded} that could not be included.`
        )
      } else {
        toast.success(
          `Downloaded ${archive.included} photo${archive.included === 1 ? "" : "s"}.`
        )
      }
    })

  return (
    <div className="grid gap-3 md:grid-cols-3 print:hidden">
      <DownloadCard
        icon={<FileTextIcon />}
        title="PDF report"
        description="Totals by category and month, then every receipt. Ready to print or send."
      >
        <Button disabled={empty || busy !== null} onClick={downloadPdf}>
          {busy === "pdf" && <LoaderCircleIcon className="animate-spin" />}
          Download PDF
        </Button>
        {empty ? (
          <Button variant="outline" disabled>
            Open to print
          </Button>
        ) : (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={href("pdf", { disposition: "inline" })}
                target="_blank"
                rel="noopener"
              />
            }
          >
            Open to print
          </Button>
        )}
      </DownloadCard>

      <DownloadCard
        icon={<FileSpreadsheetIcon />}
        title="Spreadsheet"
        description="Excel workbook with a summary, one row per receipt, and a row per category for pivot tables."
      >
        <Button disabled={empty || busy !== null} onClick={downloadXlsx}>
          {busy === "xlsx" && <LoaderCircleIcon className="animate-spin" />}
          Download .xlsx
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon />
          Print this page
        </Button>
      </DownloadCard>

      <DownloadCard
        icon={<FileArchiveIcon />}
        title="Receipt photos (.zip)"
        description={
          tooManyPhotos
            ? `${photoCount} photos is more than one download holds (${photoLimit}). Pick a shorter range.`
            : `A copy of all ${photoCount} receipt photo${photoCount === 1 ? "" : "s"}, filed into folders, with the PDF and spreadsheet included.`
        }
      >
        {busy === "zip" ? (
          <div className="flex w-full flex-col gap-2" aria-live="polite">
            <p className="text-sm tabular-nums">
              {progress && progress.total > 0
                ? `Adding photos… ${progress.done} of ${progress.total}`
                : "Preparing…"}
            </p>
            <Progress
              aria-label="Download progress"
              value={
                progress && progress.total > 0
                  ? (progress.done / progress.total) * 100
                  : 0
              }
            />
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <label className="sr-only" htmlFor="zip-organize">
              How to organize the photos
            </label>
            <select
              id="zip-organize"
              className={SELECT_CLASS}
              value={organize}
              disabled={busy !== null}
              onChange={(e) => setOrganize(e.target.value as ArchiveOrganize)}
            >
              {ORGANIZE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              disabled={empty || tooManyPhotos || busy !== null}
              onClick={downloadZip}
            >
              Download .zip
            </Button>
          </>
        )}
      </DownloadCard>
    </div>
  )
}

function DownloadCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted [&_svg]:size-4">
            {icon}
          </span>
          {title}
        </div>
        <p className="text-pretty text-muted-foreground text-sm">
          {description}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">{children}</div>
      </CardContent>
    </Card>
  )
}
