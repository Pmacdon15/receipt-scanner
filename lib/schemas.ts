import { z } from "zod"

import { parseMoneyToCents } from "@/lib/money"
import { RECEIPT_TYPES, type ReceiptTypeId } from "@/lib/receipt-types"

// Shared Zod schemas. Everything here is safe to import from client
// components as well as server code: the scan form and the search filters
// validate with these before submitting, and the server actions, DAL and
// search page validate with the same schemas when the data arrives.

// Postgres `integer` columns (total_cents, subtotal_cents, tax_cents) top out
// here; anything larger would fail inside the database.
export const MAX_CENTS = 2_147_483_647
export const MERCHANT_MAX = 200
export const NOTES_MAX = 2_000
export const RAW_TEXT_MAX = 20_000
export const SEARCH_QUERY_MAX = 200

// ---------------------------------------------------------------------------
// Building blocks

const RECEIPT_TYPE_ID_VALUES = RECEIPT_TYPES.map((t) => t.id) as [
  ReceiptTypeId,
  ...ReceiptTypeId[],
]

function receiptTypeId(error: string) {
  return z.enum(RECEIPT_TYPE_ID_VALUES, { error })
}

export const receiptTypeIdSchema = receiptTypeId("Unknown receipt type.")

// Receipt ids are Postgres uuids (gen_random_uuid). Rejecting anything else
// up front keeps malformed ids from reaching the database as a cast error.
export const receiptIdSchema = z.uuid({ error: "Receipt not found." })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// A calendar date as YYYY-MM-DD. The round trip catches dates like
// 2024-02-31 that JavaScript would quietly roll over but Postgres rejects.
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, "Use a YYYY-MM-DD date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, "Enter a real date.")

export const centsSchema = z
  .number({ error: "Enter an amount like 12.50." })
  .int()
  .min(0, "Amounts cannot be negative.")
  .max(MAX_CENTS, "That amount is too large.")

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code.")

export const receiptSortSchema = z.enum([
  "newest",
  "oldest",
  "highest",
  "lowest",
])
export type ReceiptSort = z.infer<typeof receiptSortSchema>

export const searchScopeSchema = z.enum(["mine", "org"])
export type SearchScope = z.infer<typeof searchScopeSchema>

// FormData values can be a File or null; only strings count as text input.
function formText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function formTextOrNull(value: unknown): string | null {
  const text = formText(value)
  return text === "" ? null : text
}

function formTextOrUndefined(value: unknown): string | undefined {
  const text = formText(value)
  return text === "" ? undefined : text
}

function formCents(value: unknown): number | null {
  return parseMoneyToCents(typeof value === "string" ? value : null)
}

// Like formCents, but text that is not an amount is passed through so the
// number schema reports it instead of it being silently dropped.
function formCentsOrUndefined(value: unknown): number | string | undefined {
  const text = formText(value)
  if (text === "") return undefined
  return parseMoneyToCents(text) ?? text
}

const MERCHANT_REQUIRED = "Enter where the receipt is from."
const MERCHANT_TOO_LONG = "Keep the merchant name under 200 characters."
const RAW_TEXT_TOO_LONG = "Keep the receipt text under 20,000 characters."
const NOTES_TOO_LONG = "Keep notes under 2,000 characters."

// ---------------------------------------------------------------------------
// Scan form (components/scanner/scan-form.tsx → scanReceiptAction)

export const scanReceiptFormSchema = z.object({
  merchant: z.preprocess(
    formText,
    z
      .string()
      .min(1, MERCHANT_REQUIRED)
      .max(MERCHANT_MAX, MERCHANT_TOO_LONG)
  ),
  purchasedOn: z.preprocess(formTextOrNull, isoDateSchema.nullable()),
  total: z.preprocess(
    formCents,
    z
      .number({ error: "Enter the receipt total." })
      .int()
      .min(0, "The total cannot be negative.")
      .max(MAX_CENTS, "That total is too large.")
  ),
  subtotal: z.preprocess(formCents, centsSchema.nullable()),
  tax: z.preprocess(formCents, centsSchema.nullable()),
  // An empty value means "use whatever detection picked".
  receiptType: z.preprocess(
    (value) => (typeof value === "string" && value !== "" ? value : undefined),
    receiptTypeId("Pick a type from the list.").optional()
  ),
  rawText: z.preprocess(
    formTextOrNull,
    z
      .string()
      .max(RAW_TEXT_MAX, RAW_TEXT_TOO_LONG)
      .nullable()
  ),
  imagePathname: z.preprocess(
    formTextOrNull,
    z.string().max(500).nullable().optional()
  ),
  notes: z.preprocess(
    formTextOrNull,
    z.string().max(NOTES_MAX, NOTES_TOO_LONG).nullable()
  ),
})

