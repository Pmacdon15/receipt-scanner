"use client"

import { Show, SignUpButton } from "@clerk/nextjs"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Client component on purpose (Cache Components, #21): the server version of
// Clerk's <Show> calls auth(), which is request data and would block the home
// page from prerendering. On the client it reads the session from
// ClerkProvider instead, so the page stays static. Render it under <Suspense>
// with <PrimaryCtaSkeleton /> as the fallback.
export function PrimaryCta({ className }: { className?: string }) {
  return (
    <>
      <Show when="signed-in">
        <Button
          size="lg"
          className={cn("h-11 px-5 text-base", className)}
          nativeButton={false}
          render={<Link href="/scan" />}
        >
          Scan a receipt
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </Show>

      <Show when="signed-out">
        <SignUpButton mode="modal">
          <Button size="lg" className={cn("h-11 px-5 text-base", className)}>
            Start free
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SignUpButton>
      </Show>
    </>
  )
}

/** Same footprint as the CTA button, so nothing shifts when it resolves. */
export function PrimaryCtaSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-11 w-36 rounded-lg", className)} />
}
