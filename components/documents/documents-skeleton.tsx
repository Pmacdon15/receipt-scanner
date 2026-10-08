import { Skeleton } from "@/components/ui/skeleton"

// Fallbacks for the Suspense boundaries on /documents. Sized like what they
// stand in for, so the page doesn't jump when the data arrives.

export function SummarySkeleton() {
  return <Skeleton className="h-5 w-96 max-w-full" />
}

export function FiltersSkeleton() {
  return (
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders that never reorder.
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>
      <Skeleton className="h-16 w-full max-w-lg" />
    </div>
  )
}

export function DownloadsSkeleton() {
  return <Skeleton className="h-24 w-full print:hidden" />
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders that never reorder.
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

/** Whole-page fallback while we find out whether the viewer is signed in. */
export function DocumentsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading documents"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <SummarySkeleton />
      </div>
      <FiltersSkeleton />
      <DownloadsSkeleton />
      <ReportSkeleton />
    </div>
  )
}
