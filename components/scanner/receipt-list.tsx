"use client"

import * as React from "react"
import {
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
  SplitIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteReceiptAction,
  setReceiptSplitsAction,
  setReceiptTypeAction,
} from "@/app/actions/receipts"
import { ReceiptPhotoSheet } from "@/components/receipts/receipt-photo-sheet"
import { SplitSummary } from "@/components/receipts/split-summary"
import {
  newSplitRow,
  SplitEditor,
  type SplitRow,
} from "@/components/scanner/split-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Receipt } from "@/lib/dal/receipts"
import { formatDate, formatMoney, parseMoneyToCents } from "@/lib/money"
import { RECEIPT_TYPES, receiptTypeLabel } from "@/lib/receipt-types"
import {
  setReceiptSplitsInputSchema,
  setReceiptTypeInputSchema,
} from "@/lib/schemas"
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
  // Editing the categories and amounts, including ones that were detected.
  const [splitDraft, setSplitDraft] = React.useState<SplitRow[] | null>(null)

  function editSplit() {
    setSplitDraft(
      receipt.splits
        ? receipt.splits.map((s) =>
            newSplitRow(s.type, (s.amountCents / 100).toFixed(2))
          )
        : [
            newSplitRow(
              receipt.receiptType,
              (receipt.totalCents / 100).toFixed(2)
            ),
            newSplitRow(),
          ]
    )
  }

  function saveSplit() {
    if (!splitDraft) return
    const input = setReceiptSplitsInputSchema.safeParse({
      id: receipt.id,
      splits: splitDraft.map((row) => ({
        type: row.type,
        amountCents: parseMoneyToCents(row.amount) ?? Number.NaN,
      })),
    })
    if (!input.success) {
      toast.error(
        input.error.issues[0]?.message ?? "Check the categories and amounts."
      )
      return
    }
    const sum = input.data.splits.reduce((t, s) => t + s.amountCents, 0)
    if (sum !== receipt.totalCents) {
      toast.error(
        `The parts add up to ${formatMoney(sum, receipt.currency)}, not ${formatMoney(receipt.totalCents, receipt.currency)}.`
      )
      return
    }

    startTransition(async () => {
      const result = await setReceiptSplitsAction(
        input.data.id,
        input.data.splits
      )
      if (result.status === "error") {
        toast.error(result.message)
      } else {
        toast.success(result.message)
        setSplitDraft(null)
      }
    })
  }

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
          {receipt.splits && (
            <SplitSummary splits={receipt.splits} currency={receipt.currency} />
          )}
        </div>

        <div className="relative z-10 flex items-center gap-2 sm:shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Split or edit the categories of the receipt from ${receipt.merchant}`}
            title="Split / edit categories and amounts"
            disabled={isPending}
            onClick={() => (splitDraft ? setSplitDraft(null) : editSplit())}
          >
            <SplitIcon />
          </Button>

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

      {splitDraft && (
        <div className="relative z-10 mt-4 grid gap-2">
          <SplitEditor
            rows={splitDraft}
            onChange={setSplitDraft}
            totalCents={receipt.totalCents}
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setSplitDraft(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={saveSplit}
            >
              Save split
            </Button>
          </div>
        </div>
      )}

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
