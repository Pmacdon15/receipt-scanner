import { beforeEach, describe, expect, mock, test } from "bun:test"

import { setupDom } from "../helpers/dom"
import { makeReceipt } from "../helpers/fixtures"

const { render, fireEvent, waitFor, within } = await setupDom()

type ActionResult = { status: "success" | "error"; message: string }

const actions = {
  deleteReceiptAction: mock<(id: string) => Promise<ActionResult>>(
    async () => ({ status: "success", message: "Receipt deleted." })
  ),
  setReceiptTypeAction: mock<
    (id: string, type: string) => Promise<ActionResult>
  >(async () => ({ status: "success", message: "Type updated." })),
  setReceiptSplitsAction: mock<
    (
      id: string,
      splits: { type: string; amountCents: number }[]
    ) => Promise<ActionResult>
  >(async () => ({ status: "success", message: "Split updated." })),
}
const toast = { success: mock(), error: mock() }

mock.module("@/app/actions/receipts", () => actions)
mock.module("sonner", () => ({ toast }))

const { ReceiptList } = await import("@/components/scanner/receipt-list")

beforeEach(() => {
  actions.deleteReceiptAction.mockClear()
  actions.setReceiptTypeAction.mockClear()
  actions.setReceiptSplitsAction.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

describe("ReceiptList", () => {
  test("shows an empty state", () => {
    const view = render(<ReceiptList receipts={[]} />)
    expect(view.getByText("No receipts yet")).toBeTruthy()
  })

  test("shows each receipt with its amount and how its type was chosen", () => {
    const view = render(
      <ReceiptList
        receipts={[
          makeReceipt({ merchant: "Safeway", detectedConfidence: 0.76 }),
          makeReceipt({
            merchant: "Shell",
            receiptType: "fuel",
            typeSource: "user",
            totalCents: 6000,
          }),
          makeReceipt({ merchant: "Mystery", detectedConfidence: null }),
        ]}
      />
    )

    const [safeway, shell, mystery] = view.getAllByRole("listitem")
    expect(safeway.textContent).toContain("Detected76%")
    expect(safeway.textContent).toContain("Mar 1, 2025 · $42.50")
    expect(shell.textContent).toContain("You picked")
    expect(shell.textContent).toContain("$60.00")
    expect(mystery.textContent).toContain("Detected")
    expect(mystery.textContent).not.toContain("%")
  })

  test("asks before deleting, then deletes on confirm", async () => {
    const receipt = makeReceipt({ merchant: "Safeway" })
    const view = render(<ReceiptList receipts={[receipt]} />)

    fireEvent.click(
      view.getByRole("button", { name: "Delete receipt from Safeway" })
    )

    const dialog = await view.findByRole("alertdialog")
    expect(dialog.textContent).toContain("Delete this receipt?")
    expect(dialog.textContent).toContain("Safeway")
    expect(actions.deleteReceiptAction).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Receipt deleted.")
    )
    expect(actions.deleteReceiptAction).toHaveBeenCalledWith(receipt.id)
  })

  test("a failed delete shows the error", async () => {
    actions.deleteReceiptAction.mockImplementationOnce(async () => ({
      status: "error",
      message: "Receipt not found.",
    }))
    const view = render(<ReceiptList receipts={[makeReceipt()]} />)

    fireEvent.click(view.getByRole("button", { name: /Delete receipt/ }))
    const dialog = await view.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Receipt not found.")
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  test("cancelling the dialog keeps the receipt", async () => {
    const view = render(<ReceiptList receipts={[makeReceipt()]} />)

    fireEvent.click(view.getByRole("button", { name: /Delete receipt/ }))
    const dialog = await view.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull())
    expect(actions.deleteReceiptAction).not.toHaveBeenCalled()
  })

  test("shows a photo button only when a receipt has an image", () => {
    const withPhoto = makeReceipt({ merchant: "With Photo", hasImage: true })
    const withoutPhoto = makeReceipt({ merchant: "No Photo", hasImage: false })
    const view = render(<ReceiptList receipts={[withPhoto, withoutPhoto]} />)

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

  test("shows a split receipt's parts", () => {
    const view = render(
      <ReceiptList
        receipts={[
          makeReceipt({
            merchant: "Costco",
            totalCents: 4217,
            splits: [
              { type: "grocery", amountCents: 3000 },
              { type: "hardware", amountCents: 1217 },
            ],
          }),
        ]}
      />
    )

    expect(view.getByText(/Hardware & Supplies/)).toBeTruthy()
  })

  test("edits the detected categories and amounts of a saved receipt", async () => {
    const receipt = makeReceipt({ merchant: "Costco", totalCents: 4217 })
    const view = render(<ReceiptList receipts={[receipt]} />)

    fireEvent.click(
      view.getByRole("button", {
        name: "Split or edit the categories of the receipt from Costco",
      })
    )

    // Starts as the current category with the whole total, plus an empty part.
    const first = view.getByLabelText("Amount for part 1") as HTMLInputElement
    expect(first.value).toBe("42.17")

    fireEvent.change(first, { target: { value: "30.00" } })
    fireEvent.click(view.getByRole("button", { name: "Save split" }))

    // Part 2 has no category yet, so nothing is sent.
    expect(actions.setReceiptSplitsAction).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})
