import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCompositionById } from '../app/static/viewer/loader.js'

const VALID = {
  v: 1,
  global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
  points: [
    { id: 'A', lon: 139.7, lat: 35.6, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
    { id: 'B', lon: 139.71, lat: 35.61, altM: 50, pitchDeg: 0, headingRelDeg: 0 },
  ],
  segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
}

describe('loadCompositionById', () => {
  beforeEach(() => { global.fetch = undefined })

  it('fetches and validates a valid composition', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID),
    })
    const c = await loadCompositionById('abc')
    expect(c.points.length).toBe(2)
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/compositions/abc')
  })

  it('throws on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(loadCompositionById('missing')).rejects.toThrow(/404/)
  })

  it('throws when validation fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ v: 2, points: [], segments: [], global: {} }),
    })
    await expect(loadCompositionById('bad')).rejects.toThrow(/version/)
  })

  it('encodes id properly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID),
    })
    await loadCompositionById('a/b c')
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/compositions/a%2Fb%20c')
  })
})
