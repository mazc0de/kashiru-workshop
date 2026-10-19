import { Navigate } from 'react-router'

import { useIsLaptop } from '@/lib/useIsLaptop'

/** Halaman awal (R51): laptop langsung membuka Kasir, HP membuka Dashboard. Semua laptop setara (R50). */
export function HomeRedirect() {
  return <Navigate to={useIsLaptop() ? '/pos' : '/dashboard'} replace />
}
