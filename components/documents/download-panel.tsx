"use client"

import * as React from "react"
import {
  FileArchiveIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PrinterIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ArchiveOrganize } from "@/lib/documents/receipt-archive"

const ORGANIZE_OPTIONS: { id: ArchiveOrganize; label: string }[] = [
  { id: "month", label: "Folder per month" },
  { id: "category", label: "Folder per category" },
  { id: "none", label: "One folder" },
]

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

/**
 * The downloads for the current period. Each one is a plain link to a route
 * that builds the file from the same query string as the page, so what you
 * download is exactly what the page shows.
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
  const href = (kind: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams(query)
    for (const [key, value] of Object.entries(extra)) qs.set(key, value)
    const s = qs.toString()
    return `/api/documents/${kind}${s ? `?${s}` : ""}`
  }

  const empty = receiptCount === 0
  const tooManyPhotos = photoCount > photoLimit

  return (
    <div className="grid gap-3 md:grid-cols-3 print:hidden">
      <DownloadCard
        icon={<FileTextIcon />}
        title="PDF report"
        description="Totals by category and month, then every receipt. Ready to print or send."
      >
        <DownloadLink href={href("pdf")} disabled={empty}>
          Download PDF
        </DownloadLink>
        <DownloadLink
          href={href("pdf", { disposition: "inline" })}
          disabled={empty}
          variant="outline"
          newTab
        >
          Open to print
        </DownloadLink>
      </DownloadCard>

      <DownloadCard
        icon={<FileSpreadsheetIcon />}
        title="Spreadsheet"
        description="Excel workbook with a summary, one row per receipt, and a row per category for pivot tables."
      >
        <DownloadLink href={href("xlsx")} disabled={empty}>
          Download .xlsx
        </DownloadLink>
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
            : `${photoCount} photo${photoCount === 1 ? "" : "s"}, filed into folders, with the PDF and spreadsheet included.`
        }
      >
        <label className="sr-only" htmlFor="zip-organize">
          How to organize the photos
        </label>
        <select
          id="zip-organize"
          className={SELECT_CLASS}
          value={organize}
          onChange={(e) => setOrganize(e.target.value as ArchiveOrganize)}
        >
          {ORGANIZE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <DownloadLink
          href={href("zip", { organize })}
          disabled={empty || tooManyPhotos}
        >
          Download .zip
        </DownloadLink>
      </DownloadCard>
    </div>
  )
}

/** A link styled as a button; a real disabled button when there is nothing to get. */
function DownloadLink({
  href,
  disabled,
  variant = "default",
  newTab = false,
  children,
}: {
  href: string
  disabled: boolean
  variant?: "default" | "outline"
  newTab?: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <Button variant={variant} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Button
      variant={variant}
      nativeButton={false}
      render={
        newTab ? (
          <a href={href} target="_blank" rel="noopener" />
        ) : (
          <a href={href} download />
        )
      }
    >
      {children}
    </Button>
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
        <p className="text-sm text-pretty text-muted-foreground">
          {description}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">{children}</div>
      </CardContent>
    </Card>
  )
}
