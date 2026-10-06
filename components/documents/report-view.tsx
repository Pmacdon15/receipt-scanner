import { SplitSummary } from "@/components/receipts/split-summary"
import { Card, CardContent } from "@/components/ui/card"
import type { ExportedReceipt } from "@/lib/dal/receipts"
import {
  type CurrencyTotals,
  categoryLabel,
  describePeriod,
  type ReceiptReport,
} from "@/lib/documents/report"
import { formatDate, formatMoney } from "@/lib/money"

/**
 * The report itself, as the page shows it and as it prints (the browser's
 * print uses this, with the header, filters and buttons hidden).
 */
export function ReportView({
  report,
  receipts,
  scopeLabel,
  from,
  to,
  showUploader,
}: {
  report: ReceiptReport
  receipts: ExportedReceipt[]
  scopeLabel: string
  from?: string
  to?: string
  showUploader: boolean
}) {
  return (
    <article className="flex flex-col gap-8 print:gap-6 print:text-black">
      {/* Only on paper: the page heading and filters are hidden there. */}
      <header className="hidden print:block">
        <h1 className="font-semibold text-2xl">Receipt report</h1>
        <p className="text-sm">
          {scopeLabel} · {describePeriod(from, to)} · {report.receiptCount}{" "}
          receipts
        </p>
      </header>

      {report.currencies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No receipts in this period. Pick another range above, or scan some
            receipts first.
          </CardContent>
        </Card>
      )}

      {report.currencies.map((totals) => (
        <CurrencySection
          key={totals.currency}
          totals={totals}
          labelled={report.currencies.length > 1}
          hasSplits={receipts.some(
            (r) => r.currency === totals.currency && r.splits
          )}
        />
      ))}

      {receipts.length > 0 && (
        <section className="flex flex-col gap-3 print:break-before-page">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-xl tracking-tight">Receipts</h2>
            <p className="text-muted-foreground text-sm">
              {receipts.length} in this period
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10 print:overflow-visible print:ring-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground text-xs uppercase print:bg-transparent">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Merchant</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  {showUploader && (
                    <th className="px-3 py-2 font-medium">Uploaded by</th>
                  )}
                  <th className="px-3 py-2 text-right font-medium">Tax</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr
                    key={r.id}
                    className="break-inside-avoid border-t align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatDate(r.purchasedOn)}
                    </td>
                    <td className="px-3 py-2">{r.merchant}</td>
                    <td className="px-3 py-2">
                      {categoryLabel(r)}
                      {r.splits && (
                        <SplitSummary splits={r.splits} currency={r.currency} />
                      )}
                    </td>
                    {showUploader && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.uploadedBy}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {r.taxCents == null
                        ? "—"
                        : formatMoney(r.taxCents, r.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(r.totalCents, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </article>
  )
}

function CurrencySection({
  totals,
  labelled,
  hasSplits,
}: {
  totals: CurrencyTotals
  labelled: boolean
  hasSplits: boolean
}) {
  const money = (cents: number) => formatMoney(cents, totals.currency)
  const partial =
    totals.taxKnown < totals.receiptCount ||
    totals.subtotalKnown < totals.receiptCount

  return (
    <section className="flex break-inside-avoid-page flex-col gap-6">
      {labelled && (
        <h2 className="font-semibold text-xl tracking-tight">
          {totals.currency} receipts
        </h2>
      )}

      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total spent" value={money(totals.totalCents)} />
          <Stat label="Tax" value={money(totals.taxCents)} />
          <Stat label="Subtotal" value={money(totals.subtotalCents)} />
          <Stat label="Receipts" value={String(totals.receiptCount)} />
        </div>
        {partial && (
          <p className="mt-2 text-muted-foreground text-xs">
            Tax is recorded on {totals.taxKnown} of {totals.receiptCount}{" "}
            receipts and the subtotal on {totals.subtotalKnown}; the totals
            above add up what is recorded.
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2 print:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">By category</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground text-xs uppercase">
              <tr>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Receipts</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {totals.byCategory.map((cat) => (
                <tr key={cat.type} className="border-t">
                  <td className="py-2 pr-3">
                    <div>{cat.label}</div>
                    <div
                      className="mt-1 h-1.5 rounded-full bg-muted print:bg-gray-200"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-foreground/70 print:bg-gray-700"
                        style={{ width: `${Math.max(cat.share * 100, 1)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-right align-top tabular-nums">
                    {cat.receiptCount}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right align-top tabular-nums">
                    {money(cat.totalCents)}
                    <div className="text-muted-foreground text-xs">
                      {Math.round(cat.share * 100)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasSplits && (
            <p className="text-muted-foreground text-xs">
              A split receipt counts under each of its categories, with only
              that category&apos;s share of the money.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">By month</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground text-xs uppercase">
              <tr>
                <th className="pb-2 font-medium">Month</th>
                <th className="pb-2 text-right font-medium">Receipts</th>
                <th className="pb-2 text-right font-medium">Tax</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {totals.byMonth.map((m) => (
                <tr key={m.month ?? "none"} className="border-t">
                  <td className="py-2">{m.label}</td>
                  <td className="py-2 text-right tabular-nums">
                    {m.receiptCount}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">
                    {money(m.taxCents)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums">
                    {money(m.totalCents)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">
                  {totals.receiptCount}
                </td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">
                  {money(totals.taxCents)}
                </td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">
                  {money(totals.totalCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="print:ring-gray-300">
      <CardContent className="py-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
