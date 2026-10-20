import {
  Barcode,
  Boxes,
  ChartColumn,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScanBarcode,
  Settings,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export type Screen = {
  path: string
  title: string
  icon: LucideIcon
  /** Layar yang hanya dirancang untuk laptop menampilkan pesan di HP (PRD 6). */
  laptopOnly: boolean
  /** Fase rencana implementasi yang membangun layar ini. */
  phase: number
}

export type NavGroup = { label: string | null; screen: Screen[] }

export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    screen: [
      { path: '/dashboard', title: 'Dashboard', icon: LayoutDashboard, laptopOnly: false, phase: 8 },
      { path: '/pos', title: 'Kasir', icon: ScanBarcode, laptopOnly: true, phase: 5 },
      { path: '/sales', title: 'Riwayat nota', icon: ReceiptText, laptopOnly: false, phase: 5 },
    ],
  },
  {
    label: 'Stok',
    screen: [
      { path: '/products', title: 'Produk', icon: Package, laptopOnly: true, phase: 4 },
      { path: '/services', title: 'Jasa', icon: Wrench, laptopOnly: true, phase: 4 },
      { path: '/barcode-labels', title: 'Label barcode', icon: Barcode, laptopOnly: true, phase: 4 },
      { path: '/stock', title: 'Stok', icon: Boxes, laptopOnly: false, phase: 6 },
      { path: '/receiving', title: 'Penerimaan', icon: Truck, laptopOnly: true, phase: 6 },
      { path: '/stocktake', title: 'Opname', icon: ClipboardCheck, laptopOnly: true, phase: 6 },
    ],
  },
  {
    label: null,
    screen: [
      { path: '/reports', title: 'Laporan', icon: ChartColumn, laptopOnly: false, phase: 8 },
      { path: '/history', title: 'Riwayat perubahan', icon: History, laptopOnly: false, phase: 8 },
    ],
  },
]

export const SETTINGS: Screen = {
  path: '/settings',
  title: 'Pengaturan',
  icon: Settings,
  laptopOnly: true,
  phase: 3,
}

export const ALL_SCREENS: Screen[] = [...NAVIGATION.flatMap((g) => g.screen), SETTINGS]

/** Layar yang sudah punya rute sendiri; sisanya masih berupa kerangka sampai fasenya dibangun. */
const BUILT_SCREENS = new Set(['/dashboard', '/pos', '/sales', '/products', '/services', '/barcode-labels', '/stock', '/receiving', '/stocktake', '/reports', '/history', '/settings'])
export const SKELETON_SCREENS: Screen[] = NAVIGATION.flatMap((g) => g.screen).filter((l) => !BUILT_SCREENS.has(l.path))
