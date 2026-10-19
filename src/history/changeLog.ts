import { formatNumber, formatQty } from '@/lib/format'
import { REASON_LABELS, type Reason } from '@/stock/stock'

// Menu Riwayat (PRD 4.12, R35): label aksi, kelompok filter, dan rincian per kolom dari data lama/baru.
// Nama kolom di data mengikuti database; labelnya bahasa Indonesia untuk layar.

export type ChangeEntry = {
  id: number
  createdAt: string
  account: string | null
  action: string
  entity: string
  object: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export const ACTION_LABELS: Record<string, string> = {
  void_nota: 'Void nota',
  void_penerimaan: 'Void penerimaan',
  penyesuaian_stok: 'Penyesuaian stok',
  konfirmasi_opname: 'Konfirmasi opname',
  batalkan_opname: 'Batalkan opname',
  ubah_produk: 'Ubah produk',
  ubah_harga_jual: 'Ubah harga jual',
  nonaktifkan_produk: 'Nonaktifkan produk',
  aktifkan_produk: 'Aktifkan lagi produk',
  tambah_barcode: 'Tambah barcode',
  hapus_barcode: 'Hapus barcode',
  tambah_kode_part: 'Tambah kode part',
  hapus_kode_part: 'Hapus kode part',
  ubah_kategori: 'Ubah kategori',
  nonaktifkan_kategori: 'Nonaktifkan kategori',
  aktifkan_kategori: 'Aktifkan lagi kategori',
  ubah_mekanik: 'Ubah mekanik',
  nonaktifkan_mekanik: 'Nonaktifkan mekanik',
  aktifkan_mekanik: 'Aktifkan lagi mekanik',
  ubah_supplier: 'Ubah supplier',
  nonaktifkan_supplier: 'Nonaktifkan supplier',
  aktifkan_supplier: 'Aktifkan lagi supplier',
  buat_akun: 'Buat akun',
  ubah_nama_akun: 'Ubah nama akun',
  nonaktifkan_akun: 'Nonaktifkan akun',
  aktifkan_akun: 'Aktifkan lagi akun',
  reset_password: 'Password baru',
  ubah_pengaturan: 'Ubah pengaturan',
  ganti_perangkat_kasir: 'Ganti Perangkat Kasir',
}

export type ActionGroup = 'sales' | 'products' | 'partners' | 'accounts' | 'settings'

/** Kelompok jenis aksi untuk filter, mengikuti tabel PRD 4.12. */
export const ACTION_GROUPS: { id: ActionGroup; label: string; actions: string[] }[] = [
  { id: 'sales', label: 'Nota & stok', actions: ['void_nota', 'void_penerimaan', 'penyesuaian_stok', 'konfirmasi_opname', 'batalkan_opname'] },
  {
    id: 'products',
    label: 'Produk',
    actions: [
      'ubah_produk', 'ubah_harga_jual', 'nonaktifkan_produk', 'aktifkan_produk', 'tambah_barcode', 'hapus_barcode', 'tambah_kode_part',
      'hapus_kode_part', 'ubah_kategori', 'nonaktifkan_kategori', 'aktifkan_kategori',
    ],
  },
  {
    id: 'partners',
    label: 'Mekanik & supplier',
    actions: ['ubah_mekanik', 'nonaktifkan_mekanik', 'aktifkan_mekanik', 'ubah_supplier', 'nonaktifkan_supplier', 'aktifkan_supplier'],
  },
  { id: 'accounts', label: 'Akun', actions: ['buat_akun', 'ubah_nama_akun', 'nonaktifkan_akun', 'aktifkan_akun', 'reset_password'] },
  { id: 'settings', label: 'Pengaturan', actions: ['ubah_pengaturan', 'ganti_perangkat_kasir'] },
]

const FIELD_LABELS: Record<string, string> = {
  nama: 'Nama',
  merek: 'Merek',
  category_id: 'Kategori',
  satuan: 'Satuan',
  bisa_pecahan: 'Bisa pecahan',
  harga_jual: 'Harga jual',
  stok_min: 'Stok minimum',
  aktif: 'Status',
  telepon: 'Telepon',
  email: 'Email',
  barcode: 'Barcode',
  kode_part: 'Kode part',
  jenis: 'Jenis',
  nama_bengkel: 'Nama bengkel',
  alamat: 'Alamat',
  footer_struk: 'Catatan bawah struk',
  logo_url: 'Logo',
  awalan_nota: 'Awalan nota',
  awalan_penerimaan: 'Awalan penerimaan',
  awalan_opname: 'Awalan opname',
  ukuran_kertas: 'Ukuran kertas',
  jumlah_salinan: 'Jumlah salinan',
  blind_count: 'Blind count',
  auto_logout_jam: 'Keluar otomatis',
  device_id: 'Perangkat',
  total: 'Total',
  stok: 'Stok',
  qty: 'Qty',
  alasan: 'Alasan',
  keterangan: 'Keterangan',
  part_selisih: 'Part berselisih',
}

/** Kolom yang tidak perlu ditampilkan: kunci teknis, atau sudah tersirat dari aksi dan objeknya. */
const HIDDEN = new Set(['id', 'product_id', 'created_at', 'updated_at', 'nomor', 'status'])

const KIND_LABELS: Record<string, string> = { pabrik: 'Pabrik', internal: 'Internal', oem: 'OEM', alt: 'Alternatif' }

function formatValue(field: string, v: unknown, categories: Map<string, string>): string {
  if (v === null || v === undefined || v === '') return '–'
  switch (field) {
    case 'harga_jual':
    case 'total':
      return `Rp ${formatNumber(Number(v))}`
    case 'aktif':
      return v ? 'Aktif' : 'Nonaktif'
    case 'bisa_pecahan':
    case 'blind_count':
      return v ? 'Ya' : 'Tidak'
    case 'ukuran_kertas':
      return `${v} mm`
    case 'auto_logout_jam':
      return `${v} jam`
    case 'category_id':
      return categories.get(String(v)) ?? 'Kategori lain'
    case 'alasan':
      return REASON_LABELS[v as Reason] ?? String(v)
    case 'jenis':
      return KIND_LABELS[String(v)] ?? String(v)
    case 'logo_url':
      return 'Ada'
    case 'device_id':
      return String(v).slice(0, 8)
    case 'stok':
    case 'qty':
    case 'stok_min':
      return formatQty(Number(v))
    default:
      return String(v)
  }
}

/** Rincian per kolom: "Label: lama → baru", atau "Label: nilai" kalau hanya ada satu sisi. */
export function describeChanges(e: Pick<ChangeEntry, 'action' | 'before' | 'after'>, categories: Map<string, string> = new Map()): string[] {
  const before = e.before ?? {}
  const after = e.after ?? {}
  // Status aktif sudah tersirat dari aksi nonaktifkan/aktifkan.
  const hidden = new Set(HIDDEN)
  if (/^(non)?aktifkan_/.test(e.action)) hidden.add('aktif')
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => !hidden.has(f))
  return fields.map((f) => {
    const label = FIELD_LABELS[f] ?? f
    const hasBefore = e.before !== null && f in before
    const hasAfter = e.after !== null && f in after
    if (hasBefore && hasAfter) return `${label}: ${formatValue(f, before[f], categories)} → ${formatValue(f, after[f], categories)}`
    return `${label}: ${formatValue(f, hasAfter ? after[f] : before[f], categories)}`
  })
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ')
}
