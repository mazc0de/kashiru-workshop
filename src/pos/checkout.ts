import { db, type LocalMechanic } from '@/lib/localCopy'
import { readStored, writeStored } from '@/lib/localStore'
import type { Settings } from '@/lib/settings'
import { withTimeout } from '@/lib/online'
import { supabase } from '@/lib/supabase'
import { calculatePayment, calculateSale, type PaymentMethod } from '@/pos/calculate'
import { toCalcLines, type Cart } from '@/pos/cart'
import { getDeviceId } from '@/pos/deviceId'
import { enqueueAndSend, LAST_RECEIPT_KEY, type ArgsCheckout, type OutboxSale } from '@/pos/outbox'
import { formatPlate, plateKey } from '@/pos/plate'
import type { ReceiptData } from '@/pos/receipt'
import { formatSaleNumber, wibDate, nextSequence, type StoredSequence } from '@/pos/saleNumber'

// Bayar: nota tersimpan, stok terpotong, struk tercetak (PRD 4.6). Nomor nota dibuat laptop yang membayar
// (PRD 7.5). Satu percobaan bayar memakai client_id dan nomor urut yang sama walaupun dikirim ulang,
// sehingga nota tidak pernah tercatat dua kali. Nota selalu lewat antrean di laptop (R23).

const SEQUENCE_KEY = 'kashiru.saleSequence'
/** Pencocokan nomor urut dengan server tidak boleh menahan dialog bayar saat internet lambat. */
const SEQUENCE_CHECK_TIMEOUT_MS = 3_000

export type Attempt = { clientId: string; sequence: number; createdAt: string }

/** Ambil nomor urut berikutnya hari ini; saat online dicocokkan dengan nomor terakhir di server. */
export async function prepareAttempt(): Promise<Attempt> {
  const now = new Date()
  const date = wibDate(now)
  let serverLast: number | null = null
  if (navigator.onLine) {
    const result = await withTimeout(
      supabase()
        .rpc('get_last_sale_urut', { p_tanggal: date })
        .then(
          (h) => h,
          () => null,
        ),
      SEQUENCE_CHECK_TIMEOUT_MS,
    )
    serverLast = typeof result?.data === 'number' ? result.data : null
  }
  const sequence = nextSequence(readStored<StoredSequence>(SEQUENCE_KEY), date, serverLast)
  writeStored(SEQUENCE_KEY, { date, last: sequence })
  return { clientId: crypto.randomUUID(), sequence, createdAt: now.toISOString() }
}

/** offline = belum terkirim (offline atau server tidak menjawab dalam 10 detik), dikirim otomatis nanti. */
export type PaymentResult = { number: string; originalNumber: string | null; receipt: ReceiptData; offline: boolean }

/** Nopol baku, nama pelanggan dan catatan servis yang sudah dirapikan; kosong menjadi null. */
function saleInfo(k: Cart) {
  return {
    plate: k.data.plate.trim() ? formatPlate(k.data.plate) : null,
    customer: k.data.customer.trim().replace(/\s+/g, ' ') || null,
    note: k.data.serviceNote.trim() || null,
  }
}

/** Argumen RPC checkout_sale dari keranjang. Kunci JSON di p_items mengikuti fungsi SQL, bukan nama di kode. */
export function buildCheckoutArgs(o: {
  cart: Cart
  total: number
  method: PaymentMethod
  cash: number
  attempt: Attempt
  creatorId: string
  prefix: string
  deviceId: string
}): ArgsCheckout {
  const k = o.cart
  const { plate, customer, note } = saleInfo(k)
  return {
    p_client_id: o.attempt.clientId,
    p_device_id: o.deviceId,
    p_user_id: o.creatorId,
    p_awalan: o.prefix,
    p_urut: o.attempt.sequence,
    p_dibuat_pada: o.attempt.createdAt,
    p_items: k.lines.map((b) => ({
      product_id: b.productId,
      // Jasa manual tidak punya produk; namanya dikirim apa adanya.
      ...(b.productId === null && { nama: b.name }),
      qty: b.qty,
      harga: b.price,
      diskon_jenis: b.discount?.kind ?? null,
      diskon_input: b.discount?.input ?? null,
    })),
    p_metode_bayar: o.method,
    p_total: o.total,
    p_uang_diterima: o.method === 'tunai' ? o.cash : undefined,
    p_diskon_nota_jenis: k.saleDiscount?.kind,
    p_diskon_nota_input: k.saleDiscount?.input,
    p_nopol: plate ?? undefined,
    p_nama_pelanggan: customer ?? undefined,
    p_mechanic_id: k.data.mechanicId ?? undefined,
    p_catatan_servis: note ?? undefined,
  }
}

