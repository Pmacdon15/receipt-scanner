"use client"

import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <TriangleAlertIcon className="size-5" />
      </span>
      <h1 className="mt-5 font-semibold text-2xl tracking-tight">
        Search could not load
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        Something went wrong fetching your receipts. Try again in a moment.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-muted-foreground text-xs">
          {error.digest}
        </p>
      )}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
