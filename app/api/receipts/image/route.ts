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

import { newReceiptImagePathname } from "@/lib/receipt-image"
import {
  IMAGE_CONTENT_TYPE,
  imageUploadFileSchema,
  imageUploadResponseSchema,
} from "@/lib/schemas"

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

  const parsedFile = imageUploadFileSchema.safeParse(file)
  if (!parsedFile.success) {
    const issue = parsedFile.error.issues[0]
    const status =
      issue && "params" in issue && typeof issue.params === "object" && issue.params !== null && "status" in issue.params
        ? Number((issue.params as { status?: number }).status)
        : 400
    return Response.json({ error: issue.message }, { status })
  }

  const validBlob = parsedFile.data

  try {
    // Namespaced by user so the pathname coming back through the form can be
    // checked against the caller before it is stored.
    const blob = await put(newReceiptImagePathname(userId), validBlob, {
      access: "private",
      contentType: IMAGE_CONTENT_TYPE,
    })

    const payload = imageUploadResponseSchema.parse({ pathname: blob.pathname })
    return Response.json(payload)
  } catch (error) {
    console.error("receipt photo upload failed", error)
    return Response.json(
      { error: "That photo could not be stored. Try again." },
      { status: 502 }
    )
  }
}
