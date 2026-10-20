import { useQuery } from '@tanstack/react-query'

import { unwrap } from '@/lib/errors'
import { fetchServerProducts, refreshLocalProduct } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import { diffList, type ProductValues } from '@/products/productForm'

export const PRODUCT_LIST_KEY = ['products', 'all'] as const
export const productDetailKey = (id: string) => ['products', 'detail', id] as const

/** Semua produk termasuk yang nonaktif, untuk layar Produk (butuh online). */
export function useProductList() {
  return useQuery({ queryKey: PRODUCT_LIST_KEY, queryFn: () => fetchServerProducts({ includeInactive: true }) })
}

export type InternalBarcode = {
  id: string
  barcode: string
  productId: string
  name: string
  brand: string | null
  categoryId: string
  category: string
}

const INTERNAL_BARCODE_PAGE = 1000 // batas baris per permintaan di Data API Supabase

/** Barcode internal milik part aktif, untuk layar Label barcode (PRD 4.9). Diurutkan dari angkanya. */
export function useInternalBarcodes() {
  return useQuery({
    queryKey: ['products', 'internal-barcodes'],
    queryFn: async (): Promise<InternalBarcode[]> => {
      const result: InternalBarcode[] = []
      for (let from = 0; ; from += INTERNAL_BARCODE_PAGE) {
        const rows = unwrap(
          await supabase()
            .from('product_barcodes')
            .select('id, barcode, products!inner ( id, nama, merek, aktif, category_id, categories ( nama ) )')
            .eq('jenis', 'internal')
            .eq('products.aktif', true)
            .order('barcode')
            .range(from, from + INTERNAL_BARCODE_PAGE - 1),
        )
        result.push(
          ...rows.map((b) => ({
            id: b.id,
            barcode: b.barcode,
            productId: b.products.id,
            name: b.products.nama,
            brand: b.products.merek,
            categoryId: b.products.category_id,
            category: b.products.categories?.nama ?? '',
          })),
        )
        if (rows.length < INTERNAL_BARCODE_PAGE) break
      }
      // Angka urut bisa beda panjang (999999 lalu 1000000), jadi urutkan sebagai angka.
      return result.sort((a, b) => a.barcode.length - b.barcode.length || a.barcode.localeCompare(b.barcode))
    },
  })
}

export type ProductBarcode = { id?: string; barcode: string; kind: 'pabrik' | 'internal' }
export type ProductPartNumber = { id?: string; code: string; kind: 'oem' | 'alt' }

export type ProductDetail = {
  id: string
  type: 'part' | 'jasa'
  name: string
  brand: string | null
  categoryId: string
  unit: string | null
  allowsFraction: boolean
  sellingPrice: number
  minStock: number
  avgCost: number
  active: boolean
  stock: number | null
  barcodes: ProductBarcode[]
  partNumbers: ProductPartNumber[]
}

export function useProductDetail(id: string | null) {
  return useQuery({
    queryKey: productDetailKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ProductDetail> => {
      const b = unwrap(
        await supabase()
          .from('products')
          .select(
            'id, tipe, nama, merek, category_id, satuan, bisa_pecahan, harga_jual, stok_min, harga_beli_avg, aktif, stock_levels ( qty_on_hand ), product_barcodes ( id, barcode, jenis ), product_part_numbers ( id, kode_part, jenis )',
          )
          .eq('id', id!)
          .single(),
      )
      return {
        id: b.id,
        type: b.tipe === 'jasa' ? 'jasa' : 'part',
        name: b.nama,
        brand: b.merek,
        categoryId: b.category_id,
        unit: b.satuan,
        allowsFraction: b.bisa_pecahan,
        sellingPrice: Number(b.harga_jual),
        minStock: Number(b.stok_min),
        avgCost: Number(b.harga_beli_avg),
        active: b.aktif,
        stock: b.tipe === 'jasa' ? null : Number(b.stock_levels?.qty_on_hand ?? 0),
        barcodes: b.product_barcodes
          .map((x) => ({ id: x.id, barcode: x.barcode, kind: x.jenis === 'internal' ? ('internal' as const) : ('pabrik' as const) }))
          .sort((x, y) => x.barcode.localeCompare(y.barcode)),
        partNumbers: b.product_part_numbers
          .map((x) => ({ id: x.id, code: x.kode_part, kind: x.jenis === 'alt' ? ('alt' as const) : ('oem' as const) }))
          .sort((x, y) => x.code.localeCompare(y.code)),
      }
    },
  })
}

