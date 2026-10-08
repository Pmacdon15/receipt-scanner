import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  LockIcon,
  ScanLineIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  WalletMinimalIcon,
} from "lucide-react"
import Link from "next/link"
import { type ReactNode, Suspense } from "react"

import { CategoryRail } from "@/components/home/category-rail"
import { CtaSphere } from "@/components/home/cta-sphere"
import { HeroBackdrop } from "@/components/home/hero-backdrop"
import { PrimaryCta, PrimaryCtaSkeleton } from "@/components/home/primary-cta"
import { ScanHeroVisual } from "@/components/home/scan-hero-visual"
import { Button } from "@/components/ui/button"
import { RECEIPT_TYPES } from "@/lib/receipt-types"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

const promises = ["Free to start", "No card needed", "Works on your phone"]

const steps = [
  {
    icon: CameraIcon,
    title: "Snap it",
    description:
      "Take a photo of the receipt or pick one from your camera roll. It is compressed on your device and stored privately.",
  },
  {
    icon: SparklesIcon,
    title: "Check it",
    description:
      "Add the merchant and amounts. A category is suggested with a confidence score — keep it or pick another.",
  },
  {
    icon: CheckIcon,
    title: "Done",
    description:
      "It lands in your list, totalled and searchable, with the original photo one tap away.",
  },
]

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="font-mono text-emerald-600 text-xs uppercase tracking-widest dark:text-emerald-400">
        {eyebrow}
      </p>
      <h2 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
        {title}
      </h2>
      {children && (
        <p className="text-pretty text-muted-foreground">{children}</p>
      )}
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b">
        <HeroBackdrop />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:pt-24 lg:pb-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
            <div className="flex flex-col items-start gap-7">
              <h1 className="animate-home-rise text-balance font-semibold text-5xl leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl">
                Receipts in. Clean books out.
              </h1>

              <p className="max-w-xl animate-home-rise text-pretty text-lg text-muted-foreground [animation-delay:160ms] sm:text-xl">
                {site.name} turns the shoebox into a searchable, categorised
                record. Photo, totals and category, saved in one pass, so
                month-end takes minutes instead of an afternoon.
              </p>

              <div className="flex w-full animate-home-rise flex-col gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
                <Suspense
                  fallback={<PrimaryCtaSkeleton className="w-full sm:w-auto" />}
                >
                  <PrimaryCta className="w-full sm:w-auto" />
                </Suspense>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 w-full bg-background/70 px-5 text-base backdrop-blur sm:w-auto"
                  nativeButton={false}
                  render={<Link href="/search" />}
                >
                  <SearchIcon data-icon="inline-start" />
                  Search receipts
                </Button>
              </div>

              <ul className="flex animate-home-rise flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-sm [animation-delay:320ms]">
                {promises.map((promise) => (
                  <li
                    key={promise}
                    className="inline-flex items-center gap-1.5"
                  >
                    <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {promise}
                  </li>
                ))}
              </ul>
            </div>

            <ScanHeroVisual className="animate-home-rise [animation-delay:200ms]" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps, start to filed"
        >
          No templates, no spreadsheet. The whole flow fits on one screen.
        </SectionHeading>

        <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-6">
          {/* The rail that links the three steps on wide screens. */}
          <div
            aria-hidden
            className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-linear-to-r from-transparent via-border to-transparent sm:block"
          />
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col gap-4 sm:items-center sm:text-center"
            >
              <span className="relative flex size-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
                <step.icon className="size-5" />
                <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-foreground font-mono text-[10px] text-background tabular-nums">
                  {index + 1}
                </span>
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-medium text-lg">{step.title}</h3>
                <p className="max-w-xs text-pretty text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading
            eyebrow="Why it sticks"
            title="Built for the part of the job nobody enjoys"
          />

          <div className="mt-12 grid gap-4 md:grid-cols-6">
            {/* Category detection — the big tile. */}
            <article className="group relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8 md:col-span-4">
              <div className="flex max-w-sm flex-col gap-2">
                <span className="mb-2 flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <SparklesIcon className="size-4.5" />
                </span>
                <h3 className="font-semibold text-xl tracking-tight">
                  Categories suggested, never forced
                </h3>
                <p className="text-pretty text-muted-foreground text-sm">
                  Every receipt gets a category and a confidence score. You
                  always see what was picked, and changing it is one tap.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-2.5">
                {[
                  { name: "Harbour Street Market", type: "Grocery", score: 94 },
                  {
                    name: "Northline Fuel",
                    type: "Fuel & Transport",
                    score: 88,
                  },
                  {
                    name: "Kettle & Crumb",
                    type: "Restaurant & Cafe",
                    score: 76,
                  },
                ].map((row, i) => (
                  <div
                    key={row.name}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-sm transition-transform duration-500 group-hover:translate-x-1",
                      i === 1 && "group-hover:delay-75 sm:ml-6",
                      i === 2 && "group-hover:delay-150 sm:ml-12"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {row.name}
                    </span>
                    <span className="hidden text-muted-foreground sm:inline">
                      {row.type}
                    </span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${row.score}%` }}
                      />
                    </span>
                    <span className="w-8 text-right font-mono text-muted-foreground text-xs tabular-nums">
                      {row.score}%
                    </span>
                  </div>
                ))}
              </div>
            </article>

            {/* Photos */}
            <article className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8 md:col-span-2">
              <span className="mb-4 flex size-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <ImageIcon className="size-4.5" />
              </span>
              <h3 className="font-semibold text-xl tracking-tight">
                The photo stays with it
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm">
                Images go to private storage and are only served to you, right
                beside the receipt they belong to.
              </p>
              <div aria-hidden className="mt-8 flex items-end justify-center">
                {[-8, 0, 7].map((angle, i) => (
                  <div
                    key={angle}
                    className={cn(
                      "flex h-28 w-20 flex-col gap-1.5 rounded-lg border bg-[#fbf8f2] p-2.5 shadow-md dark:bg-[#e9e4da]",
                      i === 1 ? "z-10 -mx-3 h-32 w-24" : "opacity-90"
                    )}
                    style={{ rotate: `${angle}deg` }}
                  >
                    <span className="h-1.5 w-3/4 self-center rounded-full bg-stone-400/70" />
                    {[0, 1, 2, 3].map((line) => (
                      <span
                        key={line}
                        className="h-1 w-full rounded-full bg-stone-300"
                      />
                    ))}
                    <span className="mt-auto h-1.5 w-1/2 self-end rounded-full bg-stone-500/70" />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground text-xs">
                <LockIcon className="size-3.5" />
                Private by default
              </div>
            </article>

            {/* Search */}
            <article className="rounded-3xl border bg-card p-6 sm:p-8 md:col-span-2">
              <span className="mb-4 flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <SearchIcon className="size-4.5" />
              </span>
              <h3 className="font-semibold text-xl tracking-tight">
                Find anything in seconds
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm">
                Filter by category, merchant, date or amount when the accountant
                asks about that one lunch in March.
              </p>
            </article>

            {/* Money */}
            <article className="rounded-3xl border bg-card p-6 sm:p-8 md:col-span-2">
              <span className="mb-4 flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <WalletMinimalIcon className="size-4.5" />
              </span>
              <h3 className="font-semibold text-xl tracking-tight">
                Totals that stay honest
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm">
                Subtotal, tax and total are stored in cents, so reports never
                drift by a penny.
              </p>
            </article>

            {/* Teams */}
            <article className="rounded-3xl border bg-card p-6 sm:p-8 md:col-span-2">
              <span className="mb-4 flex size-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <UsersIcon className="size-4.5" />
              </span>
              <h3 className="font-semibold text-xl tracking-tight">
                Yours, or the whole team&apos;s
              </h3>
              <p className="mt-2 text-pretty text-muted-foreground text-sm">
                Switch to an organization and everyone files into one shared
                set, with one shared list of categories.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow={`${RECEIPT_TYPES.length} categories built in`}
            title="One taxonomy, so month-end stops being a negotiation"
          />
        </div>
        <div className="mx-auto mt-10 w-full max-w-7xl">
          <CategoryRail />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="relative isolate overflow-hidden rounded-3xl border bg-[#F5F1EA] dark:bg-[#110F0C]">
          <CtaSphere />
          <div className="relative flex max-w-lg flex-col items-start gap-5 px-6 pt-52 pb-12 sm:px-10 sm:py-20">
            <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
              <ScanLineIcon className="size-5" />
            </span>
            <h2 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
              Clear the shoebox this month.
            </h2>
            <p className="text-pretty text-muted-foreground">
              Start with one receipt and see the whole flow in under a minute.
            </p>
            <Suspense fallback={<PrimaryCtaSkeleton />}>
              <PrimaryCta />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  )
}
