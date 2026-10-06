"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatMoney, parseMoneyToCents } from "@/lib/money"
import { RECEIPT_TYPES } from "@/lib/receipt-types"
import { MAX_SPLITS } from "@/lib/schemas"
import { cn } from "@/lib/utils"

/** One row of the split as the user is typing it: amount is still text. */
export type SplitRow = { key: string; type: string; amount: string }

const SELECT_ITEMS: Record<string, React.ReactNode> = Object.fromEntries(
  RECEIPT_TYPES.map((t) => [t.id, t.label])
)

export function newSplitRow(type = "", amount = ""): SplitRow {
  return { key: crypto.randomUUID(), type, amount }
}

/** The rows in the shape the `splits` hidden input posts. */
export function serializeSplitRows(rows: SplitRow[]) {
  return JSON.stringify(rows.map(({ type, amount }) => ({ type, amount })))
}

function centsToText(cents: number) {
  return (cents / 100).toFixed(2)
}

/**
 * Edits how a receipt's total is divided across categories. Shows how much is
 * still unassigned so the parts can be made to add up to the total, which is
 * what saving requires.
 */
export function SplitEditor({
  rows,
  onChange,
  totalCents,
  error,
  disabled = false,
}: {
  rows: SplitRow[]
  onChange: (rows: SplitRow[]) => void
  /** The receipt total as typed so far, or null when it is not a number yet. */
  totalCents: number | null
  error?: string
  disabled?: boolean
}) {
  const allocated = rows.reduce(
    (sum, row) => sum + (parseMoneyToCents(row.amount) ?? 0),
    0
  )
  const remaining = totalCents === null ? null : totalCents - allocated
  const usedTypes = new Set(rows.map((r) => r.type).filter(Boolean))

  function update(key: string, patch: Partial<SplitRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function fillRemaining(row: SplitRow) {
    if (remaining === null) return
    const current = parseMoneyToCents(row.amount) ?? 0
    update(row.key, { amount: centsToText(Math.max(0, current + remaining)) })
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <ul className="grid gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <Select
              items={SELECT_ITEMS}
              value={row.type}
              onValueChange={(value) =>
                update(row.key, { type: String(value ?? "") })
              }
              disabled={disabled}
            >
              <SelectTrigger
                className="min-w-0 flex-1"
                aria-label={`Category for part ${index + 1}`}
              >
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {RECEIPT_TYPES.map((type) => (
                  <SelectItem
                    key={type.id}
                    value={type.id}
                    disabled={type.id !== row.type && usedTypes.has(type.id)}
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="w-28 tabular-nums"
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Amount for part ${index + 1}`}
              value={row.amount}
              onChange={(event) =>
                update(row.key, { amount: event.target.value })
              }
              disabled={disabled}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove part ${index + 1}`}
              disabled={disabled || rows.length <= 2}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled || rows.length >= MAX_SPLITS}
          onClick={() => onChange([...rows, newSplitRow()])}
        >
          <PlusIcon />
          Add category
        </Button>

        {remaining === null ? (
          <span className="text-muted-foreground">
            Enter the total to check the split.
          </span>
        ) : remaining === 0 ? (
          <span className="text-muted-foreground">
            Adds up to {formatMoney(totalCents ?? 0)}.
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span
              className={cn(
                remaining < 0 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {remaining > 0
                ? `${formatMoney(remaining)} left to assign`
                : `${formatMoney(-remaining)} over the total`}
            </span>
            {remaining > 0 && rows.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="xs"
                disabled={disabled}
                onClick={() => fillRemaining(rows[rows.length - 1])}
              >
                Add to last
              </Button>
            )}
          </span>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
