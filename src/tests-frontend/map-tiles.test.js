import { describe, it, expect, beforeEach } from 'vitest'

async function loadMapTiles() {
  delete window.mapTiles
  await import('../app/static/js/map-tiles.js?t=' + Date.now())
  return window.mapTiles
}

describe('mapTiles.rasterUrl', () => {
  beforeEach(() => {
    window.MAPTILER_KEY = 'TESTKEY12345'
  })

  it('builds URL with lang=en', async () => {
    const mt = await loadMapTiles()
    const url = mt.rasterUrl('en')
    expect(url).toContain('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png')
    expect(url).toContain('key=TESTKEY12345')
    expect(url).toContain('lang=en')
  })

  it('builds URL with lang=ja', async () => {
    const mt = await loadMapTiles()
    const url = mt.rasterUrl('ja')
    expect(url).toContain('lang=ja')
  })

  it('uses empty key when MAPTILER_KEY undefined', async () => {
    delete window.MAPTILER_KEY
    const mt = await loadMapTiles()
    const url = mt.rasterUrl('en')
    expect(url).toContain('key=')
  })
})
