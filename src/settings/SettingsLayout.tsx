import { NavLink, Outlet } from 'react-router'
import { cn } from 'cn'

import { LaptopOnly } from '@/app/LaptopOnly'

/** Bagian Pengaturan (PRD 4.14). */
const SECTIONS = [
  { path: 'workshop-profile', title: 'Profil bengkel' },
  { path: 'document-numbers', title: 'Nomor dokumen' },
  { path: 'printing', title: 'Cetak' },
  { path: 'stocktake', title: 'Opname' },
  { path: 'scanner', title: 'Scanner' },
  { path: 'backup', title: 'Backup' },
  { path: 'accounts', title: 'Akun', group: 'Akun' },
  { path: 'security', title: 'Keamanan' },
  { path: 'categories', title: 'Kategori', group: 'Data master' },
  { path: 'mechanics', title: 'Mekanik' },
] as const

/** Satu tampilan per bagian, dengan nama bagian sebagai h1 (taste-skill app-screens §8.2). */
export function SettingsLayout() {
  return (
    <LaptopOnly title="Pengaturan">
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-8">
        <nav aria-label="Bagian pengaturan" className="flex flex-col gap-0.5 pt-1">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">Pengaturan</p>
          {SECTIONS.map((b) => [
            'group' in b && (
              <p key={b.group} className="mt-4 px-3 pb-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">
                {b.group}
              </p>
            ),
            <NavLink
              key={b.path}
              to={b.path}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center rounded-md px-3 text-[15px] text-muted-foreground transition-colors hover:bg-active/60 hover:text-foreground',
                  isActive && 'bg-active text-foreground',
                )
              }
            >
              {b.title}
            </NavLink>,
          ])}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </LaptopOnly>
  )
}
