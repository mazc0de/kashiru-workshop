import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { wibDate } from '@/pos/saleNumber'
import { periodParams, readPeriod, type Period } from '@/reports/period'

const PERIOD_KEYS = ['period', 'from', 'to']

/** Periode dari alamat halaman (R33). Parameter lain di alamat, mis. filter akun, tetap dipertahankan. */
export function usePeriod() {
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => wibDate(new Date()))
  const period = readPeriod(params, today)
  const setPeriod = (p: Period) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        PERIOD_KEYS.forEach((k) => next.delete(k))
        Object.entries(periodParams(p)).forEach(([k, v]) => next.set(k, v))
        return next
      },
      { replace: true },
    )
  return { period, setPeriod, today }
}

export type PeriodState = ReturnType<typeof usePeriod>
