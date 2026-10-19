import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'

import { db } from '@/lib/localCopy'
import { enqueueAndSend, retry, isRejectedByServer, sendOutbox, type SendResult, type OutboxSale } from '@/pos/outbox'
import type { LocalProduct } from '@/products/product'

function sale(clientId: string, createdAt: string, stockOut: OutboxSale['stockOut'] = []): OutboxSale {
  return {
    clientId,
    createdAt,
    number: `KSR-20261019-${clientId}`,
    total: 10000,
    status: 'pending',
    reason: null,
    attemptedAt: null,
    args: {} as OutboxSale['args'],
    receipt: { number: `KSR-20261019-${clientId}`, plate: null, customer: null } as OutboxSale['receipt'],
    stockOut,
  }
}

const PART: LocalProduct = {
  id: 'oli',
  type: 'part',
  name: 'Oli MPX',
  brand: null,
  categoryId: 'k',
  category: 'Oli',
  unit: 'btl',
  allowsFraction: false,
  sellingPrice: 52000,
  stock: 5,
  minStock: 0,
  avgCost: 40000,
  barcodes: [],
  partNumbers: [],
  active: true,
}

const oilStock = async () => (await db.products.get('oli'))?.stock
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(async () => {
  await db.saleOutbox.clear()
  await db.products.clear()
  await db.metadata.clear()
})

test('nota ditolak hanya untuk galat validasi dari server; jaringan dan akun dicoba lagi', () => {
  expect(isRejectedByServer({ code: 'P0001', message: 'Total nota tidak cocok' })).toBe(true)
  expect(isRejectedByServer({ code: '23505', message: 'duplicate key' })).toBe(true)
  expect(isRejectedByServer({ code: '22P02', message: 'invalid input' })).toBe(true)
  expect(isRejectedByServer({ code: '42501', message: 'Akun belum login atau sudah nonaktif' })).toBe(false)
  expect(isRejectedByServer({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
  expect(isRejectedByServer({ code: '', message: 'TypeError: Failed to fetch' })).toBe(false)
})

describe('sendOutbox', () => {
  test('mengirim sesuai urutan dibuat; yang ditolak menjadi gagal beserta alasannya, sisanya tetap dikirim', async () => {
    // client_id acak, jadi urutan kunci (a, m, x) sengaja berlawanan dengan urutan dibuat.
    await db.saleOutbox.bulkAdd([sale('a', '2026-10-19T03:03:00Z'), sale('m', '2026-10-19T03:02:00Z'), sale('x', '2026-10-19T03:01:00Z')])
    const sent: string[] = []
    const result = await sendOutbox({
      send: async (n): Promise<SendResult> => {
        sent.push(n.clientId)
        return n.clientId === 'm' ? { kind: 'rejected', reason: 'Total nota tidak cocok' } : { kind: 'sent', id: n.clientId, number: n.number, originalNumber: null }
      },
    })
    expect(result).toBe('empty')
    expect(sent).toEqual(['x', 'm', 'a'])
    const remaining = await db.saleOutbox.toArray()
    expect(remaining.map((n) => [n.clientId, n.status, n.reason])).toEqual([['m', 'failed', 'Total nota tidak cocok']])
  })

  test('berhenti saat jaringan putus; nota berikutnya tetap menunggu', async () => {
    await db.saleOutbox.bulkAdd([sale('a', '2026-10-19T03:01:00Z'), sale('b', '2026-10-19T03:02:00Z'), sale('c', '2026-10-19T03:03:00Z')])
    const sent: string[] = []
    const result = await sendOutbox({
      send: async (n): Promise<SendResult> => {
        sent.push(n.clientId)
        return n.clientId === 'a' ? { kind: 'sent', id: 'a', number: n.number, originalNumber: null } : { kind: 'deferred' }
      },
    })
    expect(result).toBe('deferred')
    expect(sent).toEqual(['a', 'b'])
    expect((await db.saleOutbox.orderBy('createdAt').toArray()).map((n) => [n.clientId, n.status])).toEqual([
      ['b', 'pending'],
      ['c', 'pending'],
    ])
  })

  test('nomor yang diganti server ikut memperbarui struk nota terakhir untuk cetak ulang', async () => {
    const a = sale('a', '2026-10-19T03:01:00Z')
    await db.saleOutbox.add(a)
    await db.metadata.put({ key: 'last_receipt', value: JSON.stringify(a.receipt) })
    await sendOutbox({ send: async () => ({ kind: 'sent', id: 'a', number: 'KSR-20261019-0009', originalNumber: a.number }) })
    expect(JSON.parse((await db.metadata.get('last_receipt'))!.value).number).toBe('KSR-20261019-0009')
  })
})

describe('antrekanDanKirim (R23, R25)', () => {
  test('terkirim: keluar dari antrean, stok lokal berkurang sekali', async () => {
    await db.products.put(PART)
    const result = await enqueueAndSend(sale('a', '2026-10-19T03:01:00Z', [{ productId: 'oli', qty: 2 }]), {
      send: async (n) => ({ kind: 'sent', id: 'a', number: n.number, originalNumber: null }),
    })
    expect(result.kind).toBe('sent')
    expect(await db.saleOutbox.count()).toBe(0)
    expect(await oilStock()).toBe(3)
  })

  test('ditolak saat online: nota tidak tersimpan dan stok lokal kembali', async () => {
    await db.products.put(PART)
    const result = await enqueueAndSend(sale('a', '2026-10-19T03:01:00Z', [{ productId: 'oli', qty: 2 }]), {
      send: async () => ({ kind: 'rejected', reason: 'Mekanik tidak dikenal' }),
    })
    expect(result).toEqual({ kind: 'rejected', reason: 'Mekanik tidak dikenal' })
    expect(await db.saleOutbox.count()).toBe(0)
    expect(await oilStock()).toBe(5)
  })

  test('server tidak menjawab dalam batas waktu: tersimpan offline, tetap di antrean, stok lokal berkurang', async () => {
    await db.products.put(PART)
    const send = async (): Promise<SendResult> => {
      await sleep(60)
      return { kind: 'deferred' }
    }
    const result = await enqueueAndSend(sale('a', '2026-10-19T03:01:00Z', [{ productId: 'oli', qty: 2 }]), { send, timeoutMs: 20 })
    expect(result).toEqual({ kind: 'deferred' })
    expect((await db.saleOutbox.toArray()).map((n) => n.status)).toEqual(['pending'])
    expect(await oilStock()).toBe(3)
    await sendOutbox({ send })
  })
})

test('Coba lagi mengirim ulang nota gagal', async () => {
  await db.saleOutbox.add({ ...sale('a', '2026-10-19T03:01:00Z'), status: 'failed', reason: 'Mekanik tidak dikenal' })
  await retry('a', { send: async (n) => ({ kind: 'sent', id: 'a', number: n.number, originalNumber: null }) })
  expect(await db.saleOutbox.count()).toBe(0)
})
