"use client"

import * as React from "react"
import {
  ImageIcon,
  ImageOffIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteReceiptAction,
  setReceiptTypeAction,
} from "@/app/actions/receipts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { Receipt } from "@/lib/dal/receipts"
import { formatDate, formatMoney } from "@/lib/money"
import { RECEIPT_TYPES, receiptTypeLabel } from "@/lib/receipt-types"
import { setReceiptTypeInputSchema } from "@/lib/schemas"
import { cn } from "@/lib/utils"

const SELECT_ITEMS: Record<string, React.ReactNode> = Object.fromEntries(
  RECEIPT_TYPES.map((t) => [t.id, t.label])
)

export function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  if (receipts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">No receipts yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Save one with the form and it will show up here.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {receipts.map((receipt) => (
        <ReceiptRow key={receipt.id} receipt={receipt} />
      ))}
    </ul>
  )
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const [isPending, startTransition] = React.useTransition()
  const [isPhotoOpen, setIsPhotoOpen] = React.useState(false)

  function changeType(value: string) {
    if (value === receipt.receiptType) return

    const input = setReceiptTypeInputSchema.safeParse({
      id: receipt.id,
      receiptType: value,
    })
    if (!input.success) {
      toast.error(input.error.issues[0]?.message ?? "Unknown receipt type.")
      return
    }

    startTransition(async () => {
      const result = await setReceiptTypeAction(
        input.data.id,
        input.data.receiptType
      )
      if (result.status === "error") toast.error(result.message)
      else toast.success(`Moved to ${receiptTypeLabel(value)}.`)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteReceiptAction(receipt.id)
      if (result.status === "error") toast.error(result.message)
      else toast.success("Receipt deleted.")
    })
  }

  return (
    <li
      data-pending={isPending}
      className={cn(
        "relative rounded-lg border bg-card p-4 transition-opacity data-[pending=true]:opacity-60",
        receipt.hasImage && "transition-colors hover:bg-accent/40"
      )}
    >
      {/* Stretched click target: a real button, so it is tab-reachable and
          responds to Enter and Space, sized to the whole row rather than
          wrapping it — nesting the Select and Delete inside a button would be
          invalid markup and would swallow their clicks. They sit above it on
          z-10 instead. */}
      {receipt.hasImage && (
        <button
          type="button"
          onClick={() => setIsPhotoOpen(true)}
          aria-label={`View the photo of the receipt from ${receipt.merchant}`}
          className="absolute inset-0 z-0 cursor-pointer rounded-lg ring-ring ring-offset-0 outline-none focus-visible:ring-2"
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{receipt.merchant}</p>
            {receipt.hasImage && (
              <Badge variant="outline" className="shrink-0 gap-1">
                <ImageIcon />
                Photo
              </Badge>
            )}
            <SourceBadge receipt={receipt} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(receipt.purchasedOn)} ·{" "}
            {formatMoney(receipt.totalCents, receipt.currency)}
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2 sm:shrink-0">
          <Select
            items={SELECT_ITEMS}
            value={receipt.receiptType}
            onValueChange={(value) => changeType(String(value))}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECEIPT_TYPES.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete receipt from ${receipt.merchant}`}
            disabled={isPending}
            onClick={remove}
          >
            {isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <Trash2Icon />
            )}
          </Button>
        </div>
      </div>

      {receipt.hasImage && (
        <ReceiptPhotoSheet
          receipt={receipt}
          open={isPhotoOpen}
          onOpenChange={setIsPhotoOpen}
        />
      )}
    </li>
  )
}

function ReceiptPhotoSheet({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: Receipt
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

/**
 * The photo itself, split out so its load state lives below the sheet's portal:
 * the portal unmounts on close, so reopening a row mounts this fresh and the
 * spinner shows again for the new request instead of a stale "ready".
 */
function ReceiptPhoto({ receipt }: { receipt: Receipt }) {
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

function SourceBadge({ receipt }: { receipt: Receipt }) {
  if (receipt.typeSource === "user") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1">
        <UserIcon />
        You picked
      </Badge>
    )
  }

  const percent =
    receipt.detectedConfidence === null
      ? null
      : Math.round(receipt.detectedConfidence * 100)

  return (
    <Badge variant="secondary" className="shrink-0 gap-1">
      <SparklesIcon />
      Detected
      {percent !== null && <span className="opacity-70">{percent}%</span>}
    </Badge>
  )
}