export type ScanReceiptForm = z.infer<typeof scanReceiptFormSchema>
export type ScanReceiptField = keyof ScanReceiptForm | "image"

// ---------------------------------------------------------------------------
// Receipt writes (lib/dal/receipts.ts)

export const newReceiptSchema = z.object({
  merchant: z
    .string()
    .trim()
    .min(1, MERCHANT_REQUIRED)
    .max(MERCHANT_MAX, MERCHANT_TOO_LONG),
  purchasedOn: isoDateSchema.nullable(),
  currency: currencySchema,
  subtotalCents: centsSchema.nullable(),
  taxCents: centsSchema.nullable(),
  totalCents: centsSchema,
  receiptType: receiptTypeIdSchema.optional(),
  rawText: z.string().max(RAW_TEXT_MAX, RAW_TEXT_TOO_LONG).nullable(),
  imageUrl: z.string().max(500).nullish(),
  notes: z.string().max(NOTES_MAX, NOTES_TOO_LONG).nullable(),
})

export type NewReceipt = z.infer<typeof newReceiptSchema>

export const setReceiptTypeInputSchema = z.object({
  id: receiptIdSchema,
  receiptType: receiptTypeIdSchema,
})

export const suggestReceiptTypeInputSchema = z.object({
  merchant: z.string().max(MERCHANT_MAX, MERCHANT_TOO_LONG).nullish(),
  rawText: z.string().max(RAW_TEXT_MAX, RAW_TEXT_TOO_LONG).nullish(),
})

export type SuggestReceiptTypeInput = z.infer<
  typeof suggestReceiptTypeInputSchema
>

// ---------------------------------------------------------------------------
// Image storage & upload schemas

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const IMAGE_CONTENT_TYPE = "image/jpeg"

export const receiptImagePathnameRegex =
  /^receipts\/[A-Za-z0-9_-]{1,128}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

export const receiptImagePathnameSchema = z
  .string()
  .regex(receiptImagePathnameRegex, "Invalid receipt photo pathname.")

export const imageUploadFileSchema = z
  .custom<Blob>((val) => typeof Blob !== "undefined" && val instanceof Blob, {
    message: "No photo was attached.",
  })
  .superRefine((file, ctx) => {
    if (file.type !== IMAGE_CONTENT_TYPE) {
      ctx.addIssue({
        code: "custom",
        message: "Only JPEG photos can be uploaded.",
        params: { status: 415 },
      })
    } else if (file.size === 0) {
      ctx.addIssue({
        code: "custom",
        message: "That photo was empty.",
        params: { status: 400 },
      })
    } else if (file.size > MAX_IMAGE_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "That photo is too large.",
        params: { status: 413 },
      })
    }
  })

export const clientImageFileSchema = z
  .custom<File>((val) => typeof File !== "undefined" && val instanceof File, {
    message: "Pick an image file — a photo, screenshot, or scan.",
  })
  .refine((file) => file.type.startsWith("image/"), {
    message: "Pick an image file — a photo, screenshot, or scan.",
  })

export const imageUploadResponseSchema = z.object({
  pathname: receiptImagePathnameSchema,
})

export type ImageUploadResponse = z.infer<typeof imageUploadResponseSchema>

export const apiErrorResponseSchema = z.object({
  error: z.string(),
})

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>

// ---------------------------------------------------------------------------
// Extraction seam (lib/extract-receipt.ts)

export const extractedFieldsSchema = z.object({
  merchant: z.string().max(MERCHANT_MAX, MERCHANT_TOO_LONG).optional(),
  purchasedOn: isoDateSchema.optional(),
  total: z.string().optional(),
  subtotal: z.string().optional(),
  tax: z.string().optional(),
  rawText: z.string().max(RAW_TEXT_MAX, RAW_TEXT_TOO_LONG).optional(),
})

