import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import './index.css'
import { ConfigMissing } from '@/app/ConfigMissing'
import { router } from '@/app/router'
import { SessionProvider } from '@/auth/SessionProvider'
import { readEnv } from '@/lib/env'
import { migrateLocalStorage } from '@/lib/localMigration'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

// Kunci localStorage lama (sebelum R26) dipindah sebelum layar mana pun membacanya.
migrateLocalStorage()

const env = readEnv()
const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    {env.ok ? (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    ) : (
      <ConfigMissing short={env.short} />
    )}
  </StrictMode>,
)
