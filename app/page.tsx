import Link from "next/link"
import { Show, SignUpButton } from "@clerk/nextjs"
import {
  ArrowRightIcon,
  KeyboardIcon,
  ScanLineIcon,
  SparklesIcon,
  TagsIcon,
  WalletMinimalIcon,
} from "lucide-react"

import { HeroBackdrop } from "@/components/home/hero-backdrop"
import { ReceiptPreview } from "@/components/home/receipt-preview"
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

const steps = [
  {
    icon: KeyboardIcon,
    title: "Enter the receipt",
    description:
      "Merchant, date and the three amounts. That is the whole form — nothing optional to agonise over.",
  },
  {
    icon: SparklesIcon,
    title: "Check the category",
    description:
      "A type is suggested with a confidence score. Accept it, or pick another from the list.",
  },
  {
    icon: WalletMinimalIcon,
    title: "Read the totals",
    description:
      "Everything lands in one place, grouped and totalled, ready when the month closes.",
  },
]

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <section className="relative isolate overflow-hidden border-b">
        <HeroBackdrop />

        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col items-start gap-6">
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

            <div className="lg:pl-6">
              <ReceiptPreview />
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

      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Three steps, start to filed
          </h2>

          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <step.icon className="size-4 text-muted-foreground" />
                </div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
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

      <section className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Clear the shoebox this month.
            </h2>
            <p className="text-pretty text-muted-foreground">
              Start with one receipt and see the whole flow in under a minute.
            </p>
          </div>

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
        </div>
      </section>
    </div>
  )
}
