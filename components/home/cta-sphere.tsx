"use client"

import SphereLines from "@/components/aicanvas/sphere-lines"

/**
 * The AI Canvas sphere-lines globe, held behind the closing call to action.
 *
 * Vendored verbatim like the hero dot grid, so it is wrapped rather than
 * edited. The component paints its own warm paper / ink background, which the
 * CTA panel matches (#F5F1EA light, #110F0C dark) so the canvas edge never shows; the mask
 * fades the globe out before it reaches the copy: above it on phones, beside
 * it from the sm breakpoint up.
 */
export function CtaSphere() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-64 [mask-image:linear-gradient(to_bottom,black_45%,transparent)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-auto sm:w-3/5 lg:w-1/2 sm:[mask-image:linear-gradient(to_left,black_40%,transparent_85%)]"
    >
      <SphereLines />
    </div>
  )
}
