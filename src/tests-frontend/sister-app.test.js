import { describe, it, expect } from 'vitest'

async function loadSisterApp() {
  delete window.sisterApp
  await import('../app/static/js/sister-app.js?t=' + Date.now())
  return window.sisterApp
}

describe('sisterApp.buildHref', () => {
  it('builds URL for plateau-3d-app with lang=ja', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('plateau-3d-app', 'ja')
    expect(href).toBe('https://invest-aitech-plateau-3d.web.app/?lang=ja')
  })

  it('builds URL for plateau-route-3d with lang=en', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('plateau-route-3d', 'en')
    expect(href).toBe('https://invest-aitech-route-3d.web.app/?lang=en')
  })

  it('returns "#" when targetAppId is unknown (v2 removed)', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('plateau-route-3d-v2', 'en')).toBe('#')
  })

  it('returns "#" when targetAppId is truly nonexistent', async () => {
    const sa = await loadSisterApp()
    expect(sa.buildHref('nonexistent', 'en')).toBe('#')
  })
})
