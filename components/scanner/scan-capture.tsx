"use client"

/**
 * Receipt photo capture: pick or shoot a photo, compress it in the browser, and
 * hand the result up.
 *
 * Motion and layout are adapted from the AI Canvas "Upload Progress" component
 * (https://aicanvas.me/components/upload-progress) — the shimmer progress bar,
 * the card that grows out of a pill, and the collapsible detail rows. It is a
 * rewrite rather than a vendored copy (contrast components/aicanvas/*, which are
 * verbatim and updatable): the original hardcodes its own palette and pulls in
 * framer-motion and @phosphor-icons, so it is rebuilt here on the project's
 * tokens, lucide icons, and CSS animations to match the rest of the app.
 */

import * as React from "react"
import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  Loader2Icon,
  RotateCcwIcon,
  ScanLineIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  compressImage,
  formatBytes,
  ImageCompressionError,
  isSupportedImage,
  MAX_DATA_URL_BYTES,
} from "@/lib/compress-image"
import { cn } from "@/lib/utils"

export type CapturedImage = {
  dataUrl: string
  bytes: number
  width: number
  height: number
  originalBytes: number
  fileName: string
}

export function ScanCapture({
  value,
  onChange,
  disabled = false,
}: {
  value: CapturedImage | null
  onChange: (next: CapturedImage | null) => void
  disabled?: boolean
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const cameraInputRef = React.useRef<HTMLInputElement>(null)

  const [isCompressing, setIsCompressing] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Guards against a slow compression landing after the user has already
  // cleared the capture or picked a different photo.
  const runIdRef = React.useRef(0)

  const accept = async (file: File | null | undefined) => {
    if (!file) return

    const runId = ++runIdRef.current
    setError(null)

    if (!isSupportedImage(file)) {
      setError("Pick an image file — a photo, screenshot, or scan.")
      return
    }

    setIsCompressing(true)

    try {
      const compressed = await compressImage(file)
      if (runId !== runIdRef.current) return

      onChange({
        ...compressed,
        originalBytes: file.size,
        fileName: file.name || "receipt.jpg",
      })
    } catch (cause) {
      if (runId !== runIdRef.current) return

      setError(
        cause instanceof ImageCompressionError
          ? cause.message
          : "That photo could not be processed. Try another."
      )
    } finally {
      if (runId === runIdRef.current) setIsCompressing(false)
    }
  }

  const clear = () => {
    runIdRef.current++
    setIsCompressing(false)
    setError(null)
    onChange(null)
    // Without this, picking the same file twice in a row fires no change event.
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
  }

  const isBusy = disabled || isCompressing

  return (
    <div className="grid gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => accept(event.target.files?.[0])}
        tabIndex={-1}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => accept(event.target.files?.[0])}
        tabIndex={-1}
      />

      {value ? (
        <CapturedPreview
          image={value}
          onRetake={() => fileInputRef.current?.click()}
          onClear={clear}
          disabled={disabled}
        />
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            if (!isBusy) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            if (!isBusy) void accept(event.dataTransfer.files?.[0])
          }}
          className={cn(
            "relative overflow-hidden rounded-lg border border-dashed bg-muted/40 px-6 py-8 text-center transition-colors",
            isDragging && "border-primary bg-primary/5",
            error && "border-destructive/50"
          )}
        >
          <Viewfinder active={isCompressing} />

          <span
            className={cn(
              "mx-auto flex size-11 items-center justify-center rounded-lg bg-background shadow-xs transition-transform",
              isCompressing && "scale-95"
            )}
          >
            {isCompressing ? (
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <ScanLineIcon className="size-5 text-muted-foreground" />
            )}
          </span>

          <p className="mt-4 text-sm font-medium">
            {isCompressing ? "Compressing photo" : "Add a receipt photo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isCompressing
              ? "Shrinking it on this device before it uploads."
              : `Drop one here, or use a button below. Compressed to under ${formatBytes(MAX_DATA_URL_BYTES)}.`}
          </p>

          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => cameraInputRef.current?.click()}
            >
              <CameraIcon />
              Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon />
              Choose file
            </Button>
          </div>

          {isCompressing && <ShimmerBar />}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="mt-px size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/** Corner brackets that frame the drop zone like a scanner reticle. */
function Viewfinder({ active }: { active: boolean }) {
  const corners = [
    "left-2 top-2 border-l-2 border-t-2 rounded-tl-sm",
    "right-2 top-2 border-r-2 border-t-2 rounded-tr-sm",
    "left-2 bottom-2 border-b-2 border-l-2 rounded-bl-sm",
    "right-2 bottom-2 border-b-2 border-r-2 rounded-br-sm",
  ]

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {corners.map((corner) => (
        <span
          key={corner}
          className={cn(
            "absolute size-4 transition-colors",
            corner,
            active ? "border-primary" : "border-border"
          )}
        />
      ))}
    </span>
  )
}

/** The progress treatment carried over from the AI Canvas component. */
function ShimmerBar() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-1.5 overflow-hidden bg-muted"
    >
      <span className="absolute inset-y-0 w-1/2 animate-scan-sweep bg-linear-to-r from-transparent via-primary to-transparent" />
    </span>
  )
}

function CapturedPreview({
  image,
  onRetake,
  onClear,
  disabled,
}: {
  image: CapturedImage
  onRetake: () => void
  onClear: () => void
  disabled: boolean
}) {
  const saved = image.originalBytes - image.bytes
  const savedPercent =
    image.originalBytes > 0
      ? Math.max(0, Math.round((saved / image.originalBytes) * 100))
      : 0

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a client-side
            data URL, so next/image has nothing to optimise and would only
            round-trip it through the optimiser. */}
        <img
          src={image.dataUrl}
          alt={`Receipt photo: ${image.fileName}`}
          className="size-20 shrink-0 rounded-md border bg-muted object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{image.fileName}</p>

          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckIcon className="size-3 text-primary" />
            <span className="tabular-nums">
              {formatBytes(image.originalBytes)} → {formatBytes(image.bytes)}
            </span>
            {savedPercent > 0 && (
              <span className="tabular-nums opacity-70">
                ({savedPercent}% smaller)
              </span>
            )}
          </p>

          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {image.width} × {image.height}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={onRetake}
            aria-label="Replace photo"
          >
            <RotateCcwIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={onClear}
            aria-label="Remove photo"
          >
            <XIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
