"use client"

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type {
  ReceiptSearchParams,
  ReceiptSearchResults,
} from "@/lib/dal/receipts"
import { formatMoney } from "@/lib/money"
import { RECEIPT_TYPES } from "@/lib/receipt-types"
import {
  nextSearchParams,
  searchPageHref,
  toggleType,
} from "@/lib/search-params"
import { cn } from "@/lib/utils"

type SearchNav = {
  /** Run a search: optimistic from the cache when possible, then navigate. */
  navigate: (params: ReceiptSearchParams) => void
  /** Warm the cache for a search the user is likely to run next. */
  prefetch: (params: ReceiptSearchParams) => void
}

export const SearchNavContext = React.createContext<SearchNav | null>(null)

function useSearchNav() {
  const nav = React.use(SearchNavContext)
  if (!nav) throw new Error("SearchLink needs a SearchNavContext provider.")
  return nav
}

/**
 * A real link to /search (so it can be opened in a new tab or copied), whose
 * plain clicks go through the optimistic navigator instead. Hovering or
 * focusing it prefetches the results into the client cache, which is what
 * makes the click show results instantly.
 */
export function SearchLink({
  to,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  to: ReceiptSearchParams
}) {
  const { navigate, prefetch } = useSearchNav()
  return (
    <Link
      {...props}
      href={searchPageHref(to)}
      prefetch={false}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        event.preventDefault()
        navigate(to)
      }}
      onMouseEnter={() => prefetch(to)}
      onFocus={() => prefetch(to)}
    />
  )
}

export function ScopeTabs({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: ReceiptSearchParams
}) {
  if (!results.org) return null

  const tabs = [
    { scope: "mine" as const, label: "My receipts" },
    { scope: "org" as const, label: results.org.name },
  ]

  return (
    <nav
      aria-label="Whose receipts"
      className="mt-6 inline-flex w-fit rounded-lg bg-muted p-1"
    >
      {tabs.map((tab) => {
        const active = current.scope === tab.scope
        return (
          <SearchLink
            key={tab.scope}
            to={nextSearchParams(current, { scope: tab.scope })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground",
              active && "bg-background text-foreground shadow-sm"
            )}
          >
            {tab.label}
          </SearchLink>
        )
      })}
    </nav>
  )
}

export function TypeChips({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: ReceiptSearchParams
}) {
  const counts = new Map(
    results.typeFacets.map((f) => [f.receipt_type, f.receipt_count])
  )
  const selected = new Set(current.receiptTypes ?? [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-sm">Receipt type</h2>
        {selected.size > 0 && (
          <SearchLink
            to={nextSearchParams(current, { receiptTypes: undefined })}
            className="text-muted-foreground text-sm hover:text-foreground"
          >
            All types
          </SearchLink>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {RECEIPT_TYPES.map((type) => {
          const active = selected.has(type.id)
          const count = counts.get(type.id) ?? 0
          return (
            <li key={type.id}>
              <Badge
                variant={active ? "default" : "outline"}
                className={cn(
                  "h-7 gap-1.5 px-3 text-sm",
                  !active && count === 0 && "opacity-50"
                )}
                render={
                  <SearchLink
                    to={nextSearchParams(current, {
                      receiptTypes: toggleType(current, type.id),
                    })}
                    aria-current={active ? "true" : undefined}
                    title={type.description}
                  />
                }
              >
                {type.label}
                <span className="tabular-nums opacity-70">{count}</span>
                {active && (
                  <>
                    <XIcon />
                    <span className="sr-only">(selected, click to remove)</span>
                  </>
                )}
              </Badge>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Stats({
  results,
  exportHref,
}: {
  results: ReceiptSearchResults
  /** The documents page for these results, to download them. */
  exportHref?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Matching receipts" value={String(results.matchCount)} />
        <Stat
          label="Matching total"
          value={formatMoney(results.matchTotalCents)}
        />
      </div>
      {exportHref && results.matchCount > 0 && (
        <Link
          href={exportHref}
          className="w-fit text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
        >
          Download these as a PDF, spreadsheet or ZIP
        </Link>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

export function Pagination({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: ReceiptSearchParams
}) {
  if (results.pageCount <= 1) return null

  const first = (results.page - 1) * results.pageSize + 1
  const last = Math.min(results.page * results.pageSize, results.matchCount)
  const hasPrev = results.page > 1
  const hasNext = results.page < results.pageCount

  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between gap-3 pt-2"
    >
      <p className="text-muted-foreground text-sm">
        {first}–{last} of {results.matchCount}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          nativeButton={!hasPrev}
          render={
            hasPrev ? (
              <SearchLink
                to={nextSearchParams(current, { page: results.page - 1 })}
              />
            ) : undefined
          }
        >
          <ChevronLeftIcon />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          nativeButton={!hasNext}
          render={
            hasNext ? (
              <SearchLink
                to={nextSearchParams(current, { page: results.page + 1 })}
              />
            ) : undefined
          }
        >
          Next
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  )
}
