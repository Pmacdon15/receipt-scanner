/**
 * Reads the fields off a receipt photo with Claude's vision model.
 *
 * The photo is already in the private blob store (the upload route put it
 * there), so this takes the pathname, reads the bytes itself, and sends them to
 * the Claude Messages API with a single tool the model must call. The tool's
 * input schema is the shape we want back, which keeps the answer structured
 * instead of prose to be parsed.
 *
 * Everything that comes back is treated as a suggestion: it is validated with
 * the same schemas as hand-typed input, and the scan form only uses it to
 * pre-fill fields the user can still change. With no ANTHROPIC_API_KEY set the
 * reader is simply off and returns `recognised: false`, which is what the form
 * already handles.
 *
 * Plain fetch rather than the Anthropic SDK: it is one request, and it keeps
 * the dependency list unchanged.
 */

import { get } from "@vercel/blob"

import { parseMoneyToCents } from "@/lib/money"
import { RECEIPT_TYPES, type ReceiptTypeId } from "@/lib/receipt-types"
import {
  type ExtractedFields,
  type ExtractionResult,
  extractionResultSchema,
  isoDateSchema,
  MERCHANT_MAX,
  RAW_TEXT_MAX,
  receiptImagePathnameSchema,
  receiptTypeIdSchema,
} from "@/lib/schemas"

export type { ExtractedFields, ExtractionResult }

export const NOT_RECOGNISED: ExtractionResult = {
  recognised: false,
  fields: {},
}

const API_URL = "https://api.anthropic.com/v1/messages"
const API_VERSION = "2023-06-01"
// Haiku is quick and cheap and reads printed receipts well. Point
// RECEIPT_VISION_MODEL at a larger model if crumpled or handwritten receipts
// come out wrong.
export const DEFAULT_VISION_MODEL = "claude-haiku-4-5-20251001"
const TOOL_NAME = "record_receipt"

const CATEGORY_IDS = RECEIPT_TYPES.map((t) => t.id)

const CATEGORY_GUIDE = RECEIPT_TYPES.map(
  (t) => `- ${t.id}: ${t.label} (${t.description})`
).join("\n")

const PROMPT = `Read this receipt photo and record it with the ${TOOL_NAME} tool.

Rules:
- Amounts are in the receipt's currency, as plain numbers (42.17), never strings.
- purchased_on is the purchase date as YYYY-MM-DD. Leave it out if you cannot read it.
- Leave out any field you cannot read rather than guessing.
- raw_text is a plain transcription of the receipt, top to bottom.
- category is the one category the receipt mostly belongs to.

Categories:
${CATEGORY_GUIDE}

Splits: if the line items clearly belong to two or more different categories
(groceries and hardware on one warehouse-store receipt, say), add a "splits"
list with one entry per category and how much of the total went to it. Share
tax and fees across the categories in proportion to their items, so the split
amounts add up exactly to the total. If everything belongs to one category,
leave "splits" out.`

const TOOL = {
  name: TOOL_NAME,
  description: "Record the fields read off a receipt photo.",
  input_schema: {
    type: "object",
    properties: {
      merchant: { type: "string", description: "Store or business name." },
      purchased_on: { type: "string", description: "YYYY-MM-DD" },
      subtotal: { type: "number" },
      tax: { type: "number", description: "All taxes combined." },
      total: { type: "number", description: "Amount paid." },
      raw_text: { type: "string" },
      category: { type: "string", enum: CATEGORY_IDS },
      category_confidence: {
        type: "number",
        description: "0 to 1: how sure you are of the category.",
      },
      splits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: CATEGORY_IDS },
            amount: { type: "number" },
          },
          required: ["category", "amount"],
        },
      },
    },
  },
} as const

export type ExtractDeps = {
  /** Defaults to ANTHROPIC_API_KEY. Null or empty turns the reader off. */
  apiKey?: string | null
  /** Defaults to RECEIPT_VISION_MODEL, then DEFAULT_VISION_MODEL. */
  model?: string
  /** Defaults to reading the private blob store. */
  readImage?: (pathname: string) => Promise<Uint8Array | null>
  fetch?: typeof fetch
}

async function readImageFromBlob(pathname: string): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private" })
  if (result?.statusCode !== 200) return null
  return new Uint8Array(await new Response(result.stream).arrayBuffer())
}

/**
 * Reads what it can off a captured receipt image.
 *
 * Callers must treat every field as optional and keep the manual inputs
 * authoritative — which is what the scan form does.
 */
