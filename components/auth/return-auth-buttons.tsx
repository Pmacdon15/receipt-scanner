"use client"

import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import * as React from "react"

/**
 * The page to come back to after signing in or up: the one the person was on
 * (path plus query, so search filters survive). On the home page there is
 * nothing to return to, so it's left undefined and Clerk uses the env
 * fallback (/scan).
 */
function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

function useReturnUrl() {
  const pathname = usePathname()
  // Read the query straight off the URL (re-read on every render, so client
  // navigations pick it up) rather than useSearchParams, to keep the URL
  // reads to this one small component.
  const search = React.useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  )

  if (!pathname || pathname === "/") return undefined
  return `${pathname}${search}`
}

type SignInProps = React.ComponentProps<typeof SignInButton>
type SignUpProps = React.ComponentProps<typeof SignUpButton>

// usePathname() is URL data, so with Cache Components it must sit under
// Suspense. Each button owns that boundary; the fallback is the same Clerk
// button without a return URL (Clerk's env fallback applies until it resolves).

export function ReturnSignInButton(props: SignInProps) {
  return (
    <React.Suspense fallback={<SignInButton mode="modal" {...props} />}>
      <SignInWithReturn {...props} />
    </React.Suspense>
  )
}

export function ReturnSignUpButton(props: SignUpProps) {
  return (
    <React.Suspense fallback={<SignUpButton mode="modal" {...props} />}>
      <SignUpWithReturn {...props} />
    </React.Suspense>
  )
}

function SignInWithReturn(props: SignInProps) {
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

function SignUpWithReturn(props: SignUpProps) {
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
