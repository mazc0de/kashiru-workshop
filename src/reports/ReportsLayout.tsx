import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { cn } from 'cn'

import { PeriodFilter } from '@/reports/PeriodFilter'
import { usePeriod } from '@/reports/usePeriod'
import { periodParams } from '@/reports/period'

/** Tujuh laporan sebagai tab beralamat sendiri (R33). */
const REPORTS = [
  { path: 'sales', title: 'Penjualan' },
  { path: 'profit', title: 'Laba kotor' },
  { path: 'mechanics', title: 'Jasa per mekanik' },
  { path: 'service-history', title: 'Riwayat servis' },
  { path: 'stock', title: 'Stok' },
  { path: 'receiving', title: 'Penerimaan' },
  { path: 'stocktake', title: 'Opname' },
] as const

/**
 * Menu Laporan (PRD 4.11, R33): tab di laptop, dropdown di HP, dan filter periode bersama yang
 * tersimpan di alamat, jadi pindah tab tidak mengulang pilihan periode.
 */
export function ReportsLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const period = usePeriod()
  const current = REPORTS.find((r) => pathname.startsWith(`/reports/${r.path}`)) ?? REPORTS[0]
  const search = `?${new URLSearchParams(periodParams(period.period))}`

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Laporan</h1>
      <select
        aria-label="Pilih laporan"
        className="mt-4 h-11 w-full rounded-md border border-input bg-card px-3 text-[15px] lg:hidden"
        value={current.path}
        onChange={(e) => navigate({ pathname: `/reports/${e.target.value}`, search })}
      >
        {REPORTS.map((r) => (
          <option key={r.path} value={r.path}>
            {r.title}
          </option>
        ))}
      </select>
      <nav aria-label="Jenis laporan" className="mt-4 hidden gap-6 overflow-x-auto border-b border-border lg:flex">
        {REPORTS.map((r) => (
          <NavLink
            key={r.path}
            to={{ pathname: `/reports/${r.path}`, search }}
            className={({ isActive }) =>
              cn(
                '-mb-px flex h-11 shrink-0 items-center border-b-2 text-[15px] whitespace-nowrap',
                isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {r.title}
          </NavLink>
        ))}
      </nav>
      {current.path !== 'service-history' && (
        <div className="mt-4">
          <PeriodFilter {...period} />
        </div>
      )}
      <Outlet context={period} />
    </>
  )
}
