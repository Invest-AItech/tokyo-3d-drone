import { describe, it, expect } from 'vitest'
import { buildAIPrompt, FIELD_SPEC, INVARIANTS } from '../app/static/viewer/ai-prompt.js'

describe('buildAIPrompt', () => {
  it('contains field spec and invariants', () => {
    const empty = { v: 1, points: [], segments: [], global: {} }
    const p = buildAIPrompt(empty)
    expect(p).toContain('plateau-route-3d Creator Mode')
    expect(p).toContain('フォーマット仕様 v1')
    expect(p).toContain('不変条件')
    expect(p).toContain('サンプル 1')
    expect(p).toContain('サンプル 2')
  })

  it('shows placeholder when composition is empty', () => {
    const empty = { v: 1, points: [], segments: [], global: {} }
    const p = buildAIPrompt(empty)
    expect(p).toContain('まだ点を追加していません')
  })

  it('includes current composition when has points', () => {
    const c = {
      v: 1,
      global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
      points: [
        { id: 'A', lon: 139.7, lat: 35.6, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
        { id: 'B', lon: 139.71, lat: 35.61, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
      ],
      segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
    }
    const p = buildAIPrompt(c)
    expect(p).toContain('"id": "A"')
    expect(p).toContain('"id": "B"')
    expect(p).toContain('編集中の composition')
  })

  it('omits current composition when includeCurrent: false', () => {
    // サンプル JSON にも "id": "A" が含まれるため、現在の composition 固有の値で確認する
    const c = {
      v: 1,
      global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
      points: [
        { id: 'A', lon: 139.9999, lat: 35.9999, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
        { id: 'B', lon: 139.0001, lat: 35.0001, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
      ],
      segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
    }
    const p = buildAIPrompt(c, { includeCurrent: false })
    expect(p).not.toContain('139.9999')
    expect(p).not.toContain('35.9999')
  })

  it('exports FIELD_SPEC and INVARIANTS as strings', () => {
    expect(typeof FIELD_SPEC).toBe('string')
    expect(typeof INVARIANTS).toBe('string')
    expect(FIELD_SPEC).toContain('lod')
    expect(INVARIANTS).toContain('20km')
  })
})
