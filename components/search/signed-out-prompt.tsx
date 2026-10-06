import { LockIcon } from "lucide-react"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import { Button } from "@/components/ui/button"

export function SignedOutPrompt() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-muted">
        <LockIcon className="size-5" />
      </span>

      <h1 className="mt-5 font-semibold text-2xl tracking-tight">
        Sign in to search receipts
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">
        Receipts are private to your account and your organization, so search
        needs you signed in.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <ReturnSignInButton>
          <Button variant="outline" className="w-full sm:w-auto">
            Sign in
          </Button>
        </ReturnSignInButton>
        <ReturnSignUpButton>
          <Button className="w-full sm:w-auto">Create an account</Button>
        </ReturnSignUpButton>
      </div>
    </div>
  )
}
