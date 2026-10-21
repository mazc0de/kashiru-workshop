import { parseQty, parseRupiah } from '@/lib/format'
import type { ProductType } from '@/products/product'

// Aturan isian form produk (PRD 4.2), terpisah dari tampilan supaya bisa diuji.

/** Nilai mentah form: angka masih berupa teks seperti diketik kasir ("45.000", "1,5"). */
export type FormFields = {
  type: ProductType
  name: string
  brand: string
  categoryId: string
  unit: string
  allowsFraction: boolean
  sellingPrice: string
  minStock: string
  initialStock: string
  /** Kode Harga Beli (R64): huruf yang artinya hanya diketahui pemilik. */
  purchaseCode: string
}

export type ProductValues = {
  type: ProductType
  name: string
  brand: string | null
  categoryId: string
  unit: string | null
  allowsFraction: boolean
  sellingPrice: number
  minStock: number
  initialStock: number | null
  /** null = part belum punya kode harga, atau jasa. */
  purchaseCode: string | null
}

export type FormErrors = Partial<Record<keyof FormFields, string>>

/** Pilihan satuan part di form produk. Satuan per takaran (liter, meter, kg, gram) biasanya dipakai bersama "Bisa pecahan". */
export const COMMON_UNITS = ['pcs', 'set', 'pasang', 'botol', 'kaleng', 'tube', 'liter', 'meter', 'roll', 'lembar', 'kg', 'gram', 'pak', 'dus']

/** Pilihan satuan untuk isian; satuan lama di luar daftar tetap ditampilkan supaya tidak berubah saat diedit. */
export function unitOptions(current: string): string[] {
  const value = current.trim()
  return value && !COMMON_UNITS.includes(value) ? [...COMMON_UNITS, value] : COMMON_UNITS
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Kode Harga Beli (R64): spasi di tepi dibuang dan huruf dijadikan kapital, tanpa batas panjang. */
export function tidyPurchaseCode(text: string): string {
  return text.trim().toUpperCase()
}

/** Pesan kalau kode harga berisi selain huruf A–Z; null kalau valid atau kosong. */
export function purchaseCodeError(text: string): string | null {
  const code = tidyPurchaseCode(text)
  if (/^[A-Z]*$/.test(code)) return null
  return /\d/.test(code) ? 'Isi dengan kode harga (huruf), bukan angka.' : 'Kode harga hanya boleh huruf A–Z, tanpa spasi atau tanda baca.'
}

/** Memeriksa isian dan mengubahnya menjadi angka. `baru` = part/jasa sedang dibuat (stok awal hanya saat itu). */
export function validateProduct(values: FormFields, isNew: boolean): { ok: true; value: ProductValues } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {}
  const part = values.type === 'part'
  const fractional = part && values.allowsFraction

  const name = tidy(values.name)
  if (!name) errors.name = 'Nama wajib diisi'
  if (!values.categoryId) errors.categoryId = 'Kategori wajib dipilih'

  const sellingPrice = parseRupiah(values.sellingPrice)
  if (sellingPrice === null) errors.sellingPrice = part ? 'Isi harga jual dalam rupiah' : 'Isi tarif dalam rupiah, boleh 0'
  else if (part && sellingPrice <= 0) errors.sellingPrice = 'Harga jual part wajib lebih dari Rp 0'

  let minStock = 0
  if (part && values.minStock.trim()) {
    const v = parseQty(values.minStock)
    if (v === null) errors.minStock = 'Isi angka, paling banyak 2 angka di belakang koma'
    else if (!fractional && !Number.isInteger(v)) errors.minStock = 'Stok minimum harus bilangan bulat'
    else minStock = v
  }

  let initialStock: number | null = null
  if (part && isNew && values.initialStock.trim()) {
    const v = parseQty(values.initialStock)
    if (v === null) errors.initialStock = 'Isi angka, paling banyak 2 angka di belakang koma'
    else if (!fractional && !Number.isInteger(v)) errors.initialStock = 'Stok awal harus bilangan bulat'
    else if (v > 0) initialStock = v
  }

  // Kode harga opsional (R64); stok awal tidak lagi wajib disertai harga beli.
  const codeError = part ? purchaseCodeError(values.purchaseCode) : null
  if (codeError) errors.purchaseCode = codeError

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      type: values.type,
      name,
      brand: part ? tidy(values.brand) || null : null,
      categoryId: values.categoryId,
      unit: part ? tidy(values.unit) || 'pcs' : null,
      allowsFraction: fractional,
      sellingPrice: sellingPrice!,
      minStock,
      initialStock,
      purchaseCode: part ? tidyPurchaseCode(values.purchaseCode) || null : null,
    },
  }
}

/** Isi form dari produk yang sudah ada. */
export function fieldsFromProduct(p: {
  type: ProductType
  name: string
  brand: string | null
  categoryId: string
  unit: string | null
  allowsFraction: boolean
  sellingPrice: number
  minStock: number
  purchaseCode: string | null
}): FormFields {
  const parsed = (n: number) => String(n).replace('.', ',')
  return {
    type: p.type,
    name: p.name,
    brand: p.brand ?? '',
    categoryId: p.categoryId,
    unit: p.unit ?? '',
    allowsFraction: p.allowsFraction,
    sellingPrice: new Intl.NumberFormat('id-ID').format(p.sellingPrice),
    minStock: p.minStock ? parsed(p.minStock) : '',
    initialStock: '',
    purchaseCode: p.purchaseCode ?? '',
  }
}

export const EMPTY_FIELDS: FormFields = {
  type: 'part',
  name: '',
  brand: '',
  categoryId: '',
  unit: 'pcs',
  allowsFraction: false,
  sellingPrice: '',
  minStock: '',
  initialStock: '',
  purchaseCode: '',
}

/** Bagian daftar yang ditambah dan dihapus, untuk menyimpan perubahan barcode dan kode part. */
export function diffList<T>(before: T[], after: T[], key: (x: T) => string): { add: T[]; remove: T[] } {
  const oldKey = new Set(before.map(key))
  const newKey = new Set(after.map(key))
  return {
    add: after.filter((x) => !oldKey.has(key(x))),
    remove: before.filter((x) => !newKey.has(key(x))),
  }
}
