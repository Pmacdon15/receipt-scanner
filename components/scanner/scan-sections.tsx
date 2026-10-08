import { LockIcon } from "lucide-react"
import { Suspense } from "react"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import { ReceiptList } from "@/components/scanner/receipt-list"
import { ScanForm } from "@/components/scanner/scan-form"
import {
  CountSkeleton,
  ReceiptListSkeleton,
  StatsSkeleton,
} from "@/components/scanner/scan-skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getReceipts, getReceiptTotals } from "@/lib/dal/receipts"
import { formatMoney } from "@/lib/money"

// The request-time parts of /scan. Nothing here is async and nothing awaits:
// each region resolves the promise it needs inline with .then() inside its
// own <Suspense>, so only that region waits.

/**
 * Signed in: start both queries and render the scanner. Signed out: the
 * prompt, and no query runs.
 */
export function ScanGate({ userId }: { userId: string | null }) {
  if (!userId) return <SignedOutPrompt />

  const receipts = getReceipts({ limit: 50 })
  const totals = getReceiptTotals()

  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Suspense fallback={<StatsSkeleton />}>
          {totals.then((t) => (
            <>
              <Stat label="Receipts" value={String(t.receipt_count)} />
              <Stat label="Logged total" value={formatMoney(t.total_cents)} />
              <Stat label="Categories used" value={String(t.type_count)} />
            </>
          ))}
        </Suspense>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <ScanForm />

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-xl tracking-tight">
              Recent receipts
            </h2>
            <Suspense fallback={<CountSkeleton />}>
              {receipts.then((r) => (
                <p className="text-muted-foreground text-sm">
                  Showing {r.length}
                </p>
              ))}
            </Suspense>
          </div>

          <Suspense fallback={<ReceiptListSkeleton />}>
            {receipts.then((r) => <ReceiptList receipts={r} />)}
          </Suspense>
        </section>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function SignedOutPrompt() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h2 className="mt-5 font-semibold text-2xl tracking-tight">
        Sign in to scan receipts
      </h2>
      <p className="mt-2 text-pretty text-muted-foreground">
        Your receipts are private to your account, so the scanner needs you
        signed in.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <ReturnSignInButton>
          <Button variant="outline" className="w-full sm:w-auto">
            Sign in
          </Button>
        </ReturnSignInButton>
        <ReturnSignUpButton>
          <Button className="w-full sm:w-auto">Create an account</Button>
        </ReturnSignUpButton>
      </div>
    </div>
  )
}
