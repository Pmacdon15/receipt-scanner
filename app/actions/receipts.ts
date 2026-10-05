"use server"

import { revalidatePath } from "next/cache"

import {
  createReceipt,
  removeReceipt,
  setReceiptType,
  suggestReceiptType,
  UnauthorizedError,
} from "@/lib/dal/receipts"
import { MAX_DATA_URL_BYTES } from "@/lib/compress-image"
import { parseMoneyToCents } from "@/lib/money"
import { isReceiptTypeId } from "@/lib/receipt-types"

export type ScanFormState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors: Partial<
    Record<"merchant" | "total" | "receiptType" | "image", string>
  >
}

export async function scanReceiptAction(
  _prevState: ScanFormState,
  formData: FormData
): Promise<ScanFormState> {
  const merchant = String(formData.get("merchant") ?? "").trim()
  const totalCents = parseMoneyToCents(formData.get("total"))
  const rawType = formData.get("receiptType")

  const fieldErrors: ScanFormState["fieldErrors"] = {}

  if (merchant.length === 0) {
    fieldErrors.merchant = "Enter where the receipt is from."
  } else if (merchant.length > 200) {
    fieldErrors.merchant = "Keep the merchant name under 200 characters."
  }

  if (totalCents === null) {
    fieldErrors.total = "Enter the receipt total."
  } else if (totalCents < 0) {
    fieldErrors.total = "The total cannot be negative."
  }

  // An empty string means "use whatever detection picked".
  const wantsExplicitType = typeof rawType === "string" && rawType !== ""
  if (wantsExplicitType && !isReceiptTypeId(rawType)) {
    fieldErrors.receiptType = "Pick a type from the list."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors,
    }
  }

  const imageDataUrl = readImageDataUrl(formData.get("imageDataUrl"))
  if (imageDataUrl === INVALID_IMAGE) {
    return {
      status: "error",
      message: "That photo could not be attached. Try scanning it again.",
      fieldErrors: { image: "Unsupported or oversized image." },
    }
  }

  const purchasedOnRaw = String(formData.get("purchasedOn") ?? "").trim()
  const notesRaw = String(formData.get("notes") ?? "").trim()
  const rawTextRaw = String(formData.get("rawText") ?? "").trim()

  try {
    const receipt = await createReceipt({
      merchant,
      purchasedOn: purchasedOnRaw === "" ? null : purchasedOnRaw,
      currency: "CAD",
      subtotalCents: parseMoneyToCents(formData.get("subtotal")),
      taxCents: parseMoneyToCents(formData.get("tax")),
      totalCents: totalCents!,
      receiptType:
        wantsExplicitType && isReceiptTypeId(rawType) ? rawType : undefined,
      rawText: rawTextRaw === "" ? null : rawTextRaw,
      imageUrl: imageDataUrl,
      notes: notesRaw === "" ? null : notesRaw,
    })

    revalidatePath("/scan")

    return {
      status: "success",
      message: `Saved ${receipt.merchant}.`,
      fieldErrors: {},
    }
  } catch (error) {
    return { status: "error", ...describeError(error) }
  }
}

export async function setReceiptTypeAction(id: string, receiptType: string) {
  if (!isReceiptTypeId(receiptType)) {
    return { status: "error" as const, message: "Unknown receipt type." }
  }

  try {
    const updated = await setReceiptType(id, receiptType)
    if (!updated) {
      return { status: "error" as const, message: "Receipt not found." }
    }

    revalidatePath("/scan")
    return { status: "success" as const, message: "Type updated." }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

export async function deleteReceiptAction(id: string) {
  try {
    const deleted = await removeReceipt(id)
    if (!deleted) {
      return { status: "error" as const, message: "Receipt not found." }
    }

    revalidatePath("/scan")
    return { status: "success" as const, message: "Receipt deleted." }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

export async function suggestReceiptTypeAction(input: {
  merchant?: string | null
  rawText?: string | null
}) {
  try {
    return { status: "success" as const, ...(await suggestReceiptType(input)) }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

/** Sentinel for a present-but-rejected image, distinct from "no image sent". */
const INVALID_IMAGE = Symbol("invalid-image")

// The client compresses before posting, but a Server Action is a public POST
// endpoint, so the payload is re-checked here rather than trusted. Only the
// JPEG data URLs compressImage produces are accepted.
const ALLOWED_IMAGE_PREFIX = "data:image/jpeg;base64,"

// Leaves room for the client's own budget without allowing an unbounded string.
const MAX_IMAGE_CHARS = MAX_DATA_URL_BYTES + 4096

function readImageDataUrl(
  value: FormDataEntryValue | null
): string | null | typeof INVALID_IMAGE {
  if (typeof value !== "string" || value === "") return null
  if (!value.startsWith(ALLOWED_IMAGE_PREFIX)) return INVALID_IMAGE
  if (value.length > MAX_IMAGE_CHARS) return INVALID_IMAGE

  const payload = value.slice(ALLOWED_IMAGE_PREFIX.length)
  if (payload === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return INVALID_IMAGE
  }

  return value
}

function describeError(error: unknown): {
  message: string
  fieldErrors: ScanFormState["fieldErrors"]
} {
  if (error instanceof UnauthorizedError) {
    return { message: "Sign in to save receipts.", fieldErrors: {} }
  }

  console.error("receipt action failed", error)
  return {
    message: "Something went wrong saving that. Try again.",
    fieldErrors: {},
  }
}
