import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"
import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { SearchResults } from "@/components/search/search-results"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { searchReceipts, type ReceiptSearchResults } from "@/lib/dal/receipts"
import { formatMoney } from "@/lib/money"
import { RECEIPT_TYPES } from "@/lib/receipt-types"
import {
  formValue,
  hasActiveFilters,
  parseSearchParams,
  searchHref,
  SORT_OPTIONS,
  toggleType,
  type RawSearchParams,
} from "@/lib/search-params"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Search",
  description: "Find receipts by type, merchant, date, or amount.",
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { userId } = await auth()
  if (!userId) return <SignedOutPrompt />

  const params = parseSearchParams(await searchParams)
  const results = await searchReceipts(params)
  // The DAL may have narrowed "org" to "mine"; keep links consistent with it.
  const current = { ...params, scope: results.scope }
  const values = formValue(current)
  const filtered = hasActiveFilters(current)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Search receipts
        </h1>
        <p className="text-pretty text-muted-foreground">
          Filter by type, merchant, date, or amount
          {results.org ? `, across your receipts or ${results.org.name}'s` : ""}
          .
        </p>
      </header>

      <ScopeTabs results={results} current={current} />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <Form action="/search" className="flex flex-col gap-4">
            {current.scope === "org" && (
              <input type="hidden" name="scope" value="org" />
            )}
            {current.receiptTypes?.map((type) => (
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
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  name="from"
                  type="date"
                  defaultValue={values.from}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">To</Label>
                <Input id="to" name="to" type="date" defaultValue={values.to} />
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
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="max">Max total</Label>
                <Input
                  id="max"
                  name="max"
                  inputMode="decimal"
                  defaultValue={values.max}
                  placeholder="Any"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Sort by</Label>
              <select
                id="sort"
                name="sort"
                defaultValue={values.sort}
                className={SELECT_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Search
              </Button>
              {filtered && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link href={searchHref({ scope: current.scope })} />
                  }
                >
                  Clear
                </Button>
              )}
            </div>
          </Form>
        </aside>

        <section className="flex flex-col gap-4">
          <TypeChips results={results} current={current} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Matching receipts" value={String(results.matchCount)} />
            <Stat
              label="Matching total"
              value={formatMoney(results.matchTotalCents)}
            />
          </div>

          <SearchResults
            receipts={results.receipts}
            showUploader={results.scope === "org"}
            filtered={filtered}
          />

          <Pagination results={results} current={current} />
        </section>
      </div>
    </div>
  )
}

type CurrentParams = Parameters<typeof searchHref>[0]

function ScopeTabs({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: CurrentParams
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
          <Link
            key={tab.scope}
            href={searchHref(current, { scope: tab.scope })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-background text-foreground shadow-sm"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

function TypeChips({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: CurrentParams
}) {
  const counts = new Map(
    results.typeFacets.map((f) => [f.receipt_type, f.receipt_count])
  )
  const selected = new Set(current.receiptTypes ?? [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Receipt type</h2>
        {selected.size > 0 && (
          <Link
            href={searchHref(current, { receiptTypes: undefined })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            All types
          </Link>
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
                  <Link
                    href={searchHref(current, {
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

function Pagination({
  results,
  current,
}: {
  results: ReceiptSearchResults
  current: CurrentParams
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
      <p className="text-sm text-muted-foreground">
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
              <Link href={searchHref(current, { page: results.page - 1 })} />
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
              <Link href={searchHref(current, { page: results.page + 1 })} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function SignedOutPrompt() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Sign in to search receipts
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        Receipts are private to your account and your organization, so search
        needs you signed in.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <SignInButton mode="modal">
          <Button variant="outline" className="w-full sm:w-auto">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button className="w-full sm:w-auto">Create an account</Button>
        </SignUpButton>
      </div>
    </div>
  )
}
