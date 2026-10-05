import { readFileSync } from "node:fs"
import { PGlite, types } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"

import type { getSql } from "@/lib/db/client"

// An in-process Postgres (PGlite) loaded with the real db/schema.sql, so the
// queries in lib/db run against actual Postgres semantics without a server.

const SCHEMA = readFileSync(
  new URL("../../db/schema.sql", import.meta.url),
  "utf8"
)

type Sql = ReturnType<typeof getSql>

export type TestDb = {
  db: PGlite
  // Shaped like the Neon client the app uses: a tagged template plus
  // sql.query(text, params). Only the parts lib/db calls are implemented.
  sql: Sql
  reset(): Promise<void>
  close(): Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create({
    extensions: { pgcrypto },
    // Neon hands dates and timestamps back as strings in the shapes the
    // ReceiptRow type declares; mirror that rather than PGlite's Date objects.
    parsers: {
      [types.DATE]: (value: string) => value,
      [types.TIMESTAMPTZ]: (value: string) => value,
    },
  })
  await db.exec(SCHEMA)

  async function query(text: string, params: unknown[] = []) {
    const result = await db.query(text, params)
    return result.rows
  }

  function tagged(strings: TemplateStringsArray, ...values: unknown[]) {
    const text = strings.reduce((acc, part, i) => `${acc}$${i}${part}`)
    return query(text, values)
  }

  const sql = Object.assign(tagged, { query }) as unknown as Sql

  return {
    db,
    sql,
    async reset() {
      await db.exec("truncate receipts")
    },
    close: () => db.close(),
  }
}
