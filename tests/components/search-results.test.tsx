import { describe, expect, test } from "bun:test"

import { setupDom } from "../helpers/dom"
import { makeSearchedReceipt } from "../helpers/fixtures"

const { render } = await setupDom()
const { SearchResults } = await import("@/components/search/search-results")

describe("SearchResults", () => {
  test("invites a first scan when there are no receipts at all", () => {
    const view = render(
      <SearchResults receipts={[]} showUploader={false} filtered={false} />
    )

    expect(view.getByText("No receipts yet")).toBeTruthy()
    const link = view.getByRole("link", { name: "Scan a receipt" })
    expect(link.getAttribute("href")).toBe("/scan")
  })

  test("suggests loosening filters when a filtered search is empty", () => {
    const view = render(
      <SearchResults receipts={[]} showUploader={false} filtered />
    )

    expect(view.getByText("No receipts match")).toBeTruthy()
    expect(view.queryByRole("link")).toBeNull()
  })

  test("lists each receipt with its date, total, type and notes", () => {
    const view = render(
      <SearchResults
        receipts={[
          makeSearchedReceipt({ merchant: "Safeway", notes: "weekly shop" }),
          makeSearchedReceipt({
            merchant: "Shell",
            receiptType: "fuel",
            totalCents: 6000,
            typeSource: "user",
            purchasedOn: null,
          }),
        ]}
        showUploader={false}
        filtered={false}
      />
    )

    const items = view.getAllByRole("listitem")
    expect(items).toHaveLength(2)

    expect(items[0].textContent).toContain("Safeway")
    expect(items[0].textContent).toContain("Mar 1, 2025")
    expect(items[0].textContent).toContain("$42.50")
    expect(items[0].textContent).toContain("Grocery")
    expect(items[0].textContent).toContain("weekly shop")
    expect(items[0].textContent).toContain("Detected")

    expect(items[1].textContent).toContain("No date")
    expect(items[1].textContent).toContain("$60.00")
    expect(items[1].textContent).toContain("Fuel & Transport")
    expect(items[1].textContent).toContain("Picked")
  })

  test("shows who uploaded each receipt only when asked", () => {
    const receipts = [
      makeSearchedReceipt({ uploadedBy: "Bea Lee", isMine: false }),
    ]

    const hidden = render(
      <SearchResults
        receipts={receipts}
        showUploader={false}
        filtered={false}
      />
    )
    expect(hidden.queryByText(/Bea Lee/)).toBeNull()
    hidden.unmount()

    const shown = render(
      <SearchResults receipts={receipts} showUploader filtered={false} />
    )
    expect(shown.getByText(/Bea Lee/)).toBeTruthy()
  })
})
