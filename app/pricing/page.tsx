import { PricingTable } from "@clerk/nextjs"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for 500 receipts a year, or Pro for 2,000 and auto-detect.",
}

// Clerk's pricing table lists the plans and features set up in the Clerk
// Dashboard (see lib/billing/plans.ts) and runs checkout itself. It is a
// client component, so the page stays a plain, non-async function.
export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">Pricing</h1>
        <p className="text-pretty text-muted-foreground">
          Free covers 500 receipts a year on your own. Pro raises that to 2,000,
          reads the details off each photo for you, and lets you share with a
          team of up to three.
        </p>
      </header>

      <div className="mt-8">
        <PricingTable />
      </div>
    </div>
  )
}
