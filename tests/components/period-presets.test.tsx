import { describe, expect, test } from "bun:test"

import { localDateString } from "@/lib/dates"
import { periodPresets } from "@/lib/documents/periods"
import { documentsHref } from "@/lib/search-params"
import { setupDom } from "../helpers/dom"

const { render } = await setupDom()
const { PeriodPresets } = await import("@/components/documents/period-presets")

describe("PeriodPresets", () => {
  test("builds the ranges from the browser's own date (#22)", () => {
    const presets = periodPresets(localDateString())
    const thisMonth = presets.find((p) => p.id === "this-month")
    const view = render(<PeriodPresets params={{ scope: "mine" }} />)

    // Base UI gives a Button rendered as a link role="button".
    const link = view.getByRole("button", { name: "This month" })
    expect(link.getAttribute("href")).toBe(
      documentsHref({
        scope: "mine",
        purchasedFrom: thisMonth?.from,
        purchasedTo: thisMonth?.to,
      })
    )
  })

  test("marks the chip that matches the current dates", () => {
    const year = periodPresets(localDateString()).find(
      (p) => p.id === "this-year"
    )
    const view = render(
      <PeriodPresets
        params={{
          scope: "mine",
          purchasedFrom: year?.from,
          purchasedTo: year?.to,
        }}
      />
    )

    const current = (name: string) =>
      view.getByRole("button", { name }).getAttribute("aria-current")
    expect(current("This year")).toBe("true")
    expect(current("All dates")).toBeNull()
  })
})