export async function createCategory(name: string): Promise<string> {
  return unwrap(await supabase().from('categories').insert({ nama: name }).select('id').single()).id
}

/** Membuat produk lewat RPC create_product, lalu barcode internal kalau diminta (PRD 4.2, 4.9). */
export async function createProduct(
  value: ProductValues,
  barcodes: string[],
  partNumbers: ProductPartNumber[],
  createInternal: boolean,
): Promise<string> {
  const id = unwrap(
    await supabase().rpc('create_product', {
      p_tipe: value.type,
      p_nama: value.name,
      p_category_id: value.categoryId,
      p_harga_jual: value.sellingPrice,
      p_merek: value.brand ?? undefined,
      p_satuan: value.unit ?? undefined,
      p_bisa_pecahan: value.allowsFraction,
      p_stok_min: value.minStock,
      p_barcodes: barcodes,
      p_kode_part: partNumbers.map((k) => ({ kode_part: k.code, jenis: k.kind })),
      p_stok_awal: value.initialStock ?? undefined,
      p_harga_beli: value.purchasePrice ?? undefined,
    }),
  )
  if (createInternal) unwrap(await supabase().rpc('create_internal_barcode', { p_product_id: id }))
  await refreshLocalProduct(id).catch(() => undefined)
  return id
}

/** Menyimpan perubahan produk lama. Setiap perubahan tercatat di riwayat oleh trigger database. */
export async function saveProductChanges(
  existing: ProductDetail,
  value: ProductValues,
  barcodes: ProductBarcode[],
  partNumbers: ProductPartNumber[],
  createInternal: boolean,
): Promise<void> {
  unwrap(
    await supabase()
      .from('products')
      .update({
        nama: value.name,
        merek: value.brand,
        category_id: value.categoryId,
        satuan: value.unit,
        bisa_pecahan: value.allowsFraction,
        harga_jual: value.sellingPrice,
        stok_min: value.minStock,
      })
      .eq('id', existing.id),
  )

  const barcodeDiff = diffList(existing.barcodes, barcodes, (x) => x.barcode)
  for (const b of barcodeDiff.remove) unwrap(await supabase().from('product_barcodes').delete().eq('id', b.id!))
  if (barcodeDiff.add.length) {
    unwrap(
      await supabase()
        .from('product_barcodes')
        .insert(barcodeDiff.add.map((b) => ({ product_id: existing.id, barcode: b.barcode, jenis: 'pabrik' }))),
    )
  }

  const partNumberDiff = diffList(existing.partNumbers, partNumbers, (x) => `${x.code}|${x.kind}`)
  for (const k of partNumberDiff.remove) unwrap(await supabase().from('product_part_numbers').delete().eq('id', k.id!))
  if (partNumberDiff.add.length) {
    unwrap(
      await supabase()
        .from('product_part_numbers')
        .insert(partNumberDiff.add.map((k) => ({ product_id: existing.id, kode_part: k.code, jenis: k.kind }))),
    )
  }

  if (createInternal) unwrap(await supabase().rpc('create_internal_barcode', { p_product_id: existing.id }))
  await refreshLocalProduct(existing.id).catch(() => undefined)
}

/** "Tautkan ke produk yang ada" untuk barcode yang belum dikenal (PRD 4.8). */
export async function linkBarcode(productId: string, barcode: string): Promise<void> {
  unwrap(await supabase().from('product_barcodes').insert({ product_id: productId, barcode, jenis: 'pabrik' }))
  await refreshLocalProduct(productId).catch(() => undefined)
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  unwrap(await supabase().from('products').update({ aktif: active }).eq('id', id))
  await refreshLocalProduct(id).catch(() => undefined)
}
