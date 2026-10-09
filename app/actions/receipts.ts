"use server"

import { revalidatePath, updateTag } from "next/cache"

import { receiptChangeTags } from "@/lib/cache-tags"
import {
  createReceipt,
  InvalidInputError,
  removeReceipt,
  requireUserId,
  setReceiptSplits,
  setReceiptType,
  suggestReceiptType,
  UnauthorizedError,
} from "@/lib/dal/receipts"
import { extractReceiptFieldsSafely } from "@/lib/extract-receipt"
import { isOwnReceiptImagePathname } from "@/lib/receipt-image"
import {
  deleteReceiptInputSchema,
  fieldErrorsFrom,
  firstErrorMessage,
  type ScanReceiptField,
  scanReceiptFormSchema,
  setReceiptSplitsInputSchema,
  setReceiptTypeInputSchema,
  suggestReceiptTypeInputSchema,
} from "@/lib/schemas"

export type ScanFormState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors: Partial<Record<ScanReceiptField, string>>
}

export async function scanReceiptAction(
  _prevState: ScanFormState,
  formData: FormData
): Promise<ScanFormState> {
  // Same schema the form checks before submitting; re-run here because the
  // action can be called directly, bypassing the browser.
  const parsed = scanReceiptFormSchema.safeParse(Object.fromEntries(formData))

  if (!parsed.success) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom<ScanReceiptField>(parsed.error),
    }
  }

  const form = parsed.data

  try {
    // The browser posts back the pathname the upload route minted for it, so it
    // is user input and is checked against the caller's own blob folder here —
    // otherwise one user could attach another user's photo to their receipt.
    const rawPathname = formData.get("imagePathname")
    const hasPathname = typeof rawPathname === "string" && rawPathname !== ""
    const userId = await requireUserId()

    if (hasPathname && !isOwnReceiptImagePathname(rawPathname, userId)) {
      return {
        status: "error",
        message: "That photo could not be attached. Try scanning it again.",
        fieldErrors: { image: "That photo is not available to attach." },
      }
    }

    const receipt = await createReceipt({
      merchant: form.merchant,
      purchasedOn: form.purchasedOn,
      currency: "CAD",
      subtotalCents: form.subtotal,
      taxCents: form.tax,
      totalCents: form.total,
      receiptType: form.receiptType,
      rawText: form.rawText,
      imageUrl: hasPathname ? rawPathname : null,
      notes: form.notes,
      splits: form.splits,
      detected:
        form.detectedType !== undefined && form.detectedConfidence !== undefined
          ? { type: form.detectedType, confidence: form.detectedConfidence }
          : undefined,
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

/**
 * Reads the fields off a photo the user just uploaded, to pre-fill the scan
 * form. Only the caller's own photos can be read, by the same pathname check
 * the save uses.
 */
export async function extractReceiptAction(imagePathname: string) {
  try {
    const userId = await requireUserId()
    if (!isOwnReceiptImagePathname(imagePathname, userId)) {
      return {
        status: "error" as const,
        message: "That photo could not be read.",
      }
    }

    const result = await extractReceiptFieldsSafely(imagePathname)
    return { status: "success" as const, ...result }
  } catch (error) {
    return { status: "error" as const, message: describeError(error).message }
  }
}

export async function setReceiptTypeAction(id: string, receiptType: string) {
  const parsed = setReceiptTypeInputSchema.safeParse({ id, receiptType })
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: firstErrorMessage(parsed.error, "Unknown receipt type."),
    }
  }

  try {
    const updated = await setReceiptType(
      parsed.data.id,
      parsed.data.receiptType
    )
    if (!updated) {
      return { status: "error" as const, message: "Receipt not found." }
    }

    revalidatePath("/scan")
    return { status: "success" as const, message: "Type updated." }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

export async function setReceiptSplitsAction(
  id: string,
  splits: { type: string; amountCents: number }[]
) {
  const parsed = setReceiptSplitsInputSchema.safeParse({ id, splits })
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: firstErrorMessage(parsed.error, "That split is not valid."),
    }
  }

  try {
    const updated = await setReceiptSplits(parsed.data.id, parsed.data.splits)
    if (!updated) {
      return { status: "error" as const, message: "Receipt not found." }
    }

    revalidatePath("/scan")
    revalidatePath("/search")
    return { status: "success" as const, message: "Split updated." }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

/**
 * Deletes one of the caller's receipts, from the scan list or the search page,
 * along with its photo. updateTag expires the user's (and the org's) cached
 * receipt data so the next read in this request sees it gone.
 */
export async function deleteReceiptAction(id: string) {
  const parsed = deleteReceiptInputSchema.safeParse({ id })
  if (!parsed.success) {
    return { status: "error" as const, message: "Receipt not found." }
  }

  try {
    const deleted = await removeReceipt(parsed.data)
    if (!deleted) {
      return { status: "error" as const, message: "Receipt not found." }
    }

    for (const tag of receiptChangeTags(deleted)) updateTag(tag)
    revalidatePath("/scan")
    revalidatePath("/search")
    return { status: "success" as const, message: "Receipt deleted." }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

export async function suggestReceiptTypeAction(input: {
  merchant?: string | null
  rawText?: string | null
}) {
  const parsed = suggestReceiptTypeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: firstErrorMessage(
        parsed.error,
        "That text is too long to check."
      ),
      fieldErrors: {},
    }
  }

  try {
    return {
      status: "success" as const,
      ...(await suggestReceiptType(parsed.data)),
    }
  } catch (error) {
    return { status: "error" as const, ...describeError(error) }
  }
}

function describeError(error: unknown): {
  message: string
  fieldErrors: ScanFormState["fieldErrors"]
} {
  if (error instanceof UnauthorizedError) {
    return { message: "Sign in to save receipts.", fieldErrors: {} }
  }

  if (error instanceof InvalidInputError) {
    return { message: error.message, fieldErrors: {} }
  }

  console.error("receipt action failed", error)
  return {
    message: "Something went wrong saving that. Try again.",
    fieldErrors: {},
  }
}
