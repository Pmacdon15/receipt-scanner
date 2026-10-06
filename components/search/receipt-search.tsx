"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { SearchBox } from "@/components/search/search-box"
import {
  SearchFiltersForm,
  type SearchFiltersValues,
} from "@/components/search/search-filters-form"
import { SearchResults } from "@/components/search/search-results"
import {
  Pagination,
  ScopeTabs,
  SearchNavContext,
  Stats,
  TypeChips,
} from "@/components/search/search-sections"
import { SignedOutPrompt } from "@/components/search/signed-out-prompt"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type {
  ReceiptSearchParams,
  ReceiptSearchResults,
  ReceiptSearchWithSuggestions,
} from "@/lib/dal/receipts"
import type { SearchPageData, SearchViewer } from "@/lib/dal/search-page"
import {
  formValue,
  hasActiveFilters,
  nextSearchParams,
  searchPageHref,
  searchQueryString,
} from "@/lib/search-params"
import {
  asCachedSearch,
  receiptSearchKeys,
  receiptSearchQueryOptions,
} from "@/lib/search-queries"
import { cn } from "@/lib/utils"

/**
 * The whole /search experience: search bar with autocomplete, filters and
 * results, in one client component so they can share a single optimistic view.
 *
 * Data flow
 * - First load: the page passes an unawaited promise; `use()` unwraps it
 *   under the page's Suspense boundary.
 * - Typing: a debounced TanStack query hits /api/receipts/search
 *   (route → DAL → db), which returns suggestions *and* the full first page of
 *   results for that query, cached per user/org/query.
 * - Searching: the URL is the source of truth, so a search is a navigation.
 *   Inside the transition, `useOptimistic` shows the cached results for the
 *   target search straight away (the autocomplete data for a typed query, the
 *   default data from the first load for Clear), while the server renders the
 *   authoritative page. When it lands, the optimistic view is replaced.
 */
export function ReceiptSearch({ data }: { data: Promise<SearchPageData> }) {
  const page = React.use(data)
  if (page.status === "signed-out") return <SignedOutPrompt />
  return (
    <SearchWorkspace
      viewer={page.viewer}
      params={page.params}
      results={page.results}
    />
  )
}

type SearchView = {
  params: ReceiptSearchParams
  results: ReceiptSearchResults
  /** False while showing the previous results because nothing was cached. */
  exact: boolean
}

type OptimisticSearch = {
  params: ReceiptSearchParams
  /** Cached results for `params`, if the autocomplete or a prefetch has them. */
  cached: ReceiptSearchResults | undefined
}

// With nothing cached, keep the current results on screen (dimmed) until the
// server answers, rather than flashing an empty state.
function showOptimistic(view: SearchView, next: OptimisticSearch): SearchView {
  return {
    params: next.params,
    results: next.cached ?? view.results,
    exact: next.cached !== undefined,
  }
}

