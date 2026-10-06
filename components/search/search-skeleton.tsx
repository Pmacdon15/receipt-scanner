import { Skeleton } from "@/components/ui/skeleton"

export function SearchSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading search">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <Skeleton className="mt-6 h-10 w-full" />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
