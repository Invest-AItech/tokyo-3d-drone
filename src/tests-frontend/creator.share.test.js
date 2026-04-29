import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveAndShare, buildSharedUrl, fetchPreviewTileset } from '../app/static/viewer/share.js'

describe('buildSharedUrl', () => {
  it('returns origin/viewer/?id=...', () => {
    expect(buildSharedUrl('https://x.com', 'abc123')).toBe('https://x.com/viewer/?id=abc123')
  })
})

describe('saveAndShare', () => {
  beforeEach(() => {
    global.fetch = undefined
  })

  it('POSTs to /api/v1/compositions and returns the url', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'abc123', url: 'https://x.com/viewer/?id=abc123' }),
    })
    global.fetch = mockFetch

    const url = await saveAndShare(
      { v: 1, points: [], segments: [], global: {} },
      { recaptchaToken: 'tok' }
    )
    expect(url).toBe('https://x.com/viewer/?id=abc123')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [reqUrl, options] = mockFetch.mock.calls[0]
    expect(reqUrl).toBe('/api/v1/compositions')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.recaptchaToken).toBe('tok')
    expect(body.v).toBe(1)
  })

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'reCAPTCHA verification failed' }),
    })
    await expect(
      saveAndShare({ v: 1 }, { recaptchaToken: 't' })
    ).rejects.toThrow(/recap/i)
  })

  it('throws with status when error body lacks detail', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })
    await expect(
      saveAndShare({ v: 1 }, { recaptchaToken: 't' })
    ).rejects.toThrow(/500/)
  })
})

describe('fetchPreviewTileset', () => {
  beforeEach(() => { global.fetch = undefined })

  it('POSTs composition and returns tileset_url', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ request_id: 'req-1', tileset_url: '/runtime/requests/req-1/tileset.json' }),
    })
    global.fetch = mockFetch
    const r = await fetchPreviewTileset({ v: 1, points: [], segments: [], global: {} })
    expect(r.tileset_url).toBe('/runtime/requests/req-1/tileset.json')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/compositions/preview-tileset', expect.objectContaining({ method: 'POST' }))
  })

  it('throws on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429, json: () => Promise.resolve({ detail: 'too many' }),
    })
    await expect(fetchPreviewTileset({})).rejects.toThrow(/too many/)
  })
})
