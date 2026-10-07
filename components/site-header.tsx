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

export function SiteHeader() {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
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
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              className={cn(
                "text-muted-foreground",
                pathname === item.href && "bg-muted text-foreground"
              )}
              nativeButton={false}
              render={<Link href={item.href} />}
            >
              {item.label}
            </Button>
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
                  <Button
                    key={item.href}
                    variant="ghost"
                    className={cn(
                      "justify-start",
                      pathname === item.href && "bg-muted"
                    )}
                    onClick={() => setOpen(false)}
                    nativeButton={false}
                    render={<Link href={item.href} />}
                  >
                    {item.label}
                  </Button>
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
