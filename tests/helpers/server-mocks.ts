import { mock } from "bun:test"

import type { TestDb } from "./test-db"

// Stand-ins for the services the server code talks to: Clerk for identity,
// Next's cache for revalidation, and Neon for storage. bunfig.toml preloads
// this module so the mocks are in place before any app module loads; tests
// import it only to drive the fakes.

export type FakeUser = {
  id: string
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  email?: string | null
}

export const fake = {
  userId: null as string | null,
  orgId: null as string | null,
  users: new Map<string, FakeUser>(),
  orgs: new Map<string, string>(),
  clerkDown: false,
  revalidated: [] as string[],
  updatedTags: [] as string[],
  db: null as TestDb | null,
}

export function signIn(userId: string | null, orgId: string | null = null) {
  fake.userId = userId
  fake.orgId = orgId
}

export function resetFakes() {
  signIn(null)
  fake.users.clear()
  fake.orgs.clear()
  fake.clerkDown = false
  fake.revalidated.length = 0
  fake.updatedTags.length = 0
}

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: fake.userId, orgId: fake.orgId }),
  clerkClient: async () => ({
    users: {
      getUserList: async ({ userId }: { userId: string[] }) => {
        if (fake.clerkDown) throw new Error("clerk unavailable")
        return {
          data: userId
            .map((id) => fake.users.get(id))
            .filter((u): u is FakeUser => Boolean(u))
            .map((u) => ({
              id: u.id,
              firstName: u.firstName ?? null,
              lastName: u.lastName ?? null,
              username: u.username ?? null,
              primaryEmailAddress: u.email ? { emailAddress: u.email } : null,
            })),
        }
      },
    },
    organizations: {
      getOrganization: async ({
        organizationId,
      }: {
        organizationId: string
      }) => {
        const name = fake.orgs.get(organizationId)
        if (fake.clerkDown || !name) throw new Error("organization not found")
        return { id: organizationId, name }
      },
    },
  }),
}))

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    fake.revalidated.push(path)
  },
  updateTag: (tag: string) => {
    fake.updatedTags.push(tag)
  },
}))

mock.module("@/lib/db/client", () => ({
  getSql: () => {
    if (!fake.db) throw new Error("test database not set up")
    return fake.db.sql
  },
}))
