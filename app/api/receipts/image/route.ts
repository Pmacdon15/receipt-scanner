/**
 * Receipt photo upload.
 *
 * A Route Handler rather than a Server Action, deliberately: a Server Action's
 * request body is capped at 1MB, which is what forced the old base64 data-URL
 * pipeline down to a 900KB budget. A Vercel function accepts roughly 4.5MB, so
 * the photo can be posted as binary multipart form data at real resolution with
 * no `bodySizeLimit` override.
 *
 * The response is only the blob's pathname. The browser posts that back through
 * the scan form, where `scanReceiptAction` re-checks that it sits in the
 * caller's own folder before storing it.
 */

import { auth } from "@clerk/nextjs/server"
import { put } from "@vercel/blob"
import type { NextRequest } from "next/server"

import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  newReceiptImagePathname,
} from "@/lib/receipt-image"

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return Response.json(
      { error: "Sign in to upload a photo." },
      { status: 401 }
    )
  }

  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get("file")
  } catch {
    return Response.json(
      { error: "Could not read the upload." },
      { status: 400 }
    )
  }

  // `File` extends `Blob`; a plain string here means the field was not a file.
  if (!(file instanceof Blob)) {
    return Response.json({ error: "No photo was attached." }, { status: 400 })
  }

  // The client compresses before posting, but this is a public endpoint, so the
  // type and size are re-checked here rather than trusted.
  if (file.type !== IMAGE_CONTENT_TYPE) {
    return Response.json(
      { error: "Only JPEG photos can be uploaded." },
      { status: 415 }
    )
  }

  if (file.size === 0) {
    return Response.json({ error: "That photo was empty." }, { status: 400 })
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "That photo is too large." }, { status: 413 })
  }

  try {
    // Namespaced by user so the pathname coming back through the form can be
    // checked against the caller before it is stored.
    const blob = await put(newReceiptImagePathname(userId), file, {
      access: "private",
      contentType: IMAGE_CONTENT_TYPE,
    })

    return Response.json({ pathname: blob.pathname })
  } catch (error) {
    console.error("receipt photo upload failed", error)
    return Response.json(
      { error: "That photo could not be stored. Try again." },
      { status: 502 }
    )
  }
}