export async function extractReceiptFields(
  imagePathname: string,
  deps: ExtractDeps = {}
): Promise<ExtractionResult> {
  const parsedPath = receiptImagePathnameSchema.safeParse(imagePathname)
  if (!parsedPath.success) return NOT_RECOGNISED

  const apiKey =
    deps.apiKey !== undefined ? deps.apiKey : process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NOT_RECOGNISED

  const image = await (deps.readImage ?? readImageFromBlob)(parsedPath.data)
  if (!image || image.byteLength === 0) return NOT_RECOGNISED

  const response = await (deps.fetch ?? fetch)(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model:
        deps.model ?? process.env.RECEIPT_VISION_MODEL ?? DEFAULT_VISION_MODEL,
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: Buffer.from(image).toString("base64"),
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Claude API returned ${response.status}: ${(await response.text()).slice(0, 500)}`
    )
  }

  const body = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[]
  }
  const toolUse = body.content?.find(
    (block) => block.type === "tool_use" && block.name === TOOL_NAME
  )
  if (!toolUse || typeof toolUse.input !== "object" || !toolUse.input) {
    return NOT_RECOGNISED
  }

  return toExtractionResult(toolUse.input as Record<string, unknown>)
}

/**
 * Turns the model's tool input into the form's pre-fill shape. Exported for
 * tests. Every field is checked on its own, so one bad value drops that field
 * rather than the whole reading.
 */
export function toExtractionResult(
  input: Record<string, unknown>
): ExtractionResult {
  const fields: ExtractedFields = {}

  if (typeof input.merchant === "string" && input.merchant.trim()) {
    fields.merchant = input.merchant.trim().slice(0, MERCHANT_MAX)
  }

  const date = isoDateSchema.safeParse(input.purchased_on)
  if (date.success) fields.purchasedOn = date.data

  const total = toCents(input.total)
  const subtotal = toCents(input.subtotal)
  const tax = toCents(input.tax)
  if (total !== null) fields.total = centsToText(total)
  if (subtotal !== null) fields.subtotal = centsToText(subtotal)
  if (tax !== null) fields.tax = centsToText(tax)

  if (typeof input.raw_text === "string" && input.raw_text.trim()) {
    fields.rawText = input.raw_text.trim().slice(0, RAW_TEXT_MAX)
  }

  const category = receiptTypeIdSchema.safeParse(input.category)
  if (category.success) {
    fields.receiptType = category.data
    const confidence = Number(input.category_confidence)
    fields.confidence = Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0.5
  }

  if (total !== null) {
    const splits = toSplits(input.splits, total)
    if (splits) {
      fields.splits = splits.map((s) => ({
        type: s.type,
        amount: centsToText(s.amountCents),
      }))
    }
  }

  const recognised = Object.keys(fields).length > 0
  return extractionResultSchema.parse({ recognised, fields })
}

function toCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const cents = parseMoneyToCents(String(value))
  return cents !== null && cents >= 0 ? cents : null
}

function centsToText(cents: number) {
  return (cents / 100).toFixed(2)
}

/**
 * The model's split, cleaned up: unknown categories dropped, repeats merged,
 * and the amounts made to add up to the total. A rounding gap of a few cents
 * goes onto the largest part; anything bigger means the model got it wrong,
 * so no split is suggested at all.
 */
function toSplits(
  value: unknown,
  totalCents: number
): { type: ReceiptTypeId; amountCents: number }[] | null {
  if (!Array.isArray(value)) return null

  const byType = new Map<ReceiptTypeId, number>()
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const type = receiptTypeIdSchema.safeParse(
      (entry as { category?: unknown }).category
    )
    const cents = toCents((entry as { amount?: unknown }).amount)
    if (!type.success || cents === null || cents === 0) continue
    byType.set(type.data, (byType.get(type.data) ?? 0) + cents)
  }

  const splits = [...byType].map(([type, amountCents]) => ({
    type,
    amountCents,
  }))
  if (splits.length < 2) return null

  splits.sort((a, b) => b.amountCents - a.amountCents)
  const gap = totalCents - splits.reduce((sum, s) => sum + s.amountCents, 0)
  if (Math.abs(gap) > splits.length * 2) return null
  splits[0].amountCents += gap
  if (splits[0].amountCents < 0) return null

  return splits
}

/** Never throws: a failed reading is just an empty pre-fill. */
export async function extractReceiptFieldsSafely(
  imagePathname: string,
  deps?: ExtractDeps
): Promise<ExtractionResult> {
  try {
    return await extractReceiptFields(imagePathname, deps)
  } catch (error) {
    console.error("reading the receipt photo failed", error)
    return NOT_RECOGNISED
  }
}
