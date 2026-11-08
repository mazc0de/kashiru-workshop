import { describe, expect, test } from 'vitest'
import { ditherToMonochrome, thresholdToMonochrome } from '@/lib/printBitmap'

const pixels = (...grays: number[]) => new Uint8ClampedArray(grays.flatMap((g) => [g, g, g, 255]))
const grays = (rgba: Uint8ClampedArray) => Array.from({ length: rgba.length / 4 }, (_, p) => rgba[p * 4])

describe('thresholdToMonochrome', () => {
  test('tepi huruf abu-abu dengan tinta 25% atau lebih menjadi hitam, sisanya putih', () => {
    const rgba = pixels(0, 120, 191, 192, 255)
    thresholdToMonochrome(rgba)
    expect(grays(rgba)).toEqual([0, 0, 0, 255, 255])
  })

  test('hasilnya selalu buram penuh, hanya hitam atau putih', () => {
    const rgba = new Uint8ClampedArray([30, 200, 90, 10])
    thresholdToMonochrome(rgba)
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255])
  })
})

describe('ditherToMonochrome', () => {
  test('abu-abu 50% menjadi pola titik sekitar separuh hitam', () => {
    const size = 16
    const rgba = pixels(...Array<number>(size * size).fill(128))
    ditherToMonochrome(rgba, size, size)
    const values = grays(rgba)
    expect(values.every((v) => v === 0 || v === 255)).toBe(true)
    const black = values.filter((v) => v === 0).length / values.length
    expect(black).toBeGreaterThan(0.4)
    expect(black).toBeLessThan(0.6)
  })

  test('putih tetap putih dan hitam tetap hitam', () => {
    const rgba = pixels(255, 0, 255, 0)
    ditherToMonochrome(rgba, 2, 2)
    expect(grays(rgba)).toEqual([255, 0, 255, 0])
  })
})
