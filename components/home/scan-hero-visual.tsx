import { CameraIcon, CheckIcon, LockIcon, SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/money"
import { receiptTypeLabel } from "@/lib/receipt-types"
import { cn } from "@/lib/utils"

// Illustrative only — a worked example of one receipt going through the
// scanner. Amounts run through the same formatters the real receipt list
// uses, so the hero cannot drift from how stored receipts render.
const SAMPLE = {
  merchant: "Harbour Street Market",
  address: "118 Harbour St · Halifax",
  date: "Oct 2, 2026",
  type: "grocery",
  confidence: 0.94,
  lines: [
    { label: "Sourdough loaf", cents: 750 },
    { label: "Free-range eggs", cents: 689 },
    { label: "Oat milk 2L", cents: 549 },
    { label: "Coffee beans 1kg", cents: 2899 },
    { label: "Seasonal produce", cents: 3328 },
  ],
  subtotalCents: 8215,
  taxCents: 411,
  totalCents: 8626,
}

/** The zigzag tear along the bottom of the paper receipt. */
const TEAR =
  "polygon(0 0,100% 0,100% calc(100% - 8px),95% 100%,90% calc(100% - 8px),85% 100%,80% calc(100% - 8px),75% 100%,70% calc(100% - 8px),65% 100%,60% calc(100% - 8px),55% 100%,50% calc(100% - 8px),45% 100%,40% calc(100% - 8px),35% 100%,30% calc(100% - 8px),25% 100%,20% calc(100% - 8px),15% 100%,10% calc(100% - 8px),5% 100%,0 calc(100% - 8px))"

/**
 * Hero visual: a paper receipt under a sweeping scan beam, with the saved
 * record it becomes floating beside it. Pure CSS motion, so it renders on the
 * server and settles into its finished state under reduced motion.
 */
export function ScanHeroVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-md pb-36 lg:max-w-none",
        className
      )}
    >
      {/* Soft glow that lifts the paper off the dot grid. */}
      <div
        aria-hidden
        className="absolute inset-x-6 top-10 bottom-20 -z-10 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-400/10"
      />

      {/* The paper receipt. */}
      <figure
        aria-label="Example receipt being scanned"
        className="relative w-[78%] max-w-xs -rotate-2 drop-shadow-xl sm:w-[70%]"
      >
        <div
          className="relative overflow-hidden bg-[#fbf8f2] px-5 pt-6 pb-8 font-mono text-[11px] text-stone-700 leading-relaxed dark:bg-[#e9e4da] dark:text-stone-800"
          style={{ clipPath: TEAR }}
        >
          <div className="text-center">
            <p className="font-bold text-stone-900 text-xs uppercase tracking-widest">
              {SAMPLE.merchant}
            </p>
            <p className="text-stone-500">{SAMPLE.address}</p>
            <p className="text-stone-500">{SAMPLE.date} · 10:42</p>
          </div>

          <div className="my-3 border-stone-400 border-t border-dashed" />

          <ul className="flex flex-col gap-0.5">
            {SAMPLE.lines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span className="truncate">{line.label}</span>
                <span className="tabular-nums">{formatMoney(line.cents)}</span>
              </li>
            ))}
          </ul>

          <div className="my-3 border-stone-400 border-t border-dashed" />

          <dl className="flex flex-col gap-0.5">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">
                {formatMoney(SAMPLE.subtotalCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>HST</dt>
              <dd className="tabular-nums">{formatMoney(SAMPLE.taxCents)}</dd>
            </div>
            <div className="mt-1 flex justify-between font-bold text-[13px] text-stone-900">
              <dt>TOTAL</dt>
              <dd className="tabular-nums">{formatMoney(SAMPLE.totalCents)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-center text-stone-400 tracking-[0.3em]">
            ||| || ||| | |||| ||
          </p>

          {/* Scan beam. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-16 -translate-y-full animate-home-beam bg-linear-to-b from-transparent to-emerald-400/35"
          >
            <div className="absolute inset-x-0 bottom-0 h-px bg-emerald-500 shadow-[0_0_12px_2px] shadow-emerald-400/70" />
          </div>
        </div>

        {/* Viewfinder corners. */}
        <span
          aria-hidden
          className="absolute -top-2 -left-2 size-5 rounded-tl-md border-emerald-500 border-t-2 border-l-2"
        />
        <span
          aria-hidden
          className="absolute -top-2 -right-2 size-5 rounded-tr-md border-emerald-500 border-t-2 border-r-2"
        />
        <span
          aria-hidden
          className="absolute -bottom-2 -left-2 size-5 rounded-bl-md border-emerald-500 border-b-2 border-l-2"
        />
        <span
          aria-hidden
          className="absolute -right-2 -bottom-2 size-5 rounded-br-md border-emerald-500 border-r-2 border-b-2"
        />

        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-emerald-950">
          <CameraIcon className="size-3" />
          Photo captured
        </Badge>
      </figure>

      {/* The saved record. */}
      <div className="absolute right-0 bottom-0 w-[74%] max-w-xs animate-home-rise rounded-2xl border bg-card/95 p-4 shadow-2xl backdrop-blur [animation-delay:400ms] sm:w-[62%] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{SAMPLE.merchant}</p>
            <p className="text-muted-foreground text-xs">{SAMPLE.date}</p>
          </div>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" />
          </span>
        </div>

        <p className="mt-3 font-mono font-semibold text-2xl tabular-nums tracking-tight">
          {formatMoney(SAMPLE.totalCents)}
        </p>
        <p className="font-mono text-muted-foreground text-xs tabular-nums">
          {formatMoney(SAMPLE.subtotalCents)} + {formatMoney(SAMPLE.taxCents)}{" "}
          tax
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <SparklesIcon className="size-3.5" />
              {receiptTypeLabel(SAMPLE.type)}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {Math.round(SAMPLE.confidence * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${SAMPLE.confidence * 100}%` }}
            />
          </div>
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LockIcon className="size-3" />
          Photo stored privately with the receipt
        </p>
      </div>
    </div>
  )
}
