"use client"

import { SearchXIcon, SparklesIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { deleteReceiptAction } from "@/app/actions/receipts"
import { DeleteReceiptButton } from "@/components/receipts/delete-receipt-button"
import { ReceiptPhotoButton } from "@/components/receipts/receipt-photo-sheet"
import { SplitSummary } from "@/components/receipts/split-summary"
import { Badge } from "@/components/ui/badge"
import type { SearchedReceipt } from "@/lib/dal/receipts"
import { formatDate, formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"

export function SearchResults({
  receipts,
  showUploader,
  filtered,
  onDeleted,
}: {
  receipts: SearchedReceipt[]
  showUploader: boolean
  filtered: boolean
  /** Called after one of the user's own receipts is deleted. */
  onDeleted?: (id: string) => void
}) {
  // Same optimistic delete as the scan page: the row goes on confirm, the
  // server re-render confirms it, and a failed delete brings it back.
  const [shown, removeShown] = React.useOptimistic(
    receipts,
    (current, id: string) => current.filter((r) => r.id !== id)
  )
  const [, startTransition] = React.useTransition()

  function remove(id: string) {
    startTransition(async () => {
      removeShown(id)
      const result = await deleteReceiptAction(id)
      if (result.status === "error") {
        toast.error(result.message)
      } else {
        toast.success("Receipt deleted.")
        onDeleted?.(id)
      }
    })
  }

  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
        <SearchXIcon className="size-5 text-muted-foreground" />
        <p className="mt-3 font-medium">
          {filtered ? "No receipts match" : "No receipts yet"}
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          {filtered ? (
            "Try a wider date range, another type, or fewer words."
          ) : (
            <>
              <Link href="/scan" className="underline underline-offset-4">
                Scan a receipt
              </Link>{" "}
              and it will show up here.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {shown.map((receipt) => (
        <li key={receipt.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{receipt.merchant}</p>
              <p className="mt-0.5 text-muted-foreground text-sm">
                {formatDate(receipt.purchasedOn)}
                {showUploader && <> · {receipt.uploadedBy}</>}
              </p>
              {receipt.notes && (
                <p className="mt-2 line-clamp-2 text-pretty text-muted-foreground text-sm">
                  {receipt.notes}
                </p>
              )}
              {receipt.splits && (
                <SplitSummary
                  splits={receipt.splits}
                  currency={receipt.currency}
                />
              )}
            </div>

            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
              <div className="flex items-center gap-2">
                <p className="font-semibold tabular-nums">
                  {formatMoney(receipt.totalCents, receipt.currency)}
                </p>
                {receipt.hasImage && (
                  <ReceiptPhotoButton
                    receipt={{
                      id: receipt.id,
                      merchant: receipt.merchant,
                      purchasedOn: receipt.purchasedOn,
                      totalCents: receipt.totalCents,
                      currency: receipt.currency,
                    }}
                  />
                )}
                {/* Only your own: org results include teammates' receipts,
                    which the delete action won't touch. */}
                {receipt.isMine && (
                  <DeleteReceiptButton
                    receipt={receipt}
                    onConfirm={() => remove(receipt.id)}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">
                  {receipt.splits
                    ? `Split · ${receipt.splits.length} categories`
                    : receiptTypeLabel(receipt.receiptType)}
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1"
                  title={
                    receipt.typeSource === "user"
                      ? "Type chosen by hand"
                      : "Type detected automatically"
                  }
                >
                  {receipt.typeSource === "user" ? (
                    <UserIcon />
                  ) : (
                    <SparklesIcon />
                  )}
                  <span className="sr-only">
                    {receipt.typeSource === "user" ? "Picked" : "Detected"}
                  </span>
                </Badge>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
