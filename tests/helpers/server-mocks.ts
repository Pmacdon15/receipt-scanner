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
  // Clerk Billing: the Feature slugs the signed-in user's plan holds, and how
  // many members each organization has (1 when not set).
  features: new Set<string>(),
  orgMembers: new Map<string, number>(),
  clerkDown: false,
  // Tags expired by updateTag (Server Actions) and revalidateTag (routes),
  // and the tags each cached read registered, in call order.
  updatedTags: [] as string[],
  revalidatedTags: [] as { tag: string; profile: unknown }[],
  cacheTags: [] as string[],
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
  fake.features.clear()
  fake.orgMembers.clear()
  fake.clerkDown = false
  fake.updatedTags.length = 0
  fake.revalidatedTags.length = 0
  fake.cacheTags.length = 0
}

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: fake.userId,
    orgId: fake.orgId,
    has: ({ feature, plan }: { feature?: string; plan?: string }) =>
      feature !== undefined ? fake.features.has(feature) : plan === undefined,
  }),
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
        if (fake.clerkDown) throw new Error("clerk unavailable")
        const members = fake.orgMembers.get(organizationId)
        const name = fake.orgs.get(organizationId)
        // An org set up only for its size resolves under a stand-in name.
        if (!name && members === undefined) {
          throw new Error("organization not found")
        }
        return {
          id: organizationId,
          name: name ?? organizationId,
          membersCount: members ?? 1,
        }
      },
    },
  }),
}))

// "use cache" is a plain string to Bun, so cached reads just run every time;
// these record the tags so tests can check reads and writes agree on them.
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: (...tags: string[]) => {
    fake.cacheTags.push(...tags)
  },
  updateTag: (tag: string) => {
    fake.updatedTags.push(tag)
  },
  revalidateTag: (tag: string, profile: unknown) => {
    fake.revalidatedTags.push({ tag, profile })
  },
}))

mock.module("@/lib/db/client", () => ({
  getSql: () => {
    if (!fake.db) throw new Error("test database not set up")
    return fake.db.sql
  },
}))
