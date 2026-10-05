"use client"

import * as React from "react"
import { Loader2Icon, SparklesIcon, Trash2Icon, UserIcon } from "lucide-react"
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
import type { Receipt } from "@/lib/dal/receipts"
import { formatDate, formatMoney } from "@/lib/money"
import { RECEIPT_TYPES, receiptTypeLabel } from "@/lib/receipt-types"
import { setReceiptTypeInputSchema } from "@/lib/schemas"

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
      className="rounded-lg border bg-card p-4 transition-opacity data-[pending=true]:opacity-60"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{receipt.merchant}</p>
            <SourceBadge receipt={receipt} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(receipt.purchasedOn)} ·{" "}
            {formatMoney(receipt.totalCents, receipt.currency)}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
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