export type ExtractedFields = z.infer<typeof extractedFieldsSchema>

export const extractionResultSchema = z.object({
  recognised: z.boolean(),
  fields: extractedFieldsSchema,
})

export type ExtractionResult = z.infer<typeof extractionResultSchema>

// What a classifier (keyword scoring today, OCR/AI later) must hand back.
// Confidence matches the receipts_confidence_check constraint in the schema.
export const classificationSchema = z.object({
  type: receiptTypeIdSchema,
  confidence: z.number().min(0).max(1),
})

export type Classification = z.infer<typeof classificationSchema>

// ---------------------------------------------------------------------------
// Search (URL params on /search, and the filter form that produces them)

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function firstText(value: unknown): string {
  return formText(firstValue(value))
}

function allTexts(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value]
  return list.filter((v): v is string => typeof v === "string")
}

// Parses the /search query string. Deliberately lenient: anything invalid is
// dropped (`.catch`) rather than erroring, so a hand-edited or stale URL
// still shows a search instead of a crash.
export const searchParamsSchema = z.object({
  scope: z.preprocess(firstText, searchScopeSchema.catch("mine")),
  q: z.preprocess(
    (value) => firstText(value).slice(0, SEARCH_QUERY_MAX) || undefined,
    z.string().optional()
  ),
  type: z.preprocess(
    (value) => allTexts(value).flatMap((t) => t.split(",")),
    z.array(z.string()).transform((list) => [
      ...new Set(
        list.flatMap((t) => {
          const parsed = receiptTypeIdSchema.safeParse(t)
          return parsed.success ? [parsed.data] : []
        })
      ),
    ])
  ),
  from: z.preprocess(firstText, isoDateSchema.optional().catch(undefined)),
  to: z.preprocess(firstText, isoDateSchema.optional().catch(undefined)),
  min: z.preprocess(
    (value) => parseMoneyToCents(firstText(value)) ?? undefined,
    centsSchema.optional().catch(undefined)
  ),
  max: z.preprocess(
    (value) => parseMoneyToCents(firstText(value)) ?? undefined,
    centsSchema.optional().catch(undefined)
  ),
  sort: z.preprocess(firstText, receiptSortSchema.optional().catch(undefined)),
  page: z.preprocess(
    (value) => Number(firstText(value)),
    z.number().gt(1).optional().catch(undefined)
  ),
})

// The filter form on /search. Stricter than the URL parser: the form can tell
// the user what is wrong before it navigates.
export const searchFiltersFormSchema = z
  .object({
    q: z.preprocess(
      formText,
      z
        .string()
        .max(SEARCH_QUERY_MAX, "Keep the search under 200 characters.")
    ),
    from: z.preprocess(formTextOrUndefined, isoDateSchema.optional()),
    to: z.preprocess(formTextOrUndefined, isoDateSchema.optional()),
    min: z.preprocess(formCentsOrUndefined, centsSchema.optional()),
    max: z.preprocess(formCentsOrUndefined, centsSchema.optional()),
    sort: z.preprocess(formTextOrUndefined, receiptSortSchema.optional()),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date is before the start date.",
      })
    }
    if (
      value.min !== undefined &&
      value.max !== undefined &&
      value.min > value.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "The max total is below the min total.",
      })
    }
  })

export type SearchFiltersForm = z.infer<typeof searchFiltersFormSchema>
export type SearchFiltersField = keyof SearchFiltersForm

// ---------------------------------------------------------------------------
// Error helpers

type IssueList = {
  issues: readonly { path: readonly PropertyKey[]; message: string }[]
}

// The first message for each top-level field, in the shape the forms render.
export function fieldErrorsFrom<Field extends string>(
  error: IssueList
): Partial<Record<Field, string>> {
  const errors: Partial<Record<string, string>> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === "string" && errors[key] === undefined) {
      errors[key] = issue.message
    }
  }
  return errors as Partial<Record<Field, string>>
}

export function firstErrorMessage(error: IssueList, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}
