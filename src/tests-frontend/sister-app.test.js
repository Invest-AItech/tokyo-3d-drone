import { describe, it, expect } from 'vitest'

async function loadSisterApp() {
  delete window.sisterApp
  await import('../app/static/js/sister-app.js?t=' + Date.now())
  return window.sisterApp
}

describe('sisterApp.buildHref (TOKYO 3D Lab trilogy)', () => {
  it('builds URL for tokyo-3d-view with lang=ja', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('tokyo-3d-view', 'ja')
    expect(href).toBe('https://invest-aitech-tokyo-view.web.app/?lang=ja')
  })

  it('builds URL for tokyo-3d-route with lang=en', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('tokyo-3d-route', 'en')
    expect(href).toBe('https://invest-aitech-tokyo-route.web.app/?lang=en')
  })

  it('builds URL for tokyo-3d-drone (self) with lang=ja', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('tokyo-3d-drone', 'ja')
    expect(href).toBe('https://invest-aitech-tokyo-drone.web.app/?lang=ja')
  })

  it('returns "#" for legacy plateau-3d-app key (renamed to tokyo-3d-view)', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('plateau-3d-app', 'ja')).toBe('#')
  })

  it('returns "#" for legacy plateau-route-3d key (renamed to tokyo-3d-route)', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('plateau-route-3d', 'en')).toBe('#')
  })

  it('returns "#" for removed plateau-route-3d-v2', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('plateau-route-3d-v2', 'en')).toBe('#')
  })

  it('returns "#" when targetAppId is truly nonexistent', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('nonexistent', 'en')).toBe('#')
  })
})
