import { auth } from "@clerk/nextjs/server"
import { LockIcon } from "lucide-react"
import type { Metadata } from "next"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import { ReceiptList } from "@/components/scanner/receipt-list"
import { ScanForm } from "@/components/scanner/scan-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getReceipts, getReceiptTotals } from "@/lib/dal/receipts"
import { formatMoney } from "@/lib/money"

export const metadata: Metadata = {
  title: "Scan",
  description: "Capture a receipt and categorise it in one pass.",
}

export default async function ScanPage() {
  const { userId } = await auth()

  if (!userId) return <SignedOutPrompt />

  const [receipts, totals] = await Promise.all([
    getReceipts({ limit: 50 }),
    getReceiptTotals(),
  ])

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

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Receipts" value={String(totals.receipt_count)} />
        <Stat label="Logged total" value={formatMoney(totals.total_cents)} />
        <Stat label="Categories used" value={String(totals.type_count)} />
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <ScanForm />

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-xl tracking-tight">
              Recent receipts
            </h2>
            <p className="text-muted-foreground text-sm">
              Showing {receipts.length}
            </p>
          </div>

          <ReceiptList receipts={receipts} />
        </section>
      </div>
    </div>
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
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h1 className="mt-5 font-semibold text-2xl tracking-tight">
        Sign in to scan receipts
      </h1>
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
