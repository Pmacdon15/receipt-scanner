import { RECEIPT_TYPES } from "@/lib/receipt-types"
import { cn } from "@/lib/utils"

// One accent dot per category, so the rail reads as a set at a glance.
const DOT: Record<(typeof RECEIPT_TYPES)[number]["id"], string> = {
  grocery: "bg-emerald-500",
  restaurant: "bg-orange-500",
  fuel: "bg-sky-500",
  travel: "bg-violet-500",
  office: "bg-blue-500",
  hardware: "bg-amber-500",
  medical: "bg-rose-500",
  utilities: "bg-teal-500",
  other: "bg-zinc-400",
}

function Chip({ type }: { type: (typeof RECEIPT_TYPES)[number] }) {
  return (
    <li className="flex shrink-0 items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-xs">
      <span className={cn("size-2 rounded-full", DOT[type.id])} />
      <span className="whitespace-nowrap font-medium text-sm">
        {type.label}
      </span>
      <span className="hidden whitespace-nowrap text-muted-foreground text-xs sm:inline">
        {type.description}
      </span>
    </li>
  )
}

/**
 * The built-in categories as a slow, edge-faded rail. The list is rendered
 * twice so the loop is seamless; the copy is hidden from assistive tech, and
 * under reduced motion the rail stops and wraps instead.
 */
export function CategoryRail() {
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:[mask-image:none]">
      <div className="flex w-max animate-home-marquee gap-3 motion-reduce:w-full hover:[animation-play-state:paused]">
        <ul className="flex gap-3 motion-reduce:flex-wrap">
          {RECEIPT_TYPES.map((type) => (
            <Chip key={type.id} type={type} />
          ))}
        </ul>
        <ul aria-hidden className="flex gap-3 motion-reduce:hidden">
          {RECEIPT_TYPES.map((type) => (
            <Chip key={type.id} type={type} />
          ))}
        </ul>
      </div>
    </div>
  )
}
