import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { QueryProvider } from "@/components/query-provider"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: `${site.name} — receipt scanning for small teams`,
    template: `%s · ${site.name}`,
  },
  description: site.tagline,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body className="min-h-dvh bg-background text-foreground">
        <ClerkProvider>
          <QueryProvider>
            <ThemeProvider>
              <div className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <footer className="border-t py-6">
                  <div className="mx-auto w-full max-w-6xl px-4 text-sm text-muted-foreground sm:px-6">
                    {site.name} — {site.tagline}
                  </div>
                </footer>
              </div>
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
