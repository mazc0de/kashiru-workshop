import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { useSession } from '@/auth/session'
import { KashiruMark } from '@/components/KashiruMark'
import { Button } from '@/components/ui/button'

/** Semua layar aplikasi hanya untuk akun yang login, terdaftar, dan aktif (PRD 8). */
export function RequireLogin({ children }: { children: ReactNode }) {
  const { status, signOut, reload } = useSession()
  const location = useLocation()

  switch (status.stage) {
    case 'loading':
      return <StatusScreen />
    case 'signedOut':
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    case 'error':
      return (
        <StatusScreen title="Akun tidak bisa dimuat" description={status.message}>
          <Button onClick={reload}>Coba lagi</Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Masuk dengan akun lain
          </Button>
        </StatusScreen>
      )
    case 'inactive':
      return (
        <StatusScreen title="Akun nonaktif" description={`Akun ${status.email} sudah dinonaktifkan. Minta akun lain di bengkel mengaktifkannya lagi dari Pengaturan, Akun.`}>
          <Button onClick={() => void signOut()}>Masuk dengan akun lain</Button>
        </StatusScreen>
      )
    case 'unregistered':
      return (
        <StatusScreen title="Akun belum terdaftar" description={`Akun ${status.email} belum terdaftar di Kashiru bengkel ini.`}>
          <Button onClick={() => void signOut()}>Masuk dengan akun lain</Button>
        </StatusScreen>
      )
    case 'signedIn':
      return children
  }
}

function StatusScreen({ title, description, children }: { title?: string; description?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pt-[12vh]" aria-busy={!title}>
      <div className="w-full max-w-[420px]">
        <KashiruMark />
        {title && (
          <>
            <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-muted-foreground">{description}</p>
            <div className="mt-6 flex flex-wrap gap-2">{children}</div>
          </>
        )}
      </div>
    </main>
  )
}
