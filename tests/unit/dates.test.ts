import { describe, expect, test } from "bun:test"

import {
  dateInZone,
  dateTimeInZone,
  localDateString,
  resolveTimeZone,
} from "@/lib/dates"
import { periodPresets } from "@/lib/documents/periods"

// Issue #22: 6:30 pm on Sep 30 in Calgary is already Oct 1 in UTC.
const CALGARY_EVENING = new Date("2026-10-01T00:30:00Z")

describe("dates", () => {
  test("localDateString reads the runtime's local calendar, zero-padded", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(localDateString(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31")
  })

  test("resolveTimeZone keeps real IANA zones and falls back to UTC", () => {
    expect(resolveTimeZone("America/Edmonton")).toBe("America/Edmonton")
    expect(resolveTimeZone(null)).toBe("UTC")
    expect(resolveTimeZone("")).toBe("UTC")
    expect(resolveTimeZone("Not/AZone")).toBe("UTC")
    expect(resolveTimeZone("x".repeat(80))).toBe("UTC")
  })

  test("dateInZone gives the viewer's day, not the UTC one", () => {
    expect(dateInZone(CALGARY_EVENING, "UTC")).toBe("2026-10-01")
    expect(dateInZone(CALGARY_EVENING, "America/Edmonton")).toBe("2026-09-30")
    // East of UTC, the early morning is the case that shifts.
    expect(dateInZone(new Date("2026-09-30T22:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-10-01"
    )
  })

  test("dateTimeInZone uses a 24-hour clock", () => {
    expect(dateTimeInZone(CALGARY_EVENING, "America/Edmonton")).toBe(
      "2026-09-30 18:30"
    )
    expect(dateTimeInZone(new Date("2026-01-01T00:05:00Z"), "UTC")).toBe(
      "2026-01-01 00:05"
    )
  })

  test("presets built from the viewer's day pick the right month", () => {
    const thisMonth = periodPresets(
      dateInZone(CALGARY_EVENING, "America/Edmonton")
    ).find((p) => p.id === "this-month")
    expect(thisMonth).toMatchObject({ from: "2026-09-01", to: "2026-09-30" })
  })
})
