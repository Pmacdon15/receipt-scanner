"use client"

import { usePathname } from "next/navigation"
import * as React from "react"
import { SignInButton, SignUpButton } from "@clerk/nextjs"

/**
 * The page to come back to after signing in or up: the one the person was on
 * (path plus query, so search filters survive). On the home page there is
 * nothing to return to, so it's left undefined and Clerk uses the env
 * fallback (/scan).
 */
function useReturnUrl() {
  const pathname = usePathname()
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    setSearch(window.location.search)
  }, [pathname])

  if (!pathname || pathname === "/") return undefined
  return `${pathname}${search}`
}

type SignInProps = React.ComponentProps<typeof SignInButton>
type SignUpProps = React.ComponentProps<typeof SignUpButton>

export function ReturnSignInButton(props: SignInProps) {
  const returnUrl = useReturnUrl()
  return (
    <SignInButton
      mode="modal"
      forceRedirectUrl={returnUrl}
      signUpForceRedirectUrl={returnUrl}
      {...props}
    />
  )
}

export function ReturnSignUpButton(props: SignUpProps) {
  const returnUrl = useReturnUrl()
  return (
    <SignUpButton
      mode="modal"
      forceRedirectUrl={returnUrl}
      signInForceRedirectUrl={returnUrl}
      {...props}
    />
  )
}
