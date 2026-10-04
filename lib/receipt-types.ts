export const RECEIPT_TYPES = [
  {
    id: "grocery",
    label: "Grocery",
    description: "Supermarkets, produce, household food shops",
  },
  {
    id: "restaurant",
    label: "Restaurant & Cafe",
    description: "Dine-in, takeout, coffee, bars",
  },
  {
    id: "fuel",
    label: "Fuel & Transport",
    description: "Gas stations, transit, parking, rideshare",
  },
  {
    id: "travel",
    label: "Travel & Lodging",
    description: "Flights, hotels, car rental",
  },
  {
    id: "office",
    label: "Office & Software",
    description: "Supplies, subscriptions, SaaS tools",
  },
  {
    id: "hardware",
    label: "Hardware & Supplies",
    description: "Tools, building materials, trade supply",
  },
  {
    id: "medical",
    label: "Medical & Pharmacy",
    description: "Clinics, prescriptions, dental",
  },
  {
    id: "utilities",
    label: "Utilities & Telecom",
    description: "Power, water, internet, mobile",
  },
  {
    id: "other",
    label: "Other",
    description: "Anything that does not fit a category above",
  },
] as const

export type ReceiptTypeId = (typeof RECEIPT_TYPES)[number]["id"]

export const RECEIPT_TYPE_IDS = RECEIPT_TYPES.map(
  (t) => t.id
) as readonly ReceiptTypeId[]

const BY_ID = new Map(RECEIPT_TYPES.map((t) => [t.id, t]))

export function getReceiptType(id: string) {
  return BY_ID.get(id as ReceiptTypeId)
}

export function isReceiptTypeId(value: unknown): value is ReceiptTypeId {
  return typeof value === "string" && BY_ID.has(value as ReceiptTypeId)
}

export function receiptTypeLabel(id: string) {
  return BY_ID.get(id as ReceiptTypeId)?.label ?? "Unknown"
}

export const FALLBACK_RECEIPT_TYPE: ReceiptTypeId = "other"
