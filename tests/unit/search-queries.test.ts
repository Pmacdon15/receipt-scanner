import { afterEach, describe, expect, spyOn, test } from "bun:test"

import type { ReceiptSearchResults } from "@/lib/dal/receipts"
import {
  asCachedSearch,
  fetchReceiptSearch,
  receiptSearchKeys,
  receiptSearchQueryOptions,
  SearchRequestError,
} from "@/lib/search-queries"

const alice = { userId: "user_a", orgId: null }
const aliceAtAcme = { userId: "user_a", orgId: "org_1" }
const bob = { userId: "user_b", orgId: null }

const results: ReceiptSearchResults = {
  scope: "mine",
  org: null,
  receipts: [],
  matchCount: 0,
  matchTotalCents: 0,
  typeFacets: [],
  page: 1,
  pageCount: 1,
  pageSize: 25,
}

const restores: (() => void)[] = []

afterEach(() => {
  while (restores.length > 0) restores.pop()?.()
})

function stubFetch(respond: () => Response) {
  const spy = spyOn(globalThis, "fetch").mockImplementation(
    (async () => respond()) as unknown as typeof fetch
  )
  restores.push(() => spy.mockRestore())
  return spy
}

function respondWith(body: unknown, status = 200) {
  return stubFetch(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  )
}

describe("receiptSearchKeys", () => {
  test("separate users and organizations never share an entry", () => {
    const params = { scope: "mine" as const, query: "tea" }
    const keys = [alice, aliceAtAcme, bob].map((viewer) =>
      JSON.stringify(receiptSearchKeys.search(viewer, params))
    )
    expect(new Set(keys).size).toBe(3)
  })

  test("equivalent searches share an entry", () => {
    expect(
      receiptSearchKeys.search(alice, {
        scope: "mine",
        query: " tea ",
        receiptTypes: ["travel", "fuel"],
        page: 1,
      })
    ).toEqual(
      receiptSearchKeys.search(alice, {
        scope: "mine",
        query: "tea",
        receiptTypes: ["fuel", "travel"],
      })
    )
  })

  test("every search key sits under the viewer's prefix", () => {
    const key = receiptSearchKeys.search(alice, { scope: "mine" })
    expect(key.slice(0, 4)).toEqual([...receiptSearchKeys.all(alice)])
  })
})

describe("fetchReceiptSearch", () => {
  test("requests the search API for the params and returns the body", async () => {
    const spy = respondWith({ ...results, suggestions: [] })

    const data = await fetchReceiptSearch({ scope: "mine", query: "tea" })

    expect(data.suggestions).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toBe("/api/receipts/search?q=tea")
  })

  test("throws the server's message with the status", async () => {
    respondWith({ error: "Sign in to search receipts." }, 401)

    const error = (await fetchReceiptSearch({ scope: "mine" }).catch(
      (e: unknown) => e
    )) as SearchRequestError

    expect(error).toBeInstanceOf(SearchRequestError)
    expect(error.status).toBe(401)
    expect(error.message).toBe("Sign in to search receipts.")
  })

  test("falls back to a generic message when the body is not JSON", async () => {
    stubFetch(() => new Response("<html>", { status: 502 }))

    const error = (await fetchReceiptSearch({ scope: "mine" }).catch(
      (e: unknown) => e
    )) as SearchRequestError

    expect(error.status).toBe(502)
    expect(error.message).toBe("Search failed. Try again.")
  })
})

describe("receiptSearchQueryOptions", () => {
  const retry = receiptSearchQueryOptions(alice, { scope: "mine" })
    .retry as (count: number, error: Error) => boolean

  test("does not retry a 401", () => {
    expect(retry(0, new SearchRequestError("no", 401))).toBe(false)
  })

  test("retries other failures twice", () => {
    expect(retry(0, new SearchRequestError("down", 500))).toBe(true)
    expect(retry(1, new Error("network"))).toBe(true)
    expect(retry(2, new Error("network"))).toBe(false)
  })
})

describe("asCachedSearch", () => {
  test("adds an empty suggestion list to server results", () => {
    expect(asCachedSearch(results)).toEqual({ ...results, suggestions: [] })
  })
})
