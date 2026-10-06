import { afterEach, describe, expect, test } from "bun:test"

const original = process.env.DATABASE_URL

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original
})

// A fresh copy of the module each time, since it caches the client.
async function loadClient() {
  return import(`@/lib/db/client?v=${Math.random()}`)
}

describe("getSql", () => {
  test("explains how to fix a missing DATABASE_URL", async () => {
    delete process.env.DATABASE_URL
    const { getSql } = await loadClient()
    expect(() => getSql()).toThrow("DATABASE_URL is not set")
  })

  test("creates the client once and reuses it", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@example.neon.tech/db"
    const { getSql } = await loadClient()
    const first = getSql()
    expect(typeof first).toBe("function")
    expect(getSql()).toBe(first)
  })
})
