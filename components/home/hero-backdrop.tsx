"use client"

import DotGrid from "@/components/aicanvas/dot-grid"

/**
 * Hero backdrop: the AI Canvas dot grid, held behind the hero content.
 *
 * The registry component is vendored verbatim so it stays updatable, which is
 * why it is wrapped here instead of edited: the wrapper clips its built-in
 * full-screen box and fades the grid out before it reaches the hero text.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(120%_85%_at_70%_15%,black,transparent_75%)]"
    >
      <div className="pointer-events-auto absolute inset-0">
        <DotGrid
          showLabel={false}
          colors={{
            background: "transparent",
            baseAlpha: 0.1,
            peakAlpha: 0.55,
          }}
        />
      </div>
    </div>
  )
}
