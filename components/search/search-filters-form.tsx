"use client"

import * as React from "react"
import Form from "next/form"
import Link from "next/link"
import { SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ReceiptTypeId } from "@/lib/receipt-types"
import {
  fieldErrorsFrom,
  searchFiltersFormSchema,
  type SearchFiltersField,
} from "@/lib/schemas"
import { SORT_OPTIONS } from "@/lib/search-params"

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

type FieldErrors = Partial<Record<SearchFiltersField, string>>

export function SearchFiltersForm({
  scope,
  receiptTypes,
  values,
  filtered,
  clearHref,
}: {
  scope: "mine" | "org"
  receiptTypes: ReceiptTypeId[] | undefined
  values: {
    q: string
    from: string
    to: string
    min: string
    max: string
    sort: string
  }
  filtered: boolean
  clearHref: string
}) {
  const [errors, setErrors] = React.useState<FieldErrors>({})

  // Catch typos (an amount like "12,5o", an end date before the start)
  // before navigating. The page still parses the URL leniently on the server.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const parsed = searchFiltersFormSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget))
    )

    if (!parsed.success) {
      event.preventDefault()
      setErrors(fieldErrorsFrom<SearchFiltersField>(parsed.error))
      toast.error("Fix the highlighted filters and try again.")
      return
    }

    setErrors({})
  }

  return (
    <Form
      action="/search"
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
    >
      {scope === "org" && <input type="hidden" name="scope" value="org" />}
      {receiptTypes?.map((type) => (
        <input key={type} type="hidden" name="type" value={type} />
      ))}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q">Merchant, notes or text</Label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="e.g. Costco"
            className="pl-8"
            aria-invalid={Boolean(errors.q)}
          />
        </div>
        <FieldError message={errors.q} />
      </div>

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
          Search
        </Button>
        {filtered && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={clearHref} />}
          >
            Clear
          </Button>
        )}
      </div>
    </Form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}
