import { FALLBACK_RECEIPT_TYPE, type ReceiptTypeId } from "@/lib/receipt-types"
import { classificationSchema, type Classification } from "@/lib/schemas"

export type { Classification }

// Keyword scoring stands in for real detection. When OCR lands, swap the body
// of classifyReceipt and leave the signature alone — the DAL and UI only read
// { type, confidence }.
const KEYWORDS: Record<Exclude<ReceiptTypeId, "other">, string[]> = {
  grocery: [
    "grocer",
    "market",
    "supermarket",
    "foods",
    "produce",
    "safeway",
    "loblaw",
    "sobeys",
    "superstore",
    "costco",
    "walmart",
    "aldi",
    "kroger",
  ],
  restaurant: [
    "restaurant",
    "cafe",
    "coffee",
    "bistro",
    "diner",
    "grill",
    "pizza",
    "sushi",
    "bar",
    "brewing",
    "tim hortons",
    "starbucks",
    "mcdonald",
    "doordash",
    "uber eats",
    "skip the dishes",
    "gratuity",
    "tip",
  ],
  fuel: [
    "fuel",
    "gas",
    "petro",
    "shell",
    "esso",
    "chevron",
    "husky",
    "diesel",
    "unleaded",
    "parking",
    "transit",
    "uber",
    "lyft",
    "taxi",
    "litre",
    "gallon",
  ],
  travel: [
    "hotel",
    "inn",
    "motel",
    "resort",
    "airline",
    "air canada",
    "westjet",
    "delta",
    "united",
    "booking",
    "airbnb",
    "expedia",
    "car rental",
    "hertz",
    "avis",
    "baggage",
    "boarding",
  ],
  office: [
    "office",
    "staples",
    "subscription",
    "software",
    "saas",
    "license",
    "adobe",
    "microsoft",
    "google workspace",
    "github",
    "notion",
    "figma",
    "slack",
    "zoom",
    "domain",
    "hosting",
    "monthly plan",
  ],
  hardware: [
    "hardware",
    "home depot",
    "lowe",
    "rona",
    "princess auto",
    "lumber",
    "tool",
    "fastener",
    "paint",
    "plumbing",
    "electrical",
    "building supply",
  ],
  medical: [
    "pharmacy",
    "pharmasave",
    "shoppers drug",
    "rexall",
    "clinic",
    "dental",
    "dentist",
    "optometr",
    "physio",
    "prescription",
    "medical",
    "hospital",
  ],
  utilities: [
    "hydro",
    "electric",
    "power",
    "water",
    "utility",
    "internet",
    "telecom",
    "rogers",
    "bell",
    "telus",
    "shaw",
    "fido",
    "comcast",
    "verizon",
    "natural gas",
    "kwh",
  ],
}

export function classifyReceipt(input: {
  merchant?: string | null
  rawText?: string | null
}): Classification {
  const merchant = (input.merchant ?? "").toLowerCase()
  const rawText = (input.rawText ?? "").toLowerCase()

  let best: ReceiptTypeId = FALLBACK_RECEIPT_TYPE
  let bestScore = 0

  for (const [type, keywords] of Object.entries(KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      // A merchant-name hit is a stronger signal than a hit in the body text.
      if (merchant.includes(keyword)) score += 3
      else if (rawText.includes(keyword)) score += 1
    }

    if (score > bestScore) {
      bestScore = score
      best = type as ReceiptTypeId
    }
  }

  if (bestScore === 0) {
    return { type: FALLBACK_RECEIPT_TYPE, confidence: 0 }
  }

  return {
    type: best,
    confidence: Math.min(0.95, 0.4 + bestScore * 0.12),
  }
}

// Callers go through this rather than classifyReceipt directly, so whatever
// produces the guess (keywords now, OCR/AI later) is checked against
// classificationSchema before it reaches the database or the UI. A bad guess
// falls back to "no detection" instead of failing the save.
export function classifyReceiptSafely(input: {
  merchant?: string | null
  rawText?: string | null
}): Classification {
  const parsed = classificationSchema.safeParse(classifyReceipt(input))
  if (parsed.success) return parsed.data

  console.error("receipt classifier returned an invalid result", parsed.error)
  return { type: FALLBACK_RECEIPT_TYPE, confidence: 0 }
}
