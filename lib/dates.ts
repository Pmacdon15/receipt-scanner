// Turning an instant into a calendar day needs a timezone, and the server
// doesn't know the viewer's (issue #22). A timestamp made on the server is a
// correct instant wherever it is shown; what goes wrong is reading the
// server's clock as "today" or slicing a UTC ISO string into a date. These
// helpers keep that conversion explicit.

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The YYYY-MM-DD date in this runtime's local timezone. Only meaningful in the
 * browser: on the server "local" is wherever the server runs (usually UTC).
 */
export function localDateString(date: Date = new Date()): string {
  const month = pad(date.getMonth() + 1)
  return `${date.getFullYear()}-${month}-${pad(date.getDate())}`
}

/** An IANA timezone from untrusted input (a query string), or "UTC". */
export function resolveTimeZone(value: string | null | undefined): string {
  if (!value || value.length > 64) return "UTC"
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone: value })
    return format.resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00"
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  }
}

/** The YYYY-MM-DD date of `date` as seen in `timeZone`. */
export function dateInZone(date: Date, timeZone: string): string {
  return partsInZone(date, timeZone).date
}

/** "YYYY-MM-DD HH:mm" of `date` as seen in `timeZone`. */
export function dateTimeInZone(date: Date, timeZone: string): string {
  const { date: day, time } = partsInZone(date, timeZone)
  return `${day} ${time}`
}
