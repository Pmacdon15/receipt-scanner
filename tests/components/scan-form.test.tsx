import { beforeEach, describe, expect, mock, test } from "bun:test"

import type { ScanFormState } from "@/app/actions/receipts"

import { setupDom } from "../helpers/dom"

const { render, fireEvent, waitFor } = await setupDom()

type Suggestion =
  | { status: "success"; type: string; confidence: number }
  | { status: "error"; message: string }

const actions = {
  scanReceiptAction: mock<
    (state: ScanFormState, formData: FormData) => Promise<ScanFormState>
  >(async (_, formData) => ({
    status: "success",
    message: `Saved ${formData.get("merchant")}.`,
    fieldErrors: {},
  })),
  suggestReceiptTypeAction: mock<
    (input: { merchant?: string; rawText?: string }) => Promise<Suggestion>
  >(async () => ({ status: "success", type: "fuel", confidence: 0.76 })),
}
const toast = { success: mock(), error: mock() }

mock.module("@/app/actions/receipts", () => actions)
mock.module("sonner", () => ({ toast }))

const { ScanForm } = await import("@/components/scanner/scan-form")

beforeEach(() => {
  actions.scanReceiptAction.mockClear()
  actions.suggestReceiptTypeAction.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

function input(view: ReturnType<typeof render>, label: string) {
  return view.getByLabelText(label) as HTMLInputElement
}

describe("ScanForm", () => {
  test("starts empty with a hint about detection", () => {
    const view = render(<ScanForm />)

    expect(input(view, "Merchant").value).toBe("")
    expect(view.getByText(/a type will be suggested here/)).toBeTruthy()
    expect(view.getByText("Saving as").textContent).toContain("Other")
    expect(view.getByRole("button", { name: "Save receipt" })).toBeTruthy()
  })

  test("previews the detected type after the user stops typing", async () => {
    const view = render(<ScanForm />)

    fireEvent.change(input(view, "Merchant"), { target: { value: "Shell" } })

    await waitFor(
      () =>
        expect(view.getByText(/will be used unless you pick one/)).toBeTruthy(),
      { timeout: 2000 }
    )
    expect(actions.suggestReceiptTypeAction).toHaveBeenCalledTimes(1)
    expect(actions.suggestReceiptTypeAction).toHaveBeenCalledWith({
      merchant: "Shell",
      rawText: "",
    })
    expect(view.getByText("76%")).toBeTruthy()
    expect(view.getByText("Saving as").textContent).toContain(
      "Fuel & Transport"
    )
  })

  test("shows no suggestion when detection is not confident", async () => {
    actions.suggestReceiptTypeAction.mockImplementationOnce(async () => ({
      status: "success",
      type: "other",
      confidence: 0,
    }))
    const view = render(<ScanForm />)

    fireEvent.change(input(view, "Merchant"), { target: { value: "Zzyzx" } })

    await waitFor(
      () => expect(actions.suggestReceiptTypeAction).toHaveBeenCalled(),
      {
        timeout: 2000,
      }
    )
    await waitFor(() =>
      expect(view.getByText(/a type will be suggested here/)).toBeTruthy()
    )
  })

  test("shows field errors returned by the server", async () => {
    actions.scanReceiptAction.mockImplementationOnce(async () => ({
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors: { total: "Enter the receipt total." },
    }))
    const view = render(<ScanForm />)

    fireEvent.submit(
      view.getByRole("button", { name: "Save receipt" }).closest("form")!
    )

    await waitFor(() =>
      expect(view.getByText("Enter the receipt total.")).toBeTruthy()
    )
    expect(input(view, "Total").getAttribute("aria-invalid")).toBe("true")
    expect(toast.error).toHaveBeenCalledWith(
      "Fix the highlighted fields and try again."
    )
  })

  test("submits the form fields and clears the form on success", async () => {
    const view = render(<ScanForm />)

    fireEvent.change(input(view, "Merchant"), { target: { value: "Shell" } })
    fireEvent.change(input(view, "Total"), { target: { value: "54.10" } })
    fireEvent.change(input(view, "Notes"), { target: { value: "road trip" } })
    fireEvent.submit(
      view.getByRole("button", { name: "Save receipt" }).closest("form")!
    )

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Saved Shell.")
    )

    const formData = actions.scanReceiptAction.mock.calls[0][1]
    expect(formData.get("merchant")).toBe("Shell")
    expect(formData.get("total")).toBe("54.10")
    expect(formData.get("notes")).toBe("road trip")

    await waitFor(() => expect(input(view, "Merchant").value).toBe(""))
    expect(input(view, "Total").value).toBe("")
    expect(input(view, "Notes").value).toBe("")
  })
})
