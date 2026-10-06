"use client"

import * as React from "react"
import { ImageIcon, ImageOffIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDate, formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Just the fields the sheet shows, so it never needs a full row. */
export type ReceiptPhotoSubject = {
  id: string
  merchant: string
  purchasedOn: string | null
  totalCents: number
  currency: string
}

export function ReceiptPhotoSheet({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: ReceiptPhotoSubject
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate">{receipt.merchant}</SheetTitle>
          <SheetDescription>
            {formatDate(receipt.purchasedOn)} ·{" "}
            {formatMoney(receipt.totalCents, receipt.currency)}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <ReceiptPhoto receipt={receipt} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** A "Photo" button that opens the sheet; for server-rendered lists. */
export function ReceiptPhotoButton({
  receipt,
}: {
  receipt: ReceiptPhotoSubject
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`View the photo of the receipt from ${receipt.merchant}`}
      >
        <ImageIcon />
        Photo
      </Button>
      <ReceiptPhotoSheet receipt={receipt} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * The photo itself, split out so its load state lives below the sheet's portal:
 * the portal unmounts on close, so reopening a row mounts this fresh and the
 * spinner shows again for the new request instead of a stale "ready".
 */
function ReceiptPhoto({ receipt }: { receipt: ReceiptPhotoSubject }) {
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  )

  return (
    <div className="relative grid min-h-40 place-items-center overflow-hidden rounded-lg border bg-muted">
      {status === "error" ? (
        <p className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <ImageOffIcon className="size-5" />
          That photo could not be loaded.
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- served from
              a private, no-cache route, so it must not go through the Next
              image optimiser: that would copy private receipt bytes into a
              public CDN cache, reachable without the signed-in session. */}
          <img
            src={`/api/receipts/${receipt.id}/image`}
            alt={`Photo of the receipt from ${receipt.merchant}`}
            decoding="async"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            className={cn(
              "h-auto w-full object-contain transition-opacity",
              status === "ready" ? "opacity-100" : "opacity-0"
            )}
          />
          {status === "loading" && (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </span>
          )}
        </>
      )}
    </div>
  )
}
