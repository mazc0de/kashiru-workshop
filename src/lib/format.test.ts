import { describe, expect, test } from 'vitest'

import { readEnv } from '@/lib/env'
import { formatNumber, formatQty, formatRupiah, formatDate, formatDateTime, parseQty, parseRupiah } from '@/lib/format'

describe('formatRupiah', () => {
  test('mengikuti contoh struk PRD 4.10', () => {
    expect(formatRupiah(125000)).toBe('Rp 125.000')
    expect(formatRupiah(150000)).toBe('Rp 150.000')
    expect(formatRupiah(0)).toBe('Rp 0')
  })

  test('nilai negatif memakai tanda minus di depan', () => {
    expect(formatRupiah(-5000)).toBe('-Rp 5.000')
  })

  test('HPP berdesimal dibulatkan ke rupiah terdekat, 0,5 ke atas', () => {
    expect(formatRupiah(41538.46)).toBe('Rp 41.538')
    expect(formatRupiah(4207.5)).toBe('Rp 4.208')
    expect(formatRupiah(-0.4)).toBe('Rp 0')
  })
})

describe('formatNumber', () => {
  test('pemisah ribuan titik, tanpa Rp', () => {
    expect(formatNumber(45000)).toBe('45.000')
    expect(formatNumber(1250000)).toBe('1.250.000')
    expect(formatNumber(-2000)).toBe('-2.000')
  })
})

describe('formatQty', () => {
  test('koma desimal tanpa nol di belakang (PRD 4.2)', () => {
    expect(formatQty(0.8)).toBe('0,8')
    expect(formatQty(1.5)).toBe('1,5')
    expect(formatQty(2.3)).toBe('2,3')
    expect(formatQty(2)).toBe('2')
    expect(formatQty(0.33)).toBe('0,33')
    expect(formatQty(-1.5)).toBe('-1,5')
  })
})

describe('tanggal dan jam WIB', () => {
  test('DD/MM/YYYY dan HH:MM menurut Asia/Jakarta', () => {
    // 07:32 UTC = 14:32 WIB
    expect(formatDate('2026-10-18T07:32:00Z')).toBe('18/10/2026')
    expect(formatDateTime('2026-10-18T07:32:00Z')).toBe('18/10/2026 14:32')
  })

  test('lewat tengah malam UTC sudah hari berikutnya di WIB', () => {
    expect(formatDate('2026-10-18T17:05:00Z')).toBe('19/10/2026')
    expect(formatDateTime('2026-10-18T17:05:00Z')).toBe('19/10/2026 00:05')
  })
})

describe('readEnv', () => {
  test('menerima URL dan publishable key', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toEqual({
      ok: true,
      url: 'https://abc.supabase.co',
      key: 'sb_publishable_x',
    })
  })

  test('menyebut variabel yang belum diisi', () => {
    expect(readEnv({ VITE_SUPABASE_URL: 'bukan url' })).toEqual({
      ok: false,
      short: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })
})

describe('parseRupiah', () => {
  test('menerima titik ribuan, spasi, dan awalan Rp', () => {
    expect(parseRupiah('45.000')).toBe(45000)
    expect(parseRupiah('45000')).toBe(45000)
    expect(parseRupiah(' Rp 1.250.000 ')).toBe(1250000)
    expect(parseRupiah('0')).toBe(0)
  })

  test('menolak desimal, minus, dan teks', () => {
    expect(parseRupiah('45.000,50')).toBeNull()
    expect(parseRupiah('-5000')).toBeNull()
    expect(parseRupiah('')).toBeNull()
    expect(parseRupiah('empat puluh')).toBeNull()
  })
})

describe('parseQty', () => {
  test('koma atau titik desimal, maksimal 2 angka', () => {
    expect(parseQty('1,5')).toBe(1.5)
    expect(parseQty('0.25')).toBe(0.25)
    expect(parseQty('2')).toBe(2)
  })

  test('menolak 3 desimal, minus, dan kosong', () => {
    expect(parseQty('1,555')).toBeNull()
    expect(parseQty('-1')).toBeNull()
    expect(parseQty('')).toBeNull()
    expect(parseQty('1,5,0')).toBeNull()
  })
})
