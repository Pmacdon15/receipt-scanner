import Link from "next/link"
import { Show, SignUpButton } from "@clerk/nextjs"
import {
  ArrowRightIcon,
  ScanLineIcon,
  SparklesIcon,
  TagsIcon,
  WalletMinimalIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RECEIPT_TYPES } from "@/lib/receipt-types"
import { site } from "@/lib/site"

const features = [
  {
    icon: ScanLineIcon,
    title: "Capture in seconds",
    description:
      "Enter a receipt once and it is stored, totalled and ready to export. No spreadsheet gymnastics.",
  },
  {
    icon: SparklesIcon,
    title: "Types detected for you",
    description:
      "Every receipt gets a suggested category with a confidence score. Keep it or override it in one tap.",
  },
  {
    icon: TagsIcon,
    title: "Consistent categories",
    description:
      "One shared taxonomy across the whole team, so month-end reporting stops being a negotiation.",
  },
  {
    icon: WalletMinimalIcon,
    title: "Totals that stay honest",
    description:
      "Subtotal, tax and total are stored in cents, so your reports never drift by a penny.",
  },
]

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <section className="border-b">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex max-w-2xl flex-col items-start gap-6">
            <Badge variant="secondary">Receipt capture for small teams</Badge>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Stop sorting receipts by hand.
            </h1>

            <p className="text-lg text-pretty text-muted-foreground">
              {site.tagline} {site.name} captures the merchant, the totals and
              the category in a single pass, then keeps it all in one place.
            </p>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Show when="signed-in">
                <Button
                  size="lg"
                  nativeButton={false}
                  render={<Link href="/scan" />}
                >
                  Open the scanner
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </Show>

              <Show when="signed-out">
                <SignUpButton mode="modal">
                  <Button size="lg" className="w-full sm:w-auto">
                    Start free
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </SignUpButton>
              </Show>

              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={<Link href="/scan" />}
              >
                See the scanner
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardHeader>
                <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted">
                  <feature.icon className="size-4.5" />
                </span>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription className="text-pretty">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Categories built in
            </h2>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              Detection picks one of these for every receipt. You always see
              what it chose, and you can change it without digging through a
              settings page.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {RECEIPT_TYPES.map((type) => (
              <Badge key={type.id} variant="outline" className="h-7 px-3">
                {type.label}
              </Badge>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
