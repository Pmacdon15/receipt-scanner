"use client"

import { Trash2Icon } from "lucide-react"
import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { formatDate, formatMoney } from "@/lib/money"

type DeletableReceipt = {
  merchant: string
  totalCents: number
  currency: string
  purchasedOn: string | null
  hasImage: boolean
}

/**
 * Trash button that asks before deleting. `onConfirm` runs once the user
 * confirms; the caller removes the row optimistically, so the dialog closes
 * straight away rather than waiting on the server.
 */
export function DeleteReceiptButton({
  receipt,
  onConfirm,
  disabled,
}: {
  receipt: DeletableReceipt
  onConfirm: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete receipt from ${receipt.merchant}`}
            disabled={disabled}
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
          <AlertDialogDescription>
            The receipt from {receipt.merchant} for{" "}
            {formatMoney(receipt.totalCents, receipt.currency)} on{" "}
            {formatDate(receipt.purchasedOn)}
            {receipt.hasImage ? ", and its photo," : ""} will be permanently
            deleted. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
