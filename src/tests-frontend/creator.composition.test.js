import { describe, it, expect } from 'vitest'
import {
  validateComposition,
  emptyComposition,
  nextPointId,
  addPoint,
  removePoint,
  movePoint,
  rebuildSegments,
  resetPoints,
  removeLastPoint,
  applyToAllPoints,
  applyToAllSegments,
} from '../app/static/viewer/composition.js'

describe('emptyComposition', () => {
  it('returns a v=1 composition with valid global', () => {
    const c = emptyComposition()
    expect(c.v).toBe(1)
    expect(c.global.lod).toBe('lod2')
    expect(c.points).toEqual([])
    expect(c.segments).toEqual([])
  })
})

describe('nextPointId', () => {
  it('returns A for empty list', () => {
    expect(nextPointId([])).toBe('A')
  })
  it('returns next letter', () => {
    expect(nextPointId([{ id: 'A' }, { id: 'B' }])).toBe('C')
  })
  it('wraps to A1 after Z', () => {
    const ids = []
    for (let i = 0; i < 26; i++) ids.push({ id: String.fromCharCode(65 + i) })
    expect(nextPointId(ids)).toBe('A1')
  })
  it('continues numbered sequence', () => {
    const ids = []
    for (let i = 0; i < 26; i++) ids.push({ id: String.fromCharCode(65 + i) })
    ids.push({ id: 'A1' })
    ids.push({ id: 'A2' })
    expect(nextPointId(ids)).toBe('A3')
  })
})

describe('addPoint / removePoint / movePoint', () => {
  it('adds a point at end with auto id and rebuilds segments', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    expect(c.points.map(p => p.id)).toEqual(['A', 'B'])
    expect(c.segments).toEqual([{ from: 'A', to: 'B', speedKmh: 80 }])
  })

  it('removes a point and rebuilds segments', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    c = addPoint(c, { lon: 139.72, lat: 35.62 })
    c = removePoint(c, 'B')
    expect(c.points.map(p => p.id)).toEqual(['A', 'C'])
    expect(c.segments).toEqual([{ from: 'A', to: 'C', speedKmh: 80 }])
  })

  it('moves a point up and rebuilds segments', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    c = addPoint(c, { lon: 139.72, lat: 35.62 })
    c = movePoint(c, 'C', -1) // C を 1 つ上に
    expect(c.points.map(p => p.id)).toEqual(['A', 'C', 'B'])
  })
})

describe('validateComposition', () => {
  const VALID = {
    v: 1,
    global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
    points: [
      { id: 'A', lon: 139.7, lat: 35.6, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
      { id: 'B', lon: 139.71, lat: 35.61, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
    ],
    segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
  }

  it('passes a valid composition', () => {
    expect(() => validateComposition(VALID)).not.toThrow()
  })

  it('rejects v != 1', () => {
    expect(() => validateComposition({ ...VALID, v: 2 })).toThrow(/version/)
  })

  it('rejects too few points', () => {
    expect(() =>
      validateComposition({ ...VALID, points: [VALID.points[0]], segments: [] })
    ).toThrow(/at least 2/)
  })

  it('rejects duplicate ids', () => {
    const dup = { ...VALID, points: [{ ...VALID.points[0] }, { ...VALID.points[1], id: 'A' }] }
    expect(() => validateComposition(dup)).toThrow(/duplicate/)
  })

  it('rejects altM out of range', () => {
    const bad = JSON.parse(JSON.stringify(VALID))
    bad.points[0].altM = 999
    expect(() => validateComposition(bad)).toThrow(/altM/)
  })

  it('rejects mismatched segment count', () => {
    const bad = { ...VALID, segments: [] }
    expect(() => validateComposition(bad)).toThrow(/segments/)
  })
})

describe('resetPoints', () => {
  it('clears points and segments while preserving global', () => {
    let c = emptyComposition()
    c.global.bufferM = 200  // ユーザーが変更した値
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    const reset = resetPoints(c)
    expect(reset.points).toEqual([])
    expect(reset.segments).toEqual([])
    expect(reset.global.bufferM).toBe(200)  // global は保持
    expect(reset.v).toBe(1)
  })
})

describe('removeLastPoint', () => {
  it('removes the last point and rebuilds segments', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    c = addPoint(c, { lon: 139.72, lat: 35.62 })
    const updated = removeLastPoint(c)
    expect(updated.points.map(p => p.id)).toEqual(['A', 'B'])
    expect(updated.segments).toEqual([{ from: 'A', to: 'B', speedKmh: 80 }])
  })

  it('returns same composition when no points', () => {
    const c = emptyComposition()
    expect(removeLastPoint(c)).toEqual(c)
  })
})

describe('applyToAllPoints', () => {
  it('copies the value to every point', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    c = addPoint(c, { lon: 139.72, lat: 35.62 })
    const updated = applyToAllPoints(c, 'altM', 200)
    expect(updated.points.every(p => p.altM === 200)).toBe(true)
    // segments は変わらない
    expect(updated.segments).toEqual(c.segments)
  })
})

describe('applyToAllSegments', () => {
  it('copies the value to every segment', () => {
    let c = emptyComposition()
    c = addPoint(c, { lon: 139.7, lat: 35.6 })
    c = addPoint(c, { lon: 139.71, lat: 35.61 })
    c = addPoint(c, { lon: 139.72, lat: 35.62 })
    const updated = applyToAllSegments(c, 'speedKmh', 120)
    expect(updated.segments.every(s => s.speedKmh === 120)).toBe(true)
  })
})
