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

export type ExtractedFields = {
  merchant?: string
  /** ISO yyyy-mm-dd, matching the date input the scan form posts. */
  purchasedOn?: string
  /** Decimal strings, not cents: these land in text inputs the user confirms. */
  total?: string
  subtotal?: string
  tax?: string
  /** Full recognised text, which sharpens the existing keyword classifier. */
  rawText?: string
}

export type ExtractionResult = {
  /** False while OCR is stubbed, so the UI can say the fields need entering. */
  recognised: boolean
  fields: ExtractedFields
}

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
  // The parameter is the point: it fixes the signature a real OCR pass reads from.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imageDataUrl: string
): Promise<ExtractionResult> {
  return NOT_RECOGNISED
}
