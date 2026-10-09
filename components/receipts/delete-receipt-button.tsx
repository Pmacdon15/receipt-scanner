"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { deleteReceiptAction } from "@/app/actions/receipts"
import { Button } from "@/components/ui/button"

/**
 * Deletes a receipt (and its photo) after the user confirms. The action
 * refreshes the page's server data; `onDeleted` lets the caller drop any
 * client-side copies too.
 */
export function DeleteReceiptButton({
  receipt,
  onDeleted,
}: {
  receipt: { id: string; merchant: string }
  onDeleted?: (id: string) => void
}) {
  const [isPending, startTransition] = React.useTransition()

  function remove() {
    if (
      !window.confirm(
        `Delete the receipt from ${receipt.merchant}? Its photo is deleted too.`
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await deleteReceiptAction(receipt.id)
      if (result.status === "error") {
        toast.error(result.message)
        return
      }
      toast.success("Receipt deleted.")
      onDeleted?.(receipt.id)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete receipt from ${receipt.merchant}`}
      disabled={isPending}
      onClick={remove}
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
    </Button>
  )
}
