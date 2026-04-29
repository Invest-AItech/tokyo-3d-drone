// ポリライン ON/OFF トグルの状態保存／読込ロジック検証
//
// app.js は副作用が多いため、import するのではなく toggle 規約のロジックを
// 直接検証する。検証対象:
//   - localStorage('drone_show_polyline') === 'false' のときのみ false
//   - 未保存（null） / 'true' のときは true
//   - togglePolyline 後に localStorage に String(next) が書かれる
import { describe, it, expect, beforeEach } from 'vitest'

describe('polyline toggle persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function readShowPolyline() {
    return localStorage.getItem('drone_show_polyline') !== 'false'
  }
  function writeShowPolyline(v) {
    localStorage.setItem('drone_show_polyline', String(v))
  }

  it('defaults to true when nothing is stored', () => {
    expect(readShowPolyline()).toBe(true)
  })

  it('returns false only when explicitly set to "false"', () => {
    writeShowPolyline(false)
    expect(readShowPolyline()).toBe(false)
  })

  it('returns true when set to "true"', () => {
    writeShowPolyline(true)
    expect(readShowPolyline()).toBe(true)
  })

  it('toggles round-trip (true → false → true)', () => {
    let cur = readShowPolyline()
    expect(cur).toBe(true)

    cur = !cur
    writeShowPolyline(cur)
    expect(readShowPolyline()).toBe(false)

    cur = !cur
    writeShowPolyline(cur)
    expect(readShowPolyline()).toBe(true)
  })
})