export async function paySale(options: {
  cart: Cart
  method: PaymentMethod
  cashReceived: number | null
  attempt: Attempt
  creator: { id: string; name: string }
  settings: Settings
  mechanic: LocalMechanic | null
}): Promise<PaymentResult> {
  const { cart: k, attempt, settings } = options
  const calc = calculateSale(toCalcLines(k), k.saleDiscount)
  if (calc.errorText) throw new Error(calc.errorText)
  const payment = calculatePayment(options.method, calc.total, options.cashReceived)
  if (!payment) throw new Error('Uang diterima kurang dari total')

  const { plate, customer, note } = saleInfo(k)
  const args = buildCheckoutArgs({
    cart: k,
    total: calc.total,
    method: options.method,
    cash: payment.cash,
    attempt,
    creatorId: options.creator.id,
    prefix: settings.awalan_nota,
    deviceId: await getDeviceId(),
  })

  const receipt: ReceiptData = {
    workshop: { name: settings.nama_bengkel, address: settings.alamat, phone: settings.telepon, footer: settings.footer_struk },
    number: previewNumber(settings.awalan_nota, attempt),
    time: attempt.createdAt,
    cashier: options.creator.name,
    plate,
    customer,
    mechanic: options.mechanic?.name ?? null,
    serviceNote: note,
    lines: k.lines.map((b, i) => ({
      type: b.type,
      name: b.name,
      brand: b.brand,
      qty: b.qty,
      price: b.price,
      amount: calc.lines[i].amount,
      discount: calc.lines[i].discount,
    })),
    subtotal: calc.subtotal,
    saleDiscount: calc.saleDiscount,
    total: calc.total,
    method: options.method,
    cash: payment.cash,
    change: payment.change,
    isCopy: false,
    void: false,
  }

  const sale: OutboxSale = {
    clientId: attempt.clientId,
    createdAt: attempt.createdAt,
    number: receipt.number,
    total: calc.total,
    status: 'pending',
    reason: null,
    attemptedAt: null,
    args,
    receipt,
    stockOut: k.lines.flatMap((b) => (b.type === 'part' && b.productId ? [{ productId: b.productId, qty: b.qty }] : [])),
  }
  const result = await enqueueAndSend(sale)
  // Ditolak server saat online: alasan tampil di dialog bayar, keranjang tetap utuh (R23).
  if (result.kind === 'rejected') throw new Error(result.reason)

  const finalReceipt: ReceiptData = result.kind === 'sent' ? { ...receipt, number: result.number } : receipt
  // Nopol tercatat untuk isian otomatis berikutnya; struk disimpan untuk F12 cetak ulang.
  await db.transaction('rw', [db.plates, db.metadata], async () => {
    if (plate) await db.plates.put({ key: plateKey(plate), plate, customer })
    await db.metadata.put({ key: LAST_RECEIPT_KEY, value: JSON.stringify(finalReceipt) })
  })

  return { number: finalReceipt.number, originalNumber: result.kind === 'sent' ? result.originalNumber : null, receipt: finalReceipt, offline: result.kind === 'deferred' }
}

/** Struk nota terakhir di perangkat ini, untuk F12 cetak ulang. */
export async function lastReceipt(): Promise<ReceiptData | null> {
  const save = await db.metadata.get(LAST_RECEIPT_KEY)
  return save ? (JSON.parse(save.value) as ReceiptData) : null
}

/** Nomor nota yang akan dipakai, untuk ditampilkan sebelum dikirim. */
export function previewNumber(prefix: string, attempt: Attempt): string {
  return formatSaleNumber(prefix, wibDate(new Date(attempt.createdAt)), attempt.sequence)
}
