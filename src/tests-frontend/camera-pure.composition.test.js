// camera-pure の precomputeComposition が durationS / speedKmh を正しく扱うかを検証
import { describe, it, expect } from 'vitest'
import { precomputeComposition } from '../app/static/js/camera-pure.js'

const BASE_GLOBAL = { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 }

function _composition(segments) {
  return {
    v: 1,
    global: BASE_GLOBAL,
    points: [
      { id: 'A', lon: 139.7, lat: 35.6, altM: 50, pitchDeg: -10, headingRelDeg: 0 },
      { id: 'B', lon: 139.71, lat: 35.61, altM: 50, pitchDeg: -10, headingRelDeg: 0 },
    ],
    segments,
  }
}

describe('precomputeComposition – timing field handling', () => {
  it('honors durationS when given (even if speedKmh absent)', () => {
    const c = _composition([{ from: 'A', to: 'B', durationS: 12.5 }])
    const ctx = precomputeComposition(c)
    expect(ctx.segments).toHaveLength(1)
    expect(ctx.segments[0].durationS).toBeCloseTo(12.5, 6)
    expect(ctx.totalDurationS).toBeCloseTo(12.5, 6)
    // speedKmh は逆算されて返ってくる（hover なし、A→B 1 区間なので totalDurationS == durationS）
    expect(ctx.segments[0].speedKmh).toBeGreaterThan(0)
  })

  it('falls back to speedKmh when durationS not given (backward compat)', () => {
    const c = _composition([{ from: 'A', to: 'B', speedKmh: 80 }])
    const ctx = precomputeComposition(c)
    expect(ctx.segments[0].speedKmh).toBe(80)
    // 距離 / 速度 で導出された durationS が正の値で返る
    expect(ctx.segments[0].durationS).toBeGreaterThan(0)
  })

  it('prioritizes durationS over speedKmh when both present', () => {
    const c = _composition([{ from: 'A', to: 'B', durationS: 30, speedKmh: 1 }])
    const ctx = precomputeComposition(c)
    // durationS が優先される（speedKmh=1 でも duration は 30s のまま）
    expect(ctx.segments[0].durationS).toBeCloseTo(30, 6)
  })
})
