import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test"

import { setupDom } from "../helpers/dom"
import { makeSearchedReceipt } from "../helpers/fixtures"

const { render, fireEvent, waitFor } = await setupDom()

type ActionResult = { status: "success" | "error"; message: string }

const actions = {
  deleteReceiptAction: mock<(id: string) => Promise<ActionResult>>(
    async () => ({ status: "success", message: "Receipt deleted." })
  ),
}
const toast = { success: mock(), error: mock() }

mock.module("@/app/actions/receipts", () => actions)
mock.module("sonner", () => ({ toast }))

const { SearchResults } = await import("@/components/search/search-results")

beforeEach(() => {
  actions.deleteReceiptAction.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

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

  test("offers a photo button only for receipts with a photo", () => {
    const view = render(
      <SearchResults
        receipts={[
          makeSearchedReceipt({ merchant: "With Photo", hasImage: true }),
          makeSearchedReceipt({ merchant: "No Photo", hasImage: false }),
        ]}
        showUploader={false}
        filtered={false}
      />
    )

    expect(
      view.getByRole("button", {
        name: "View the photo of the receipt from With Photo",
      })
    ).toBeTruthy()
    expect(
      view.queryByRole("button", {
        name: "View the photo of the receipt from No Photo",
      })
    ).toBeNull()
  })

  test("offers delete only on the user's own receipts", () => {
    const view = render(
      <SearchResults
        receipts={[
          makeSearchedReceipt({ merchant: "Mine", isMine: true }),
          makeSearchedReceipt({ merchant: "Theirs", isMine: false }),
        ]}
        showUploader
        filtered={false}
      />
    )

    expect(
      view.getByRole("button", { name: "Delete receipt from Mine" })
    ).toBeTruthy()
    expect(
      view.queryByRole("button", { name: "Delete receipt from Theirs" })
    ).toBeNull()
  })

  test("deletes a receipt once confirmed and reports it", async () => {
    const confirm = spyOn(window, "confirm").mockImplementation(() => true)
    const onDeleted = mock<(id: string) => void>()
    const receipt = makeSearchedReceipt({ merchant: "Safeway" })
    const view = render(
      <SearchResults
        receipts={[receipt]}
        showUploader={false}
        filtered={false}
        onDeleted={onDeleted}
      />
    )

    fireEvent.click(
      view.getByRole("button", { name: "Delete receipt from Safeway" })
    )

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(receipt.id))
    expect(actions.deleteReceiptAction).toHaveBeenCalledWith(receipt.id)
    expect(toast.success).toHaveBeenCalledWith("Receipt deleted.")
    confirm.mockRestore()
  })

  test("does nothing when the delete is not confirmed", () => {
    const confirm = spyOn(window, "confirm").mockImplementation(() => false)
    const view = render(
      <SearchResults
        receipts={[makeSearchedReceipt({ merchant: "Safeway" })]}
        showUploader={false}
        filtered={false}
      />
    )

    fireEvent.click(
      view.getByRole("button", { name: "Delete receipt from Safeway" })
    )

    expect(actions.deleteReceiptAction).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  test("shows the error and keeps the receipt when the delete fails", async () => {
    const confirm = spyOn(window, "confirm").mockImplementation(() => true)
    actions.deleteReceiptAction.mockImplementationOnce(async () => ({
      status: "error",
      message: "Receipt not found.",
    }))
    const onDeleted = mock<(id: string) => void>()
    const view = render(
      <SearchResults
        receipts={[makeSearchedReceipt({ merchant: "Safeway" })]}
        showUploader={false}
        filtered={false}
        onDeleted={onDeleted}
      />
    )

    fireEvent.click(
      view.getByRole("button", { name: "Delete receipt from Safeway" })
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Receipt not found.")
    )
    expect(onDeleted).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})
