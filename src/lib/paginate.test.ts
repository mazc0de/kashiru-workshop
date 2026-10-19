import { expect, test } from 'vitest'

import { paginate } from '@/lib/paginate'

const items = Array.from({ length: 120 }, (_, i) => i + 1)

test('membagi daftar per halaman dengan nomor baris dari-sampai', () => {
  expect(paginate(items, 1, 50)).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 50, total: 120 })
  const last = paginate(items, 3, 50)
  expect([last.rows[0], last.rows.at(-1), last.from, last.to]).toEqual([101, 120, 101, 120])
})

test('halaman di luar batas dikembalikan ke batasnya, daftar kosong tetap satu halaman', () => {
  expect(paginate(items, 9, 50).page).toBe(3)
  expect(paginate(items, 0, 50).page).toBe(1)
  expect(paginate([], 2, 50)).toEqual({ rows: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 })
})
