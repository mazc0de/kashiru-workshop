import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Menu } from 'lucide-react'
import { cn } from 'cn'

import { DEFAULT_LOGOUT_HOURS, useAutoLogout } from '@/auth/autoLogout'
import { useProfile, useSession } from '@/auth/session'
import { useOnline } from '@/lib/online'
import { useSettings } from '@/lib/settings'
import { useSync } from '@/pos/outbox'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { KashiruMark } from '@/components/KashiruMark'
import { NAVIGATION, SETTINGS, type Screen } from '@/app/navigation'
import { SyncStatus } from '@/app/SyncStatus'

/*
 * Shell "open plane" (taste-skill achromatic-ledger): sidebar berlabel di atas dasar layar,
 * dipisah satu garis 1px, tanpa top bar di laptop. Di bawah 1024px sidebar dilipat menjadi
 * top bar 56px dengan nama produk dan tombol menu yang membuka daftar navigasi layar penuh.
 * Aritmetika: sidebar 240px + kanvas cair dengan gutter 32px di laptop, 16px di HP.
 */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { signOut } = useSession()
  const settings = useSettings()
  useAutoLogout(settings.data?.auto_logout_jam ?? DEFAULT_LOGOUT_HOURS, signOut)
  useSync()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border lg:flex">
        <Brand />
        <NavList />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-2 lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Buka menu" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" strokeWidth={1.75} />
        </Button>
        {/* Judul layar sudah ada di h1, jadi top bar menamai produknya. */}
        <KashiruMark className="size-5" />
        <span className="font-semibold">Kashiru</span>
        <div className="ml-auto min-w-0">
          <SyncStatus compact />
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-none lg:hidden"
          // Fokus awal ke layar yang sedang dibuka, bukan ke item pertama.
          initialFocus={() => document.querySelector<HTMLElement>('[data-slot="sheet-content"] a[aria-current="page"]')}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <NavList onSelect={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="min-w-0 px-4 pt-6 pb-10 lg:px-8 lg:pt-8">
        <Outlet />
      </main>
    </div>
  )
}

function Brand() {
  const workshopName = useSettings().data?.nama_bengkel
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
      <KashiruMark />
      <div className="min-w-0">
        <p className="text-base leading-5 font-semibold">Kashiru</p>
        {workshopName && <p className="truncate text-sm leading-5 text-muted-foreground">{workshopName}</p>}
      </div>
    </div>
  )
}

/** Akun yang login dan tombol Ganti akun di pojok bawah (PRD 4.1). Ganti akun butuh internet. */
function AccountRow() {
  const profile = useProfile()
  const { signOut } = useSession()
  const online = useOnline()
  return (
    <div className="flex items-center gap-2 border-t border-rule px-3 pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-5">{profile.nama}</p>
        <p className="truncate text-sm leading-5 text-muted-foreground">{profile.email}</p>
      </div>
      <Button
        variant="outline"
        disabled={!online}
        title={online ? undefined : 'Ganti akun butuh internet'}
        onClick={() => void signOut()}
      >
        Ganti akun
      </Button>
    </div>
  )
}

function NavList({ onSelect }: { onSelect?: () => void }) {
  return (
    <nav aria-label="Navigasi utama" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
      {NAVIGATION.map((group, i) => (
        <div key={i} className={cn(i > 0 && 'mt-3 border-t border-rule pt-3')}>
          {group.label && <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">{group.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.screen.map((screen) => (
              <NavItem key={screen.path} screen={screen} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      ))}
      <ul className="mt-auto flex flex-col gap-0.5 border-t border-rule pt-3 pb-3">
        <NavItem screen={SETTINGS} onSelect={onSelect} />
      </ul>
      <div className="px-1 pb-3 empty:hidden">
        <SyncStatus onSelect={onSelect} />
      </div>
      <AccountRow />
    </nav>
  )
}

function NavItem({ screen, onSelect }: { screen: Screen; onSelect?: () => void }) {
  const Icon = screen.icon
  return (
    <li>
      <NavLink
        to={screen.path}
        onClick={onSelect}
        className={({ isActive }) =>
          cn(
            'flex h-11 items-center gap-2.5 rounded-md px-3 text-[15px] text-muted-foreground transition-colors',
            'hover:bg-active/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
            isActive && 'bg-active text-foreground',
          )
        }
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{screen.title}</span>
      </NavLink>
    </li>
  )
}
