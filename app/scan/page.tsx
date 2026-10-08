import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"
import { Suspense } from "react"

import { ScanGate } from "@/components/scanner/scan-sections"
import { ScanBodySkeleton } from "@/components/scanner/scan-skeleton"

export const metadata: Metadata = {
  title: "Scan",
  description: "Capture a receipt and categorise it in one pass.",
}

// Cache Components (#17): not async, no await anywhere on this route. The page
// only chains promises with .then() and resolves them inline inside <Suspense>,
// so the frame and heading are in the static shell and each region streams in
// behind its own fallback.
export default function ScanPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">
          Receipt scanner
        </h1>
        <p className="text-pretty text-muted-foreground">
          Capture a receipt, confirm the category, and it lands in your log
          immediately.
        </p>
      </header>

      <Suspense fallback={<ScanBodySkeleton />}>
        {auth().then(({ userId }) => <ScanGate userId={userId} />)}
      </Suspense>
    </div>
  )
}
