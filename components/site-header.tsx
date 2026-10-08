"use client"

import { UserButton, useAuth } from "@clerk/nextjs"
import { MenuIcon, ReceiptTextIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import {
  ReturnSignInButton,
  ReturnSignUpButton,
} from "@/components/auth/return-auth-buttons"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

type NavButtonProps = Omit<ButtonProps, "render" | "nativeButton"> & {
  href: string
  activeClassName: string
}

/**
 * A nav link that highlights itself on the current page. usePathname() is URL
 * data, so with Cache Components only this link waits on it: the header stays
 * in the static shell and the fallback is the same link, not highlighted.
 */
function NavButton(props: NavButtonProps) {
  return (
    <React.Suspense fallback={<NavLinkButton {...props} active={false} />}>
      <CurrentNavButton {...props} />
    </React.Suspense>
  )
}

function CurrentNavButton(props: NavButtonProps) {
  const active = usePathname() === props.href
  return <NavLinkButton {...props} active={active} />
}

function NavLinkButton({
  href,
  activeClassName,
  active,
  className,
  ...props
}: NavButtonProps & { active: boolean }) {
  return (
    <Button
      {...props}
      className={cn(className, active && activeClassName)}
      nativeButton={false}
      render={<Link href={href} />}
    />
  )
}

export function SiteHeader() {
  const [open, setOpen] = React.useState(false)
  const { isLoaded, isSignedIn } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptTextIcon className="size-4" />
          </span>
          <span>{site.name}</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {site.nav.map((item) => (
            <NavButton
              key={item.href}
              href={item.href}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              activeClassName="bg-muted text-foreground"
            >
              {item.label}
            </NavButton>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {!isLoaded && <Skeleton className="size-7 rounded-full" />}

          {isLoaded && !isSignedIn && (
            <div className="hidden items-center gap-2 sm:flex">
              <ReturnSignInButton>
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </ReturnSignInButton>
              <ReturnSignUpButton>
                <Button size="sm">Get started</Button>
              </ReturnSignUpButton>
            </div>
          )}

          {isLoaded && isSignedIn && (
            <UserButton appearance={{ elements: { avatarBox: "size-7" } }} />
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open menu"
                  className="md:hidden"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>{site.name}</SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col gap-1 px-4">
                {site.nav.map((item) => (
                  <NavButton
                    key={item.href}
                    href={item.href}
                    variant="ghost"
                    className="justify-start"
                    activeClassName="bg-muted"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </NavButton>
                ))}
              </nav>

              {isLoaded && !isSignedIn && (
                <div className="mt-auto flex flex-col gap-2 border-t p-4">
                  <ReturnSignInButton>
                    <Button variant="outline" className="w-full">
                      Sign in
                    </Button>
                  </ReturnSignInButton>
                  <ReturnSignUpButton>
                    <Button className="w-full">Get started</Button>
                  </ReturnSignUpButton>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
