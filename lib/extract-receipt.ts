/**
 * Seam for reading fields off a receipt photo.
 *
 * There is no OCR in the project yet, so this deliberately extracts nothing and
 * says so through `recognised: false`. It exists to fix the shape now: when OCR
 * lands, swap the body of extractReceiptFields and leave the signature alone —
 * the scan UI only reads { recognised, fields }, so no component changes.
 *
 * The same arrangement as classifyReceipt in lib/classify-receipt.ts, which
 * stands in for real detection behind a stable return type.
 */

import {
  extractionResultSchema,
  receiptImagePathnameSchema,
  type ExtractedFields,
  type ExtractionResult,
} from "@/lib/schemas"

export type { ExtractedFields, ExtractionResult }

export const NOT_RECOGNISED: ExtractionResult = {
  recognised: false,
  fields: {},
}

/**
 * Reads what it can off a captured receipt image.
 *
 * Returns nothing recognised today. Callers must treat every field as optional
 * and keep the manual inputs authoritative — which is what the scan form does,
 * so a real OCR implementation only improves the pre-fill rather than changing
 * the flow.
 */
export async function extractReceiptFields(
  // The parameter is the point: it fixes the signature a real OCR pass reads
  // from. It is the photo's blob pathname, which such a pass would read out of
  // the private store itself rather than being handed the bytes.
  imagePathname: string
): Promise<ExtractionResult> {
  const parsedPath = receiptImagePathnameSchema.safeParse(imagePathname)
  if (!parsedPath.success) {
    return NOT_RECOGNISED
  }
  return extractionResultSchema.parse(NOT_RECOGNISED)
}

export function extractReceiptFieldsSafely(
  imagePathname: string
): Promise<ExtractionResult> {
  return extractReceiptFields(imagePathname)
}
