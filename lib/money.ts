export function parseMoneyToCents(
  value: FormDataEntryValue | null
): number | null {
  if (typeof value !== "string") return null

  const cleaned = value.replace(/[^0-9.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-") return null

  const amount = Number(cleaned)
  if (!Number.isFinite(amount)) return null

  return Math.round(amount * 100)
}

export function formatMoney(cents: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(cents / 100)
}

export function formatDate(value: string | null) {
  if (!value) return "No date"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "No date"

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}
