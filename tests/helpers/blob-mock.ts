import { mock } from "bun:test"

// A stand-in for the private Vercel Blob store, for tests that delete receipts.
// Import it before any app module so the DAL picks up the fake `del`.

export const blob = {
  deleted: [] as string[],
  failDeletes: false,
}

export function resetBlob() {
  blob.deleted.length = 0
  blob.failDeletes = false
}

mock.module("@vercel/blob", () => ({
  put: async (pathname: string) => ({ pathname }),
  get: async () => null,
  del: async (pathname: string | string[]) => {
    if (blob.failDeletes) throw new Error("blob store unavailable")
    blob.deleted.push(...(Array.isArray(pathname) ? pathname : [pathname]))
  },
}))
