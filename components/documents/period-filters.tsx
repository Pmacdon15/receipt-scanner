import { XIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ReceiptSearchParams } from "@/lib/dal/receipts"
import { matchingPreset, type PeriodPreset } from "@/lib/documents/periods"
import { formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"
import { documentsHref } from "@/lib/search-params"
import { cn } from "@/lib/utils"

/**
 * The period and scope the documents cover. A plain GET form, so it works
 * before (and without) JavaScript and every report has a shareable URL.
 */
export function PeriodFilters({
  params,
  presets,
  org,
}: {
  params: ReceiptSearchParams
  presets: PeriodPreset[]
  org: { id: string; name: string } | null
}) {
  const active = matchingPreset(
    presets,
    params.purchasedFrom,
    params.purchasedTo
  )
  const extra = extraFilters(params)

  return (
    <div className="flex flex-col gap-4 print:hidden">
      {org && (
        <div
          role="tablist"
          aria-label="Whose receipts"
          className="inline-flex w-fit rounded-lg bg-muted p-0.5"
        >
          {(
            [
              ["mine", "My receipts"],
              ["org", org.name],
            ] as const
          ).map(([scope, label]) => (
            <Link
              key={scope}
              role="tab"
              aria-selected={params.scope === scope}
              href={documentsHref({ ...params, scope })}
              className={cn(
                "rounded-md px-3 py-1 text-muted-foreground text-sm transition-colors",
                params.scope === scope &&
                  "bg-background font-medium text-foreground shadow-sm"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-1.5" aria-label="Quick date ranges">
        {presets.map((preset) => {
          const selected = active?.id === preset.id
          return (
            <li key={preset.id}>
              <Button
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-current={selected ? "true" : undefined}
                nativeButton={false}
                render={
                  <Link
                    href={documentsHref({
                      ...params,
                      purchasedFrom: preset.from,
                      purchasedTo: preset.to,
                    })}
                  />
                }
              >
                {preset.label}
              </Button>
            </li>
          )
        })}
      </ul>

      <form
        action="/documents"
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        {params.scope === "org" && (
          <input type="hidden" name="scope" value="org" />
        )}
        {/* Filters carried over from search stay applied. */}
        {params.query && <input type="hidden" name="q" value={params.query} />}
        {params.receiptTypes?.map((type) => (
          <input key={type} type="hidden" name="type" value={type} />
        ))}
        {params.minTotalCents !== undefined && (
          <input
            type="hidden"
            name="min"
            value={(params.minTotalCents / 100).toFixed(2)}
          />
        )}
        {params.maxTotalCents !== undefined && (
          <input
            type="hidden"
            name="max"
            value={(params.maxTotalCents / 100).toFixed(2)}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documents-from">From</Label>
          <Input
            id="documents-from"
            name="from"
            type="date"
            defaultValue={params.purchasedFrom ?? ""}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documents-to">To</Label>
          <Input
            id="documents-to"
            name="to"
            type="date"
            defaultValue={params.purchasedTo ?? ""}
            className="w-40"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply dates
        </Button>
      </form>

      {extra.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
          Also filtered by {extra.join(", ")} from search.
          <Button
            size="xs"
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                href={documentsHref({
                  scope: params.scope,
                  purchasedFrom: params.purchasedFrom,
                  purchasedTo: params.purchasedTo,
                })}
              />
            }
          >
            <XIcon />
            Remove
          </Button>
        </p>
      )}
    </div>
  )
}

function extraFilters(params: ReceiptSearchParams): string[] {
  const parts: string[] = []
  if (params.query) parts.push(`“${params.query}”`)
  if (params.receiptTypes?.length) {
    parts.push(params.receiptTypes.map(receiptTypeLabel).join(" or "))
  }
  if (params.minTotalCents !== undefined) {
    parts.push(`at least ${formatMoney(params.minTotalCents)}`)
  }
  if (params.maxTotalCents !== undefined) {
    parts.push(`at most ${formatMoney(params.maxTotalCents)}`)
  }
  return parts
}
