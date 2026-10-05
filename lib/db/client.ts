import { neon } from "@neondatabase/serverless"

import { getServerEnv } from "@/lib/env"

type Sql = ReturnType<typeof neon>

let client: Sql | undefined

export function getSql(): Sql {
  if (client) return client

  client = neon(getServerEnv().DATABASE_URL)
  return client
}
