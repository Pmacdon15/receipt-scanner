/**
 * Serves one receipt's photo out of the private blob store.
 *
 * Authorization keys off the **receipt id**, never off a pathname from the
 * client. Vercel's own example for reading a private blob takes `?pathname=`
 * from the query string; doing that here would turn this into a read-any-blob
 * endpoint for anyone with an account, since the store holds every user's
 * photos. Instead the id goes through the DAL, which scopes the lookup to the
 * signed-in user, and the pathname is whatever that row happens to hold.
 */

import { auth } from "@clerk/nextjs/server"
import { get } from "@vercel/blob"
import type { NextRequest } from "next/server"

import { getReceiptImage } from "@/lib/dal/receipts"

/** Receipt ids are uuids; anything else would make Postgres throw on the cast. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One body for every refusal, so a probe cannot tell the cases apart. */
function notFound() {
  return new Response("Not found", { status: 404 })
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/receipts/[id]/image">
) {
  const { userId } = await auth()
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const { id } = await ctx.params
  if (!UUID.test(id)) return notFound()

  // Scoped to the signed-in user inside the DAL: a receipt belonging to
  // somebody else reads as missing, so this is the authorization check.
  const pathname = await getReceiptImage(id)
  if (!pathname) return notFound()

  let result
  try {
    result = await get(pathname, { access: "private" })
  } catch (error) {
    console.error("receipt photo read failed", error)
    return new Response("Bad gateway", { status: 502 })
  }

  // The 200 branch is the only one carrying a stream; a 304 needs a conditional
  // request, which this handler never makes.
  if (!result || result.statusCode !== 200) return notFound()

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Length": String(result.blob.size),
      // Private bytes: nothing between here and the browser may keep a copy,
      // and the browser must re-authorize on every view.
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
