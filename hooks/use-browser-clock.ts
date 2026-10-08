"use client"

import { useSyncExternalStore } from "react"

import { localDateString } from "@/lib/dates"

// The viewer's date and timezone only exist in the browser (issue #22). Both
// hooks return null on the server and during hydration, so the server never
// reads its own clock as "today" (which also keeps it out of the Cache
// Components shell, #17) and hydration never mismatches. The browser's value
// arrives in the render right after.

function subscribeToDay(onChange: () => void) {
  // A tab left open past midnight, or a laptop woken the next morning, picks
  // up the new day as soon as the page is looked at again.
  window.addEventListener("focus", onChange)
  document.addEventListener("visibilitychange", onChange)
  return () => {
    window.removeEventListener("focus", onChange)
    document.removeEventListener("visibilitychange", onChange)
  }
}

const noSubscribe = () => () => {}
const onServer = () => null
const readToday = () => localDateString()
const readTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Today as YYYY-MM-DD in the viewer's timezone; null until hydrated. */
export function useLocalToday(): string | null {
  return useSyncExternalStore(subscribeToDay, readToday, onServer)
}

/** The viewer's IANA timezone (e.g. "America/Edmonton"); null until hydrated. */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noSubscribe, readTimeZone, onServer)
}
