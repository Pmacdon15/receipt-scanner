/**
 * The contract for receipt photo blobs: how their pathnames are built, and how
 * a pathname that arrives from the browser is checked before it is stored.
 *
 * Photos live in a private Vercel Blob store under one folder per user:
 *
 *     receipts/<userId>/<uuid>.jpg
 *
 * The namespacing is load-bearing, not cosmetic. The upload route hands the
 * pathname it generated back to the browser, and the browser posts that string
 * through the scan form, so the value reaching the save action is user input. A
 * signed-in user could otherwise post someone else's pathname and attach their
 * photo to their own receipt, which the serving route would then hand them.
 * `isOwnReceiptImagePathname` is what closes that: the save action only accepts
 * a pathname inside the caller's own folder.
 */

const ROOT = "receipts"

/**
 * Shape a user id has to have before it can be trusted as a path segment. The
 * ids are Clerk's (`user_` plus an alphanumeric body), and the check matters
 * because a `/` in an id would silently move the folder boundary and make the
 * prefix comparison below mean something other than "this user's folder".
 */
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Shape of the filename segment. Deliberately pinned to exactly what
 * `newReceiptImagePathname` emits — a v4 UUID and a `.jpg` suffix — rather than
 * something permissive: it is the whole defence against `../` traversal, extra
 * path segments, and query strings smuggled into the stored value.
 */
const SAFE_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

/**
 * Binary upload budget for a compressed receipt photo.
 *
 * This replaces the old 900KB data-URL ceiling. That number existed to fit a
 * Server Action's 1MB request body, and base64 spent a third of the allowance
 * on encoding overhead. The upload is now a Route Handler, which on Vercel
 * accepts roughly 4.5MB, so the budget buys real resolution instead: 3MB of
 * JPEG, with the remaining headroom left for multipart framing.
 */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

/** The only content type the capture produces, and the only one accepted. */
export const IMAGE_CONTENT_TYPE = "image/jpeg"

/** A fresh pathname in `userId`'s folder. The only place pathnames are minted. */
export function newReceiptImagePathname(userId: string): string {
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("Cannot build a blob pathname for this user id.")
  }

  return `${ROOT}/${userId}/${crypto.randomUUID()}.jpg`
}

/**
 * Whether `value` is a pathname this user is allowed to attach to a receipt.
 *
 * Checked as a prefix *and* an exact filename match, so nothing after the
 * folder can walk back out of it.
 */
export function isOwnReceiptImagePathname(
  value: unknown,
  userId: string
): value is string {
  if (typeof value !== "string") return false
  if (!SAFE_USER_ID.test(userId)) return false

  const prefix = `${ROOT}/${userId}/`
  if (!value.startsWith(prefix)) return false

  return SAFE_FILENAME.test(value.slice(prefix.length))
}
