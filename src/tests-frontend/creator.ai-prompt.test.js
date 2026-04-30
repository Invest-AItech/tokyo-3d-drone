import { describe, it, expect } from 'vitest'
import { buildAIPrompt, FIELD_SPEC, INVARIANTS, RECOMMENDED_SPEC } from '../app/static/viewer/ai-prompt.js'

describe('buildAIPrompt', () => {
  it('contains field spec and invariants', () => {
    const empty = { v: 1, points: [], segments: [], global: {} }
    const p = buildAIPrompt(empty)
    expect(p).toContain('tokyo-3d-drone (Composition Editor)')
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

  it('exports RECOMMENDED_SPEC as a string with master prompt v4 details', () => {
    expect(typeof RECOMMENDED_SPEC).toBe('string')
    expect(RECOMMENDED_SPEC.length).toBeGreaterThan(10000)
    // v4 prompt 固有のキーワード
    expect(RECOMMENDED_SPEC).toContain('マスタープロンプト v4')
    expect(RECOMMENDED_SPEC).toContain('11 型')
    expect(RECOMMENDED_SPEC).toContain('バラエティ・パレット')
    expect(RECOMMENDED_SPEC).toContain('ヒーロー複合型')
    expect(RECOMMENDED_SPEC).toContain('リビール型')
  })

  it('default mode does NOT include RECOMMENDED_SPEC', () => {
    const empty = { v: 1, points: [], segments: [], global: {} }
    const p = buildAIPrompt(empty)
    expect(p).not.toContain('マスタープロンプト v4')
    expect(p).not.toContain('バラエティ・パレット')
  })

  it('recommended mode appends RECOMMENDED_SPEC after the base prompt', () => {
    const empty = { v: 1, points: [], segments: [], global: {} }
    const base = buildAIPrompt(empty)
    const rec = buildAIPrompt(empty, { recommended: true })
    expect(rec.length).toBeGreaterThan(base.length)
    expect(rec).toContain(base)
    expect(rec).toContain('マスタープロンプト v4')
    expect(rec).toContain('11 型')
    expect(rec).toContain('バラエティ・パレット')
  })

  it('recommended mode respects includeCurrent option', () => {
    const c = {
      v: 1,
      global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
      points: [
        { id: 'A', lon: 139.9999, lat: 35.9999, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
        { id: 'B', lon: 139.0001, lat: 35.0001, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
      ],
      segments: [{ from: 'A', to: 'B', durationS: 10 }],
    }
    const recWithCurrent = buildAIPrompt(c, { recommended: true, includeCurrent: true })
    const recWithoutCurrent = buildAIPrompt(c, { recommended: true, includeCurrent: false })
    expect(recWithCurrent).toContain('139.9999')
    expect(recWithoutCurrent).not.toContain('139.9999')
    // Both still include the spec
    expect(recWithCurrent).toContain('マスタープロンプト v4')
    expect(recWithoutCurrent).toContain('マスタープロンプト v4')
  })
})
