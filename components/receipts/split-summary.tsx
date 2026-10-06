import { formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"
import type { ReceiptSplit } from "@/lib/schemas"

/** "Grocery $30.00 · Hardware & Supplies $12.17" for a split receipt. */
export function SplitSummary({
  splits,
  currency,
}: {
  splits: ReceiptSplit[]
  currency: string
}) {
  return (
    <p className="mt-0.5 text-muted-foreground text-xs">
      {splits.map((split, index) => (
        <span key={split.type}>
          {index > 0 && " · "}
          {receiptTypeLabel(split.type)}{" "}
          <span className="tabular-nums">
            {formatMoney(split.amountCents, currency)}
          </span>
        </span>
      ))}
    </p>
  )
}
