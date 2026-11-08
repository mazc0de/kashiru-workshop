import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'

import { clearLocalData, hasUnsentSales } from '@/auth/clearLocalData'
import { db } from '@/lib/localCopy'
import { useCart } from '@/pos/cartStore'
import type { OutboxSale } from '@/pos/outbox'

const values = new Map<string, string>()
const storage = {
  getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => void values.set(k, v),
  removeItem: (k: string) => void values.delete(k),
  clear: () => values.clear(),
  key: (i: number) => [...values.keys()][i] ?? null,
  get length() {
    return values.size
  },
}
// Object.keys(localStorage) di browser berisi kunci yang tersimpan.
const localStorageProxy = new Proxy(storage, { ownKeys: () => [...values.keys()], getOwnPropertyDescriptor: (_, k) => (values.has(String(k)) ? { enumerable: true, configurable: true, value: values.get(String(k)) } : undefined) })
Object.defineProperty(globalThis, 'localStorage', { value: localStorageProxy, configurable: true })

beforeEach(async () => {
  values.clear()
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('logout menghapus keranjang, salinan, dan isian di laptop; identitas laptop, huruf struk, dan antrean nota tetap', async () => {
  useCart.setState({ saved: [{ ...useCart.getState().draft, id: 'a', createdAt: 'x' }] })
  for (const k of ['kashiru.cart', 'kashiru.profile', 'kashiru.settings', 'kashiru.logo', 'kashiru.saleSequence', 'kashiru.receiptFont']) values.set(k, '{}')
  values.set('lain', '1')
  await db.products.put({ id: 'p' } as never)
  await db.mechanics.put({ id: 'm', name: 'Budi' })
  await db.plates.put({ key: 'B1', plate: 'B 1', customer: null })
  await db.metadata.bulkPut([
    { key: 'device_id', value: 'd' },
    { key: 'last_receipt', value: '{}' },
    { key: 'loaded_at', value: 'x' },
  ])
  await db.saleOutbox.put({ clientId: 'c' } as OutboxSale)

  await clearLocalData()

  expect(useCart.getState().saved).toEqual([])
  expect([...values.keys()].sort()).toEqual(['kashiru.receiptFont', 'kashiru.saleSequence', 'lain'])
  expect(await db.products.count()).toBe(0)
  expect(await db.mechanics.count()).toBe(0)
  expect(await db.plates.count()).toBe(0)
  expect((await db.metadata.toArray()).map((m) => m.key)).toEqual(['device_id'])
  expect(await hasUnsentSales()).toBe(true)
})
