import { neon } from "@neondatabase/serverless"

type Sql = ReturnType<typeof neon>

let client: Sql | undefined

export function getSql(): Sql {
  if (client) return client

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local.")
  }

  client = neon(connectionString)
  return client
}
