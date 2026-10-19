import { useOutletContext } from 'react-router'

import type { PeriodState } from '@/reports/usePeriod'

// Periode yang dipakai bersama semua laporan, dari ReportsLayout lewat Outlet.

export type ReportContext = PeriodState

export function useReportContext(): ReportContext {
  return useOutletContext<ReportContext>()
}

/** "laporan-penjualan-2026-10-01_2026-10-19", atau satu tanggal kalau periodenya satu hari. */
export function reportFileName(name: string, p: { from: string; to: string }): string {
  return `laporan-${name}-${p.from === p.to ? p.from : `${p.from}_${p.to}`}`
}

export const sumOf = <T,>(rows: T[], value: (r: T) => number) => rows.reduce((s, r) => s + value(r), 0)
