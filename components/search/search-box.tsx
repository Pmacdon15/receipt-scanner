"use client"

import * as React from "react"
import { LoaderCircleIcon, SearchIcon, StoreIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MerchantSuggestion } from "@/lib/dal/receipts"
import { formatMoney } from "@/lib/money"
import { SEARCH_QUERY_MAX } from "@/lib/schemas"
import { cn } from "@/lib/utils"

export type SearchPreview = {
  matchCount: number
  matchTotalCents: number
}

/**
 * The search bar with its autocomplete list. Stateless about data: the parent
 * owns the query, the TanStack Query cache and navigation; this handles the
 * combobox behaviour (keyboard, highlighting, open/close).
 */
export function SearchBox({
  value,
  onValueChange,
  onSubmit,
  onClear,
  onHighlight,
  open,
  onOpenChange,
  suggestions,
  preview,
  loading,
  stale,
  error,
}: {
  value: string
  onValueChange: (value: string) => void
  /** Run a search for this text (a typed query or a picked merchant). */
  onSubmit: (query: string) => void
  onClear: () => void
  /** A suggestion was highlighted; a good moment to prefetch it. */
  onHighlight: (query: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestions: MerchantSuggestion[]
  preview: SearchPreview | null
  loading: boolean
  /** The list is from an earlier keystroke while the new one loads. */
  stale: boolean
  error: string | null
}) {
  const listId = React.useId()
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const typed = value.trim()

  // A new list means the old highlight no longer points at the same thing.
  const listSignature = suggestions.map((s) => s.merchant).join("\n")
  const [shownFor, setShownFor] = React.useState(listSignature)
  if (shownFor !== listSignature) {
    setShownFor(listSignature)
    setActiveIndex(-1)
  }

  const showList =
    open && typed.length > 0 && (suggestions.length > 0 || preview || loading || error)

  function highlight(index: number) {
    setActiveIndex(index)
    const suggestion = suggestions[index]
    if (suggestion) onHighlight(suggestion.merchant)
  }

  function choose(query: string) {
    onOpenChange(false)
    setActiveIndex(-1)
    onSubmit(query)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault()
        if (!open) onOpenChange(true)
        if (suggestions.length > 0) {
          highlight(Math.min(activeIndex + 1, suggestions.length - 1))
        }
        break
      }
      case "ArrowUp": {
        event.preventDefault()
        highlight(Math.max(activeIndex - 1, -1))
        break
      }
      case "Enter": {
        // A highlighted suggestion wins; otherwise the form submits the text.
        const suggestion = showList ? suggestions[activeIndex] : undefined
        if (suggestion) {
          event.preventDefault()
          choose(suggestion.merchant)
        }
        break
      }
      case "Escape": {
        if (showList) {
          event.preventDefault()
          onOpenChange(false)
          setActiveIndex(-1)
        }
        break
      }
    }
  }

  const activeId =
    showList && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault()
        choose(typed)
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search merchant, notes, receipt text or an amount
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        maxLength={SEARCH_QUERY_MAX}
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Search merchant, notes, receipt text or an amount like 12.50"
        className="h-10 pr-20 pl-9 text-base md:text-base [&::-webkit-search-cancel-button]:hidden"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          onOpenChange(true)
        }}
        onFocus={() => onOpenChange(true)}
        onBlur={() => onOpenChange(false)}
        onKeyDown={handleKeyDown}
      />

      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
        {loading && (
          <LoaderCircleIcon
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setActiveIndex(-1)
              onClear()
            }}
          >
            <XIcon />
          </Button>
        )}
      </div>

      {showList && (
        <div
          className={cn(
            "absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg transition-opacity",
            stale && "opacity-70"
          )}
          // Keep focus in the input so blur does not close the list mid-click.
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Merchant suggestions">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.merchant}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm",
                  index === activeIndex && "bg-muted"
                )}
                onMouseEnter={() => highlight(index)}
                onClick={() => choose(suggestion.merchant)}
              >
                <StoreIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <Highlighted text={suggestion.merchant} match={typed} />
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {suggestion.receiptCount}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : preview ? (
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {preview.matchCount}
                </span>{" "}
                {preview.matchCount === 1 ? "receipt" : "receipts"} ·{" "}
                <span className="tabular-nums">
                  {formatMoney(preview.matchTotalCents)}
                </span>{" "}
                match “{typed}”
              </span>
            ) : (
              <span>Searching…</span>
            )}
            <kbd className="hidden rounded border bg-background px-1.5 font-sans sm:inline">
              Enter
            </kbd>
          </div>
        </div>
      )}
    </form>
  )
}

function Highlighted({ text, match }: { text: string; match: string }) {
  const index = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-transparent font-semibold text-foreground">
        {text.slice(index, index + match.length)}
      </mark>
      {text.slice(index + match.length)}
    </>
  )
}
