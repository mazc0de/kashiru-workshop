import { useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import type { Database } from '@/lib/database.types'
import { describeError, type SupabaseError } from '@/lib/errors'
import { withTimeout } from '@/lib/online'
import { db, withLock, deductOutboxStock, reloadLocalCopy } from '@/lib/localCopy'
import { supabase } from '@/lib/supabase'
import type { ReceiptData } from '@/pos/receipt'

// Antrean nota (PRD 4.13, ADR 0002): setiap nota disimpan dulu di laptop, lalu dikirim lewat RPC
// checkout_sale satu per satu sesuai urutan dibuat. client_id membuat pengiriman ulang aman.
// Stok di salinan lokal sudah dikurangi sejak nota masuk antrean (R25).

export type ArgsCheckout = Database['public']['Functions']['checkout_sale']['Args']

export type OutboxSale = {
  clientId: string
  createdAt: string
  /** Nomor dari laptop yang membuat nota, yang tercetak di struk. */
  number: string
  total: number
  /** Menunggu dikirim, atau gagal karena ditolak server. */
  status: 'pending' | 'failed'
  reason: string | null
  attemptedAt: string | null
  args: ArgsCheckout
  receipt: ReceiptData
  /** Qty part yang keluar, untuk stok di salinan lokal. */
  stockOut: { productId: string; qty: number }[]
}

export type SendResult =
  | { kind: 'sent'; id: string; number: string; originalNumber: string | null }
  | { kind: 'rejected'; reason: string }
  | { kind: 'deferred' }

export type Sender = (n: OutboxSale) => Promise<SendResult>

/** Lama menunggu jawaban server sebelum nota dianggap tersimpan offline (R23). */
export const RESPONSE_TIMEOUT_MS = 10_000
const RETRY_INTERVAL_MS = 30_000
export const LAST_RECEIPT_KEY = 'last_receipt'

/**
 * Nota ditolak kalau server menolak isinya: RAISE EXCEPTION di RPC (P0001), data tidak valid (22xxx),
 * atau constraint (23xxx). Jaringan, server mati, token kedaluwarsa, dan akun pengirim nonaktif (42501)
 * bukan salah notanya, jadi dicoba lagi.
 */
export function isRejectedByServer(errorMessage: SupabaseError): boolean {
  return errorMessage.code === 'P0001' || /^2[23]/.test(errorMessage.code ?? '')
}

/**
 * Batas waktu mencakup juga waktu Supabase Auth memperpanjang token. Sesudah batas, permintaan dibatalkan
 * supaya tidak terkirim belakangan; seandainya tetap sampai, client_id mencegah nota ganda.
 */
async function sendViaRpc(n: OutboxSale): Promise<SendResult> {
  // Browser tahu sedang offline: nota langsung tersimpan offline tanpa menunggu batas waktu.
  if (navigator.onLine === false) return { kind: 'deferred' }
  const abort = new AbortController()
  const send = supabase()
    .rpc('checkout_sale', n.args)
    .abortSignal(abort.signal)
    .then(({ data, error }): SendResult => {
      if (error) return isRejectedByServer(error) ? { kind: 'rejected', reason: describeError(error) } : { kind: 'deferred' }
      const h = data as { id: string; number: string; nomor_asli: string | null }
      return { kind: 'sent', id: h.id, number: h.number, originalNumber: h.nomor_asli }
    })
  const result = await withTimeout(send, RESPONSE_TIMEOUT_MS).catch(() => null)
  if (!result) abort.abort()
  return result ?? { kind: 'deferred' }
}

// Status "Mengirim N nota…" untuk tanda di sidebar (R24).
let sending = false
const listeners = new Set<() => void>()
function setSending(value: boolean) {
  sending = value
  for (const f of listeners) f()
}
function subscribe(f: () => void) {
  listeners.add(f)
  return () => void listeners.delete(f)
}

// Hasil kirim untuk nota yang sedang ditunggu dialog bayar.
const awaited = new Set<string>()
const sendResults = new Map<string, SendResult>()

async function markSent(n: OutboxSale, h: Extract<SendResult, { kind: 'sent' }>) {
  await db.transaction('rw', [db.saleOutbox, db.metadata], async () => {
    await db.saleOutbox.delete(n.clientId)
    if (h.number === n.number) return
    // Nomor diganti server karena sudah terpakai: Cetak ulang memakai nomor yang tercatat.
    const last = await db.metadata.get(LAST_RECEIPT_KEY)
    const receipt = last ? (JSON.parse(last.value) as ReceiptData) : null
    if (receipt?.number === n.number) await db.metadata.put({ key: LAST_RECEIPT_KEY, value: JSON.stringify({ ...receipt, number: h.number }) })
  })
}

async function run(send: Sender): Promise<'empty' | 'deferred'> {
  for (;;) {
    const [n] = await db.saleOutbox.where('status').equals('pending').sortBy('createdAt')
    if (!n) return 'empty'
    const h = await send(n).catch((): SendResult => ({ kind: 'deferred' }))
    if (awaited.has(n.clientId)) sendResults.set(n.clientId, h)
    if (h.kind === 'deferred') return 'deferred'
    if (h.kind === 'sent') await markSent(n, h)
    else await db.saleOutbox.update(n.clientId, { status: 'failed', reason: h.reason, attemptedAt: new Date().toISOString() })
  }
}

let running: Promise<'empty' | 'deferred'> | null = null
let rerun = false

/**
 * Kirim semua nota yang menunggu. Berhenti di kegagalan jaringan pertama ('tertunda') supaya urutan
 * tetap terjaga. Panggilan saat pengiriman sedang berjalan ikut menunggu putaran yang sama.
 */
export function sendOutbox(options: { send?: Sender } = {}): Promise<'empty' | 'deferred'> {
  if (running) {
    rerun = true
    return running
  }
  const send = options.send ?? sendViaRpc
  setSending(true)
  running = (async () => {
    let result: 'empty' | 'deferred'
    do {
      rerun = false
      result = await withLock(() => run(send))
    } while (rerun && result === 'empty')
    return result
  })().finally(() => {
    running = null
    setSending(false)
  })
  return running
}

const timeoutResult = (ms: number) => new Promise<SendResult>((r) => setTimeout(() => r({ kind: 'deferred' }), ms))

/**
 * Bayar (R23): nota masuk antrean bersama pengurangan stok lokal, lalu dikirim. Tanpa jawaban dalam
 * batas waktu = tersimpan offline. Ditolak server = nota dikeluarkan lagi dan stok lokal kembali.
 */
export async function enqueueAndSend(sale: OutboxSale, options: { send?: Sender; timeoutMs?: number } = {}): Promise<SendResult> {
  await db.transaction('rw', [db.saleOutbox, db.products], async () => {
    await db.saleOutbox.add(sale)
    await applyLocalStock(sale.stockOut)
  })
  awaited.add(sale.clientId)
  const result = await Promise.race([
    sendOutbox({ send: options.send }).then((): SendResult => sendResults.get(sale.clientId) ?? { kind: 'deferred' }),
    timeoutResult(options.timeoutMs ?? RESPONSE_TIMEOUT_MS),
  ])
  awaited.delete(sale.clientId)
  sendResults.delete(sale.clientId)
  if (result.kind === 'rejected') {
    await db.transaction('rw', [db.saleOutbox, db.products], async () => {
      await db.saleOutbox.delete(sale.clientId)
      await applyLocalStock(sale.stockOut.map((s) => ({ ...s, qty: -s.qty })))
    })
  }
  return result
}

async function applyLocalStock(stockOut: OutboxSale['stockOut']) {
  const ids = [...new Set(stockOut.map((s) => s.productId))]
  const products = (await db.products.bulkGet(ids)).filter((p) => p !== undefined)
  await db.products.bulkPut(deductOutboxStock(products, [{ stockOut }]))
}

/** Coba lagi nota yang gagal terkirim (PRD 4.13). */
export async function retry(clientId: string, options: { send?: Sender } = {}): Promise<void> {
  await db.saleOutbox.update(clientId, { status: 'pending', reason: null })
  await sendOutbox(options)
}

/** Isi antrean untuk tanda dan bagian Belum terkirim (R24). */
export function useSaleOutbox() {
  const queue = useLiveQuery(() => db.saleOutbox.orderBy('createdAt').toArray(), [], [] as OutboxSale[])
  const isSending = useSyncExternalStore(subscribe, () => sending, () => false)
  return {
    queue,
    pending: queue.filter((n) => n.status === 'pending').length,
    failed: queue.filter((n) => n.status === 'failed').length,
    isSending,
  }
}

/** Nota yang belum atau gagal terkirim; opname memblokir hitungan selama masih ada (PRD 4.5). */
export function useUnsentSaleCount(): number {
  return useLiveQuery(() => db.saleOutbox.count(), [], 0)
}

/**
 * Sinkron saat aplikasi dibuka dan setiap kali kembali online: kirim antrean dulu, lalu muat ulang
 * salinan. Selama masih ada nota menunggu, pengiriman dicoba lagi setiap 30 detik (PRD 4.13).
 */
export function useSync(): void {
  useEffect(() => {
    // Minta browser tidak membersihkan IndexedDB saat ruang penyimpanan menipis (PRD 10).
    void navigator.storage?.persist?.().catch(() => false)
    const sync = async () => {
      if (!navigator.onLine) return
      await sendOutbox().catch(() => undefined)
      await reloadLocalCopy().catch(() => undefined)
    }
    void sync()
    window.addEventListener('online', sync)
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return
      void db.saleOutbox
        .where('status')
        .equals('pending')
        .count()
        .then((n) => (n > 0 ? sendOutbox() : undefined))
        .catch(() => undefined)
    }, RETRY_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', sync)
      window.clearInterval(interval)
    }
  }, [])
}
