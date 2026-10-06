import { z } from "zod"

// Server-only environment the app's own code reads. Clerk validates its own
// keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY) when it loads, so
// they are not repeated here.
//
// Validated lazily, on first use, rather than at import time so `next build`
// can still run without secrets present.
const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set. Add it to .env.local." })
    .trim()
    .min(1, "DATABASE_URL is not set. Add it to .env.local.")
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string."
    ),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  if (cached) return cached

  const parsed = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
  })
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(" "))
  }

  cached = parsed.data
  return cached
}
