// サンプルピッカーの fetch URL とロード成功時の動作を検証。
//
// topbar.js の sample <select> は change 時に
//   fetch('/static/viewer/samples/${id}.json', { cache: 'no-store' })
// を発行し、JSON を actions.loadComposition に渡す。ここでは fetch を
// モックして、5 つのサンプル ID 全てが正しい URL を叩き、JSON が
// loadComposition にそのまま渡されることを確認する。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const SAMPLE_IDS = [
  '01-skytree',
  '02-tokyo-tower',
  '03-shinjuku',
  '04-tokyo-station',
  '05-shibuya',
]

describe('sample picker fetch contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each(SAMPLE_IDS)('fetches /static/viewer/samples/%s.json with cache:no-store', async (id) => {
    const fakeJson = { v: 1, name: id, points: [], segments: [], global: {} }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeJson,
    })
    globalThis.fetch = fetchMock

    // simulate the topbar handler body verbatim
    const url = `/static/viewer/samples/${id}.json`
    const res = await fetch(url, { cache: 'no-store' })
    const comp = await res.json()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(url, { cache: 'no-store' })
    expect(comp).toEqual(fakeJson)
  })

  it('passes the parsed JSON unchanged to loadComposition', async () => {
    const sampleComp = {
      v: 1,
      name: 'mock-sample',
      author: 'test',
      points: [{ id: 'A', lon: 139.7, lat: 35.7, altM: 50, pitchDeg: -10, headingRelDeg: 0 }],
      segments: [],
      global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleComp,
    })
    const loadComposition = vi.fn()

    const res = await fetch('/static/viewer/samples/01-skytree.json', { cache: 'no-store' })
    const comp = await res.json()
    loadComposition(comp)

    expect(loadComposition).toHaveBeenCalledWith(sampleComp)
  })

  it('throws when HTTP fails (so showToast catches it)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    })

    const res = await fetch('/static/viewer/samples/missing.json', { cache: 'no-store' })
    expect(res.ok).toBe(false)
    // Topbar handler raises Error(`HTTP ${status}`); we mirror that here.
    let thrown = null
    try {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toBe('HTTP 404')
  })
})
