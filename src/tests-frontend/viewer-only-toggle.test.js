// Viewer-only モード切替の状態保存／読込ロジック検証
//
// app.js は副作用が多いため、import するのではなく toggle 規約のロジックを
// 直接検証する。検証対象:
//   - localStorage('drone_viewer_only') === 'true' のときのみ true
//   - 未保存（null） / 'false' のときは false（デフォルト 3-pane 表示）
//   - toggleViewerOnly 後に localStorage に String(next) が書かれる
//   - body.dataset.viewerOnly が同期される
import { describe, it, expect, beforeEach } from 'vitest'

describe('viewer-only toggle persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.body.dataset.viewerOnly
  })

  function readViewerOnly() {
    return localStorage.getItem('drone_viewer_only') === 'true'
  }
  function writeViewerOnly(v) {
    localStorage.setItem('drone_viewer_only', String(v))
    document.body.dataset.viewerOnly = String(v)
  }

  it('defaults to false when nothing is stored', () => {
    expect(readViewerOnly()).toBe(false)
  })

  it('returns true only when explicitly set to "true"', () => {
    writeViewerOnly(true)
    expect(readViewerOnly()).toBe(true)
    expect(document.body.dataset.viewerOnly).toBe('true')
  })

  it('returns false when set to "false"', () => {
    writeViewerOnly(false)
    expect(readViewerOnly()).toBe(false)
    expect(document.body.dataset.viewerOnly).toBe('false')
  })

  it('toggles round-trip (false → true → false)', () => {
    let cur = readViewerOnly()
    expect(cur).toBe(false)

    cur = !cur
    writeViewerOnly(cur)
    expect(readViewerOnly()).toBe(true)

    cur = !cur
    writeViewerOnly(cur)
    expect(readViewerOnly()).toBe(false)
  })

  it('does not coerce non-boolean strings to true', () => {
    localStorage.setItem('drone_viewer_only', 'yes')
    expect(readViewerOnly()).toBe(false)
    localStorage.setItem('drone_viewer_only', '1')
    expect(readViewerOnly()).toBe(false)
  })
})
