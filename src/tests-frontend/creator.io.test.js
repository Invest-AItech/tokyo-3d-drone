import { describe, it, expect } from 'vitest'
import { exportComposition, importComposition } from '../app/static/viewer/io.js'

const VALID = {
  v: 1,
  global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
  points: [
    { id: 'A', lon: 139.7, lat: 35.6, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
    { id: 'B', lon: 139.71, lat: 35.61, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
  ],
  segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
}

describe('export/import roundtrip', () => {
  it('produces valid JSON that can be imported back to identical composition', () => {
    const json = exportComposition(VALID)
    const parsed = importComposition(json)
    expect(parsed).toEqual(expect.objectContaining({
      v: 1,
      points: expect.arrayContaining([
        expect.objectContaining({ id: 'A' }),
        expect.objectContaining({ id: 'B' }),
      ]),
    }))
  })

  it('exported JSON is human-readable (indented)', () => {
    const json = exportComposition(VALID)
    expect(json).toContain('\n')
    expect(json).toContain('  ')  // 2-space indent
  })

  it('rejects malformed import (not JSON)', () => {
    expect(() => importComposition('not json')).toThrow()
  })

  it('rejects malformed import (empty object)', () => {
    expect(() => importComposition('{}')).toThrow()
  })

  it('rejects malformed import (wrong version)', () => {
    expect(() => importComposition(JSON.stringify({ ...VALID, v: 2 }))).toThrow(/version/)
  })
})
