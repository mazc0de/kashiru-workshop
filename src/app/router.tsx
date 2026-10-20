import { Navigate, createBrowserRouter } from 'react-router'

import { AppShell } from '@/app/AppShell'
import { PhasePlaceholder, NotFound } from '@/app/PhasePlaceholder'
import { LaptopOnly } from '@/app/LaptopOnly'
import { HomeRedirect } from '@/app/HomeRedirect'
import { SKELETON_SCREENS } from '@/app/navigation'
import { RequireLogin } from '@/auth/RequireLogin'

// Layar selain kasir dimuat terpisah supaya bundel awal kecil. Service worker tetap
// menyimpan semua bagiannya, jadi aplikasi tetap terbuka saat offline.
export const router = createBrowserRouter([
  { path: '/login', lazy: async () => ({ Component: (await import('@/auth/LoginPage')).LoginPage }) },
  {
    element: (
      <RequireLogin>
        <AppShell />
      </RequireLogin>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        path: '/pos',
        lazy: async () => {
          const { PosPage } = await import('@/pos/PosPage')
          return { element: <LaptopOnly title="Kasir"><PosPage /></LaptopOnly> }
        },
      },
      ...SKELETON_SCREENS.map((screen) => ({ path: screen.path, element: <PhasePlaceholder screen={screen} /> })),
      { path: '/dashboard', lazy: async () => ({ Component: (await import('@/dashboard/DashboardPage')).DashboardPage }) },
      // Status stok responsif untuk HP; Saran belanja menampilkan pesan laptop di dalam halamannya (R36).
      { path: '/stock', lazy: async () => ({ Component: (await import('@/stock/StockPage')).StockPage }) },
      {
        path: '/stock/:id',
        lazy: async () => {
          const { StockCardPage } = await import('@/stock/StockCardPage')
          return { element: <LaptopOnly title="Kartu stok"><StockCardPage /></LaptopOnly> }
        },
      },
      {
        path: '/receiving',
        lazy: async () => {
          const { ReceivingPage } = await import('@/receiving/ReceivingPage')
          return { element: <LaptopOnly title="Penerimaan"><ReceivingPage /></LaptopOnly> }
        },
      },
      {
        path: '/receiving/new',
        lazy: async () => {
          const { ReceivingFormPage } = await import('@/receiving/ReceivingFormPage')
          return { element: <LaptopOnly title="Penerimaan baru"><ReceivingFormPage /></LaptopOnly> }
        },
      },
      {
        path: '/stocktake',
        lazy: async () => {
          const { StocktakePage } = await import('@/stocktake/StocktakePage')
          return { element: <LaptopOnly title="Opname"><StocktakePage /></LaptopOnly> }
        },
      },
      {
        path: '/stocktake/:id',
        lazy: async () => {
          const { StocktakeSessionPage } = await import('@/stocktake/StocktakeSessionPage')
          return { element: <LaptopOnly title="Sesi opname"><StocktakeSessionPage /></LaptopOnly> }
        },
      },
      { path: '/sales', lazy: async () => ({ Component: (await import('@/pos/SalesHistoryPage')).SalesHistoryPage }) },
      {
        path: '/reports',
        lazy: async () => ({ Component: (await import('@/reports/ReportsLayout')).ReportsLayout }),
        children: [
          { index: true, element: <Navigate to="sales" replace /> },
          { path: 'sales', lazy: async () => ({ Component: (await import('@/reports/SalesReport')).SalesReport }) },
          { path: 'profit', lazy: async () => ({ Component: (await import('@/reports/ProfitReport')).ProfitReport }) },
          { path: 'mechanics', lazy: async () => ({ Component: (await import('@/reports/MechanicsReport')).MechanicsReport }) },
          { path: 'service-history', lazy: async () => ({ Component: (await import('@/reports/ServiceHistoryReport')).ServiceHistoryReport }) },
          { path: 'stock', lazy: async () => ({ Component: (await import('@/reports/StockReport')).StockReport }) },
          { path: 'receiving', lazy: async () => ({ Component: (await import('@/reports/ReceivingReport')).ReceivingReport }) },
          { path: 'stocktake', lazy: async () => ({ Component: (await import('@/reports/StocktakeReport')).StocktakeReport }) },
        ],
      },
      { path: '/history', lazy: async () => ({ Component: (await import('@/history/ChangeHistoryPage')).ChangeHistoryPage }) },
      {
        path: '/products',
        lazy: async () => {
          const { ProductsPage } = await import('@/products/ProductsPage')
          return { element: <LaptopOnly title="Produk"><ProductsPage /></LaptopOnly> }
        },
      },
      {
        path: '/products/new',
        lazy: async () => {
          const { ProductFormPage } = await import('@/products/ProductFormPage')
          return { element: <LaptopOnly title="Produk baru"><ProductFormPage key="part" type="part" /></LaptopOnly> }
        },
      },
      {
        path: '/products/:id',
        lazy: async () => {
          const { ProductFormPage } = await import('@/products/ProductFormPage')
          return { element: <LaptopOnly title="Produk"><ProductFormPage key="part" type="part" /></LaptopOnly> }
        },
      },
      {
        path: '/services',
        lazy: async () => {
          const { ServicesPage } = await import('@/products/ServicesPage')
          return { element: <LaptopOnly title="Jasa"><ServicesPage /></LaptopOnly> }
        },
      },
      {
        path: '/services/new',
        lazy: async () => {
          const { ProductFormPage } = await import('@/products/ProductFormPage')
          return { element: <LaptopOnly title="Jasa baru"><ProductFormPage key="jasa" type="jasa" /></LaptopOnly> }
        },
      },
      {
        path: '/services/:id',
        lazy: async () => {
          const { ProductFormPage } = await import('@/products/ProductFormPage')
          return { element: <LaptopOnly title="Jasa"><ProductFormPage key="jasa" type="jasa" /></LaptopOnly> }
        },
      },
      {
        path: '/barcode-labels',
        lazy: async () => {
          const { BarcodeLabelsPage } = await import('@/products/BarcodeLabelsPage')
          return { element: <LaptopOnly title="Label barcode"><BarcodeLabelsPage /></LaptopOnly> }
        },
      },
      {
        path: '/settings',
        lazy: async () => ({ Component: (await import('@/settings/SettingsLayout')).SettingsLayout }),
        children: [
          { index: true, element: <Navigate to="workshop-profile" replace /> },
          { path: 'workshop-profile', lazy: async () => ({ Component: (await import('@/settings/WorkshopProfilePage')).WorkshopProfilePage }) },
          { path: 'document-numbers', lazy: async () => ({ Component: (await import('@/settings/NumberingAndPrintPages')).DocumentNumbersPage }) },
          { path: 'printing', lazy: async () => ({ Component: (await import('@/settings/NumberingAndPrintPages')).PrintSettingsPage }) },
          { path: 'stocktake', lazy: async () => ({ Component: (await import('@/settings/StocktakeSettingsPage')).StocktakeSettingsPage }) },
          { path: 'scanner', lazy: async () => ({ Component: (await import('@/settings/ScannerPage')).ScannerPage }) },
          { path: 'backup', lazy: async () => ({ Component: (await import('@/settings/BackupPage')).BackupPage }) },
          { path: 'accounts', lazy: async () => ({ Component: (await import('@/settings/AccountsPage')).AccountsPage }) },
          { path: 'security', lazy: async () => ({ Component: (await import('@/settings/SecurityPage')).SecurityPage }) },
          ...(
            [
              ['categories', 'category'],
              ['mechanics', 'mechanic'],
            ] as const
          ).map(([path, kind]) => ({
            path,
            lazy: async () => {
              const { MasterDataPage } = await import('@/settings/MasterDataPage')
              return { element: <MasterDataPage key={kind} kind={kind} /> }
            },
          })),
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
