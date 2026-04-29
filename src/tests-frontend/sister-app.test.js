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

describe('sister-app 3-way (Drone added)', () => {
  it('includes tokyo-3d-drone entry', async () => {
    const sa = await loadSisterApp()
    expect(sa.urls['tokyo-3d-drone']).toBeDefined()
    expect(sa.urls['tokyo-3d-drone']).toMatch(/invest-aitech-tokyo-drone\.web\.app/)
  })

  it('builds URL for tokyo-3d-drone with lang=ja', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('tokyo-3d-drone', 'ja')
    expect(href).toBe('https://invest-aitech-tokyo-drone.web.app/?lang=ja')
  })

  it('builds URL for tokyo-3d-drone with lang=en', async () => {
    const sa = await loadSisterApp()
    const href = sa.buildHref('tokyo-3d-drone', 'en')
    expect(href).toBe('https://invest-aitech-tokyo-drone.web.app/?lang=en')
  })
})
