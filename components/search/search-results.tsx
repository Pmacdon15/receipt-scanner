import Link from "next/link"
import { SearchXIcon, SparklesIcon, UserIcon } from "lucide-react"

import { ReceiptPhotoButton } from "@/components/receipts/receipt-photo-sheet"
import { Badge } from "@/components/ui/badge"
import type { SearchedReceipt } from "@/lib/dal/receipts"
import { formatDate, formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"

export function SearchResults({
  receipts,
  showUploader,
  filtered,
}: {
  receipts: SearchedReceipt[]
  showUploader: boolean
  filtered: boolean
}) {
  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
        <SearchXIcon className="size-5 text-muted-foreground" />
        <p className="mt-3 font-medium">
          {filtered ? "No receipts match" : "No receipts yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
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
      {receipts.map((receipt) => (
        <li key={receipt.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{receipt.merchant}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatDate(receipt.purchasedOn)}
                {showUploader && <> · {receipt.uploadedBy}</>}
              </p>
              {receipt.notes && (
                <p className="mt-2 line-clamp-2 text-sm text-pretty text-muted-foreground">
                  {receipt.notes}
                </p>
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
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">
                  {receiptTypeLabel(receipt.receiptType)}
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
