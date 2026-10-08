"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useLocalToday } from "@/hooks/use-browser-clock"
import type { ReceiptSearchParams } from "@/lib/dal/receipts"
import { matchingPreset, periodPresets } from "@/lib/documents/periods"
import { documentsHref } from "@/lib/search-params"

// Any date works for the labels; the ranges are only used once `today` is known.
const LABELS = periodPresets("2000-01-01")

/**
 * The quick date range chips. "This month" and friends depend on the viewer's
 * own date, not the server's UTC one (issue #22), so they are built here in
 * the browser. Until it has hydrated, only "All dates" links anywhere; the
 * dated chips hold their place so nothing shifts when they fill in.
 */
export function PeriodPresets({ params }: { params: ReceiptSearchParams }) {
  const today = useLocalToday()
  const presets = today ? periodPresets(today) : LABELS
  const from = params.purchasedFrom
  const to = params.purchasedTo
  const active = today
    ? matchingPreset(presets, from, to)
    : !from && !to
      ? presets.find((p) => p.id === "all")
      : undefined

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Quick date ranges">
      {presets.map((preset) => {
        const selected = active?.id === preset.id
        const ready = today !== null || preset.id === "all"
        return (
          <li key={preset.id}>
            {ready ? (
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
            ) : (
              <Button size="sm" variant="outline" disabled>
                {preset.label}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
