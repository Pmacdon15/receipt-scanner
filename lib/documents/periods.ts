// Quick date ranges for the documents page. Built from a YYYY-MM-DD "today"
// so they are pure (and testable); the page passes the server's UTC date.

export type PeriodPreset = {
  id: string
  label: string
  from?: string
  to?: string
}

function iso(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day))
  return date.toISOString().slice(0, 10)
}

/** Last day of the month (month is 0-based; overflow rolls the year). */
function monthEnd(year: number, month: number) {
  return iso(year, month + 1, 0)
}

export function periodPresets(today: string): PeriodPreset[] {
  const [y, m] = today.split("-").map(Number)
  const year = y
  const month = m - 1
  const quarter = Math.floor(month / 3)

  return [
    {
      id: "this-month",
      label: "This month",
      from: iso(year, month, 1),
      to: monthEnd(year, month),
    },
    {
      id: "last-month",
      label: "Last month",
      from: iso(year, month - 1, 1),
      to: monthEnd(year, month - 1),
    },
    {
      id: "this-quarter",
      label: "This quarter",
      from: iso(year, quarter * 3, 1),
      to: monthEnd(year, quarter * 3 + 2),
    },
    {
      id: "last-quarter",
      label: "Last quarter",
      from: iso(year, quarter * 3 - 3, 1),
      to: monthEnd(year, quarter * 3 - 1),
    },
    {
      id: "this-year",
      label: "This year",
      from: iso(year, 0, 1),
      to: iso(year, 11, 31),
    },
    {
      id: "last-year",
      label: "Last year",
      from: iso(year - 1, 0, 1),
      to: iso(year - 1, 11, 31),
    },
    { id: "all", label: "All dates" },
  ]
}

/** The preset these dates are, if any, so its chip can show as selected. */
export function matchingPreset(
  presets: readonly PeriodPreset[],
  from?: string,
  to?: string
): PeriodPreset | undefined {
  return presets.find((p) => p.from === from && p.to === to)
}
