// Paritas hitungan nota: laptop kasir (TypeScript) dan checkout_sale (SQL) harus menghasilkan
// angka yang sama, karena server menolak nota yang totalnya berbeda.
import { afterAll, beforeAll, expect, test } from 'vitest'

// @ts-expect-error modul JS uji database tanpa deklarasi tipe
import { ACCOUNTS, createSnapshot, freshDb, rpc } from '../../supabase/tests/harness.mjs'
import { calculateSale, type CalcLine, type Discount } from '@/pos/calculate'
import { EMPTY_CART, addManualService, type Cart } from '@/pos/cart'
import { buildCheckoutArgs } from '@/pos/checkout'

type Db = Awaited<ReturnType<typeof freshDb>>
let db: Db

const DEVICE = '33333333-3333-3333-3333-333333333333'

// Pembangkit acak dengan seed tetap supaya kegagalan bisa diulang.
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

beforeAll(async () => {
  await createSnapshot()
  db = await freshDb()
  const cat = (await db.query(`insert into categories (nama) values ('Uji') returning id`)).rows[0] as { id: string }
  for (const [name, fractional] of [['Part A', false], ['Part B', true]] as const) {
    await rpc(db, ACCOUNTS.owner, 'create_product', {
      p_tipe: 'part', p_nama: name, p_category_id: cat.id, p_harga_jual: 1000, p_bisa_pecahan: fractional,
    })
  }
  await rpc(db, ACCOUNTS.owner, 'create_product', { p_tipe: 'jasa', p_nama: 'Jasa C', p_category_id: cat.id, p_harga_jual: 0 })
  await rpc(db, ACCOUNTS.owner, 'register_cashier_device', { p_device_id: DEVICE })
}, 60_000)

afterAll(async () => {
  await db?.close()
})

test('60 keranjang acak: total dan alokasi diskon sama di perangkat dan server', async () => {
  const products = (await db.query(`select id, nama, bisa_pecahan, tipe from products order by nama`)).rows as {
    id: string
    nama: string
    bisa_pecahan: boolean
    tipe: string
  }[]
  const r = random(20261019)
  const price = () => [500, 1000, 12750, 45250, 52000, 99999, 1][Math.floor(r() * 7)]
  const randomDiscount = (): Discount => {
    const x = r()
    if (x < 0.5) return null
    if (x < 0.75) return { kind: 'nominal', input: Math.floor(r() * 3000) }
    return { kind: 'persen', input: Math.round(r() * 10000) / 100 }
  }

  let sent = 0
  for (let n = 0; n < 60; n++) {
    const lines: (CalcLine & { productId: string })[] = []
    const lineCount = 1 + Math.floor(r() * 4)
    for (let i = 0; i < lineCount; i++) {
      const p = products[Math.floor(r() * products.length)]
      const qty = p.bisa_pecahan ? Math.round((0.01 + r() * 5) * 100) / 100 : 1 + Math.floor(r() * 3)
      lines.push({ productId: p.id, qty, price: price(), discount: randomDiscount() })
    }
    const saleDiscount = randomDiscount()
    const result = calculateSale(lines, saleDiscount)
    if (result.errorText) continue // nota yang tidak bisa dibayar di perangkat juga tidak dikirim
    sent++

    // Payload yang sama persis dengan yang dikirim layar Kasir (PostgREST tidak mengirim nilai undefined).
    const cart: Cart = {
      ...EMPTY_CART,
      lines: lines.map((l, i) => ({
        key: String(i), productId: l.productId, type: 'part', name: '', brand: null, unit: null, allowsFraction: true,
        qty: l.qty, price: l.price, manualPrice: false, discount: l.discount, oldPrice: null, inactive: false,
      })),
      saleDiscount,
    }
    const args = buildCheckoutArgs({
      cart, total: result.total, method: 'qris', cash: result.total, creatorId: ACCOUNTS.cashier, prefix: 'KSR', deviceId: DEVICE,
      attempt: { clientId: crypto.randomUUID(), sequence: n + 1, createdAt: new Date().toISOString() },
    })
    const sale = (await rpc(db, ACCOUNTS.cashier, 'checkout_sale', Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)))) as {
      id: string
      total: number
    }

    expect(sale.total).toBe(result.total)
    const server = (await db.query(`select jumlah, diskon, alokasi_diskon_nota from sale_items where sale_id = $1 order by urutan`, [sale.id]))
      .rows as { jumlah: string; diskon: string; alokasi_diskon_nota: string }[]
    expect(server.map((s) => [Number(s.jumlah), Number(s.diskon), Number(s.alokasi_diskon_nota)])).toEqual(
      result.lines.map((b) => [b.amount, b.discount, b.saleDiscountShare]),
    )
  }
  expect(sent).toBeGreaterThan(40)
}, 60_000)

test('jasa manual dari keranjang diterima server sebagai baris nota tanpa produk', async () => {
  const cart = addManualService({ ...EMPTY_CART }, 'Las knalpot', 25000, 'm1')!
  const result = calculateSale(cart.lines, null)
  const args = buildCheckoutArgs({
    cart, total: result.total, method: 'qris', cash: result.total, creatorId: ACCOUNTS.cashier, prefix: 'KSR', deviceId: DEVICE,
    attempt: { clientId: crypto.randomUUID(), sequence: 900, createdAt: new Date().toISOString() },
  })
  const sale = (await rpc(db, ACCOUNTS.cashier, 'checkout_sale', Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)))) as { id: string }
  const rows = (await db.query(`select product_id, nama_snapshot, tipe, jumlah from sale_items where sale_id = $1`, [sale.id])).rows
  expect(rows).toEqual([{ product_id: null, nama_snapshot: 'Las knalpot', tipe: 'jasa', jumlah: 25000 }])
}, 60_000)
