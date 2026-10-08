import { SignUp } from "@clerk/nextjs"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

// Clerk's <SignUp> reads the URL for its routing, which is request data under
// Cache Components, so it renders under Suspense with a card-sized fallback.
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={<Skeleton className="h-[480px] w-[400px] rounded-xl" />}
      >
        <SignUp />
      </Suspense>
    </div>
  )
}
