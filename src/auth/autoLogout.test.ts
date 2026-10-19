import { describe, expect, test } from 'vitest'

import { isExpired, autoLogoutMessage } from '@/auth/autoLogout'

const HOUR_MS = 3_600_000

describe('isExpired', () => {
  const start = Date.parse('2026-10-18T08:00:00+07:00')

  test('belum lewat 12 jam sejak aktivitas terakhir', () => {
    expect(isExpired(start, start + 11 * HOUR_MS + 59 * 60_000, 12)).toBe(false)
  })

  test('tepat 12 jam sudah lewat batas', () => {
    expect(isExpired(start, start + 12 * HOUR_MS, 12)).toBe(true)
  })

  test('browser ditutup semalam tetap dihitung dari aktivitas terakhir', () => {
    const tomorrowMorning = Date.parse('2026-10-19T08:30:00+07:00')
    expect(isExpired(start, tomorrowMorning, 12)).toBe(true)
    expect(isExpired(start, tomorrowMorning, 48)).toBe(false)
  })
})

test('pesan logout menyebut durasinya', () => {
  expect(autoLogoutMessage(12)).toBe('Keluar otomatis karena tidak ada aktivitas selama 12 jam.')
})
