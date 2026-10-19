import { useSyncExternalStore } from 'react'

// Lebar laptop (PRD 6): layar di bawah 1024px dianggap HP. Dipakai untuk merender hanya satu versi layar,
// bukan menyembunyikan versi lain dengan CSS.

const LAPTOP = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(LAPTOP)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsLaptop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(LAPTOP).matches, () => true)
}
