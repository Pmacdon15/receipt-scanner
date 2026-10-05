import { CheckIcon, SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"

// Illustrative only — a worked example of what one captured receipt looks like.
const SAMPLE = {
  merchant: "Harbour Street Market",
  date: "Oct 2, 2026",
  type: "grocery",
  confidence: 0.94,
  subtotalCents: 8215,
  taxCents: 411,
  totalCents: 8626,
}

/**
 * A static mock of a captured receipt, used as the hero's visual.
 * Numbers run through the same formatters the real list uses, so the preview
 * cannot drift from how stored receipts are actually rendered.
 */
export function ReceiptPreview() {
  const rows = [
    { label: "Subtotal", value: SAMPLE.subtotalCents },
    { label: "Tax", value: SAMPLE.taxCents },
  ]

  return (
    <div className="relative rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{SAMPLE.merchant}</p>
          <p className="text-sm text-muted-foreground">{SAMPLE.date}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 gap-1">
          <CheckIcon className="size-3" />
          Saved
        </Badge>
      </div>

      <Separator className="my-4" />

      <dl className="flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-mono tabular-nums">{formatMoney(row.value)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 text-base font-semibold">
          <dt>Total</dt>
          <dd className="font-mono tabular-nums">
            {formatMoney(SAMPLE.totalCents)}
          </dd>
        </div>
      </dl>

      <Separator className="my-4" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <SparklesIcon className="size-3.5" />
          Detected category
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{receiptTypeLabel(SAMPLE.type)}</Badge>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(SAMPLE.confidence * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
