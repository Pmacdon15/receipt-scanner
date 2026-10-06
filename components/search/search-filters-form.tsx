"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fieldErrorsFrom,
  searchFiltersFormSchema,
  type SearchFiltersField,
  type SearchFiltersForm as SearchFiltersValues,
} from "@/lib/schemas"
import { SORT_OPTIONS } from "@/lib/search-params"

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

type FieldErrors = Partial<Record<SearchFiltersField, string>>

export type { SearchFiltersValues }

/**
 * Date, amount and sort filters. The text query lives in the search bar; this
 * form validates its own fields and hands them to the parent, which runs the
 * search (optimistically, from the cache when it can).
 *
 * Inputs are uncontrolled, so the parent remounts the form (via `key`) when
 * the applied filters change from elsewhere, e.g. Clear or the back button.
 */
export function SearchFiltersForm({
  values,
  filtered,
  onApply,
  onClear,
}: {
  values: {
    from: string
    to: string
    min: string
    max: string
    sort: string
  }
  filtered: boolean
  onApply: (values: SearchFiltersValues) => void
  onClear: () => void
}) {
  const [errors, setErrors] = React.useState<FieldErrors>({})

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsed = searchFiltersFormSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget))
    )

    if (!parsed.success) {
      setErrors(fieldErrorsFrom<SearchFiltersField>(parsed.error))
      toast.error("Fix the highlighted filters and try again.")
      return
    }

    setErrors({})
    onApply(parsed.data)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={values.from}
            aria-invalid={Boolean(errors.from)}
          />
          <FieldError message={errors.from} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={values.to}
            aria-invalid={Boolean(errors.to)}
          />
          <FieldError message={errors.to} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="min">Min total</Label>
          <Input
            id="min"
            name="min"
            inputMode="decimal"
            defaultValue={values.min}
            placeholder="0.00"
            aria-invalid={Boolean(errors.min)}
          />
          <FieldError message={errors.min} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="max">Max total</Label>
          <Input
            id="max"
            name="max"
            inputMode="decimal"
            defaultValue={values.max}
            placeholder="Any"
            aria-invalid={Boolean(errors.max)}
          />
          <FieldError message={errors.max} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sort">Sort by</Label>
        <select
          id="sort"
          name="sort"
          defaultValue={values.sort}
          className={SELECT_CLASS}
          aria-invalid={Boolean(errors.sort)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError message={errors.sort} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Apply filters
        </Button>
        {filtered && (
          <Button type="button" variant="outline" onClick={onClear}>
            Clear all
          </Button>
        )}
      </div>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}