function SearchWorkspace({
  viewer,
  params,
  results,
}: {
  viewer: SearchViewer
  params: ReceiptSearchParams
  results: ReceiptSearchResults
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = React.useTransition()

  // What the server rendered. Outside a transition the optimistic view is
  // exactly this; during one it is whatever navigate() set.
  const committed = React.useMemo<SearchView>(
    () => ({ params, results, exact: true }),
    [params, results]
  )
  const [view, setView] = React.useOptimistic(committed, showOptimistic)

  // ---------------------------------------------------------------------------
  // Cache: the server's results are the freshest data there is, so they go
  // into the cache under their own key. Back/forward and re-running a search
  // then hit the cache instead of showing the old page.
  React.useEffect(() => {
    const key = receiptSearchKeys.search(viewer, params)
    const existing =
      queryClient.getQueryData<ReceiptSearchWithSuggestions>(key)
    const hasSuggestions = Boolean(existing?.suggestions.length)
    queryClient.setQueryData<ReceiptSearchWithSuggestions>(
      key,
      { ...results, suggestions: existing?.suggestions ?? [] },
      // Server results carry no suggestions. For a text query, mark the entry
      // stale so opening the autocomplete fetches them.
      { updatedAt: params.query && !hasSuggestions ? 0 : Date.now() }
    )
  }, [queryClient, viewer, params, results])

  // The default (unfiltered) search for the current scope: what Clear shows.
  // Seeded from the first load when that was the default search; otherwise
  // fetched once in the background so Clear is still instant.
  const defaultParams = React.useMemo<ReceiptSearchParams>(
    () => ({ scope: params.scope }),
    [params.scope]
  )
  const isDefaultSearch =
    searchQueryString(params) === searchQueryString(defaultParams)
  useQuery({
    ...receiptSearchQueryOptions(viewer, defaultParams),
    initialData: isDefaultSearch ? asCachedSearch(results) : undefined,
    staleTime: 60_000,
  })

  // ---------------------------------------------------------------------------
  // Navigation with an optimistic view.
  // The query of our own latest submission, so the URL sync below does not
  // overwrite text typed while that navigation was in flight.
  const [submitted, setSubmitted] = React.useState<{
    query: string | undefined
  } | null>(null)

  const navigate = React.useCallback(
    (next: ReceiptSearchParams) => {
      const cached = queryClient.getQueryData<ReceiptSearchWithSuggestions>(
        receiptSearchKeys.search(viewer, next)
      )
      if (next.query !== params.query) setSubmitted({ query: next.query })
      startTransition(() => {
        setView({ params: next, cached })
        router.push(searchPageHref(next), { scroll: false })
      })
    },
    [queryClient, viewer, router, setView, params.query]
  )

  const prefetch = React.useCallback(
    (next: ReceiptSearchParams) => {
      void queryClient.prefetchQuery(receiptSearchQueryOptions(viewer, next))
    },
    [queryClient, viewer]
  )

  const nav = React.useMemo(() => ({ navigate, prefetch }), [navigate, prefetch])

  // ---------------------------------------------------------------------------
  // Search bar + autocomplete.
  const [input, setInput] = React.useState(params.query ?? "")
  const [open, setOpen] = React.useState(false)

  // When the URL's query changes from outside the search bar (back button, a
  // link), show it in the bar. Our own submissions already match.
  const [syncedQuery, setSyncedQuery] = React.useState(params.query)
  if (syncedQuery !== params.query) {
    setSyncedQuery(params.query)
    if (!submitted || submitted.query !== params.query) {
      setInput(params.query ?? "")
    }
    setSubmitted(null)
  }

  const typed = input.trim()
  const debounced = useDebouncedValue(typed, 200)

  // Same filters as the current view, with the typed text: the response is
  // exactly what submitting this text would show.
  const autocompleteParams = React.useMemo(
    () => nextSearchParams(view.params, { query: debounced || undefined }),
    [view.params, debounced]
  )
  const autocomplete = useQuery({
    ...receiptSearchQueryOptions(viewer, autocompleteParams),
    enabled: open && debounced.length > 0,
    placeholderData: keepPreviousData,
  })

  const settled = debounced === typed && !autocomplete.isPlaceholderData
  const autoData = typed ? autocomplete.data : undefined

  function search(query: string) {
    const text = query.trim()
    setInput(text)
    setOpen(false)
    navigate(nextSearchParams(view.params, { query: text || undefined }))
  }

  function clearQuery() {
    setInput("")
    if (view.params.query) {
      navigate(nextSearchParams(view.params, { query: undefined }))
    }
  }

  function clearAll() {
    setInput("")
    setOpen(false)
    navigate(defaultParams)
  }

  function applyFilters(values: SearchFiltersValues) {
    navigate(
      nextSearchParams(view.params, {
        query: typed || undefined,
        purchasedFrom: values.from,
        purchasedTo: values.to,
        minTotalCents: values.min,
        maxTotalCents: values.max,
        sort: values.sort,
      })
    )
  }

  // ---------------------------------------------------------------------------
  const current = view.params
  const shown = view.results
  const filtered = hasActiveFilters(current)
  const stale = isPending && !view.exact

  // The filter inputs are uncontrolled; remount them when the applied filters
  // change underneath (Clear, back button, scope switch).
  const filtersKey = searchQueryString({
    ...current,
    query: undefined,
    receiptTypes: undefined,
    page: undefined,
  })

  return (
    <SearchNavContext value={nav}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Search receipts
        </h1>
        <p className="text-pretty text-muted-foreground">
          Filter by type, merchant, date, or amount
          {shown.org ? `, across your receipts or ${shown.org.name}'s` : ""}.
        </p>
      </header>

      <ScopeTabs results={shown} current={current} />

      <div className="mt-6">
        <SearchBox
          value={input}
          onValueChange={setInput}
          onSubmit={search}
          onClear={clearQuery}
          onHighlight={(merchant) =>
            prefetch(nextSearchParams(view.params, { query: merchant }))
          }
          open={open}
          onOpenChange={setOpen}
          suggestions={autoData?.suggestions ?? []}
          preview={
            autoData
              ? {
                  matchCount: autoData.matchCount,
                  matchTotalCents: autoData.matchTotalCents,
                }
              : null
          }
          loading={Boolean(typed) && (autocomplete.isFetching || !settled)}
          stale={!settled}
          error={autocomplete.isError ? autocomplete.error.message : null}
        />
      </div>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <SearchFiltersForm
            key={filtersKey}
            values={formValue(current)}
            filtered={filtered}
            onApply={applyFilters}
            onClear={clearAll}
          />
        </aside>

        <section
          aria-busy={isPending}
          aria-live="polite"
          className={cn(
            "flex flex-col gap-4 transition-opacity",
            stale && "opacity-60"
          )}
        >
          <TypeChips results={shown} current={current} />
          <Stats results={shown} />
          <SearchResults
            receipts={shown.receipts}
            showUploader={shown.scope === "org"}
            filtered={filtered}
          />
          <Pagination results={shown} current={current} />
        </section>
      </div>
    </SearchNavContext>
  )
}
