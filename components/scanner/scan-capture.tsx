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
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  compressImage,
  formatBytes,
  ImageCompressionError,
} from "@/lib/compress-image"
import {
  apiErrorResponseSchema,
  clientImageFileSchema,
  imageUploadResponseSchema,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas"
import { cn } from "@/lib/utils"

export type CapturedImage = {
  /**
   * Blob pathname the upload route minted for this photo. This is the only part
   * the form posts; the bytes are already in the blob store by then.
   */
  pathname: string
  /** The compressed JPEG, kept on the client purely to render the preview. */
  blob: Blob
  bytes: number
  width: number
  height: number
  originalBytes: number
  fileName: string
}

/** Compressing happens on this device; uploading is a round trip. */
type Phase = "compressing" | "uploading"

class ImageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageUploadError"
  }
}

/**
 * Posts the compressed photo and returns the pathname the store gave it.
 *
 * Goes to a Route Handler rather than a Server Action because an Action's body
 * is capped at 1MB — see app/api/receipts/image/route.ts.
 */
async function uploadImage(blob: Blob): Promise<string> {
  const body = new FormData()
  // The route ignores this name and mints its own pathname, so it is a
  // placeholder rather than the user's filename.
  body.append("file", blob, "receipt.jpg")

  let response: Response
  try {
    response = await fetch("/api/receipts/image", { method: "POST", body })
  } catch {
    throw new ImageUploadError(
      "The photo could not be uploaded. Check your connection and try again."
    )
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const errorParsed = apiErrorResponseSchema.safeParse(payload)
    const message = errorParsed.success
      ? errorParsed.data.error
      : "That photo could not be uploaded. Try again."
    throw new ImageUploadError(message)
  }

  const parsed = imageUploadResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new ImageUploadError("The upload did not come back as expected.")
  }

  return parsed.data.pathname
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

  const [phase, setPhase] = React.useState<Phase | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Guards against a slow compression or upload landing after the user has
  // already cleared the capture or picked a different photo.
  const runIdRef = React.useRef(0)

  const accept = async (file: File | null | undefined) => {
    if (!file) return

    const runId = ++runIdRef.current
    setError(null)

    const fileParsed = clientImageFileSchema.safeParse(file)
    if (!fileParsed.success) {
      setError(
        fileParsed.error.issues[0]?.message ??
          "Pick an image file — a photo, screenshot, or scan."
      )
      return
    }

    setPhase("compressing")

    try {
      const compressed = await compressImage(file)
      if (runId !== runIdRef.current) return

      // Uploaded here rather than on submit, so a store that is refusing the
      // photo is reported before the user has filled the rest of the form in.
      setPhase("uploading")
      const pathname = await uploadImage(compressed.blob)
      if (runId !== runIdRef.current) return

      onChange({
        ...compressed,
        pathname,
        originalBytes: file.size,
        fileName: file.name || "receipt.jpg",
      })
    } catch (cause) {
      if (runId !== runIdRef.current) return

      setError(
        cause instanceof ImageCompressionError ||
          cause instanceof ImageUploadError
          ? cause.message
          : "That photo could not be processed. Try another."
      )
    } finally {
      if (runId === runIdRef.current) setPhase(null)
    }
  }

  const clear = () => {
    runIdRef.current++
    setPhase(null)
    setError(null)
    onChange(null)
    // Without this, picking the same file twice in a row fires no change event.
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
  }

  const isBusy = disabled || phase !== null

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
        // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a shortcut; the buttons inside are the keyboard path.
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
          <Viewfinder active={phase !== null} />

          <span
            className={cn(
              "mx-auto flex size-11 items-center justify-center rounded-lg bg-background shadow-xs transition-transform",
              phase !== null && "scale-95"
            )}
          >
            {phase !== null ? (
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <ScanLineIcon className="size-5 text-muted-foreground" />
            )}
          </span>

          <p className="mt-4 font-medium text-sm">
            {phase === "compressing"
              ? "Compressing photo"
              : phase === "uploading"
                ? "Uploading photo"
                : "Add a receipt photo"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {phase === "compressing"
              ? "Shrinking it on this device before it uploads."
              : phase === "uploading"
                ? "Sending it to private storage."
                : `Drop one here, or use a button below. Compressed to under ${formatBytes(MAX_IMAGE_BYTES)}.`}
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

          {phase !== null && <ShimmerBar />}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-destructive text-xs">
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

  // The photo is already in the blob store, but reading it back would cost a
  // round trip for bytes this device still has, so the preview points at the
  // local blob. Revoked when the blob changes and on unmount, so a run of
  // retakes does not pin every previous photo in memory.
  const previewUrl = React.useMemo(
    () => URL.createObjectURL(image.blob),
    [image.blob]
  )

  React.useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-3 p-3">
        {/* biome-ignore lint/performance/noImgElement: a local blob
            URL, so next/image has nothing to optimise and would only
            round-trip it through the optimiser. */}
        <img
          src={previewUrl}
          alt={`Receipt photo: ${image.fileName}`}
          className="size-20 shrink-0 rounded-md border bg-muted object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{image.fileName}</p>

          <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
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

          <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
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
