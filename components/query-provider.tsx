"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as React from "react"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Results the server just rendered, or the autocomplete just fetched,
        // are good for a little while; long enough that typing, clearing and
        // paging back and forth hit the cache instead of the network.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser tab, created once; never shared between requests
  // on the server.
  const [client] = React.useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
