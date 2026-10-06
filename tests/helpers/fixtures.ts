import type { Receipt, SearchedReceipt } from "@/lib/dal/receipts"

export function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: crypto.randomUUID(),
    userId: "user_a",
    orgId: null,
    merchant: "Safeway",
    purchasedOn: "2025-03-01",
    currency: "CAD",
    subtotalCents: null,
    taxCents: null,
    totalCents: 4250,
    receiptType: "grocery",
    typeSource: "auto",
    detectedType: "grocery",
    detectedConfidence: 0.76,
    splits: null,
    notes: null,
    hasImage: false,
    createdAt: "2025-03-01T12:00:00Z",
    ...overrides,
  }
}

export function makeSearchedReceipt(
  overrides: Partial<SearchedReceipt> = {}
): SearchedReceipt {
  return {
    ...makeReceipt(overrides),
    isMine: true,
    uploadedBy: "You",
    ...overrides,
  }
}
