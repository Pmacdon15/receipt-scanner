import { toast } from "sonner"

import { PRICING_PATH } from "@/lib/billing/plans"

/**
 * Toasts an action's error. When the plan was what blocked it (the action set
 * `upgrade`), the toast also links to the pricing page.
 */
export function toastActionError(result: {
  message: string
  upgrade?: boolean
}) {
  if (!result.upgrade) {
    toast.error(result.message)
    return
  }

  toast.error(result.message, {
    action: {
      label: "See plans",
      onClick: () => window.location.assign(PRICING_PATH),
    },
  })
}
