import { Skeleton } from "@/components/ui/skeleton"

// Fallbacks for the Suspense boundaries on /scan. Sized like what they stand
// in for, so the page doesn't jump when the data arrives.

export function StatsSkeleton() {
  return (
    <>
      <Skeleton className="h-[86px] w-full rounded-xl" />
      <Skeleton className="h-[86px] w-full rounded-xl" />
      <Skeleton className="h-[86px] w-full rounded-xl" />
    </>
  )
}

export function CountSkeleton() {
  return <Skeleton className="h-4 w-20" />
}

export function ReceiptListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders that never reorder.
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}

/** Fallback under the header until we know if the viewer is signed in. */
export function ScanBodySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading scanner">
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatsSkeleton />
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Skeleton className="h-96 w-full" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          <ReceiptListSkeleton />
        </div>
      </div>
    </div>
  )
}
