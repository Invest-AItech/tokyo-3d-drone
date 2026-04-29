import { describe, it, expect, beforeEach } from 'vitest'

// i18n.js は window グローバルを設定するので、test 用に動的 import + window 注入
async function loadI18n() {
  // window/localStorage/navigator/history を jsdom が提供
  const url = new URL('http://test.local/' + (window.location.search || ''))
  window.history.replaceState({}, '', url)
  delete window.i18n
  await import('../app/static/js/i18n.js?t=' + Date.now())
  return window.i18n
}

describe('i18n: locale detection', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'http://test.local/')
  })

  it('returns "ja" by default when no signal', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true })
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    expect(i18n.getLocale()).toBe('ja')
  })

  it('returns "en" when navigator.language is en-US', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    expect(i18n.getLocale()).toBe('en')
  })

  it('returns locale from URL ?lang=en even with ja browser', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true })
    window.history.replaceState({}, '', 'http://test.local/?lang=en')
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    expect(i18n.getLocale()).toBe('en')
  })

  it('localStorage takes precedence over navigator', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    localStorage.setItem('locale', 'ja')
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    expect(i18n.getLocale()).toBe('ja')
  })
})

describe('i18n: translation', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'http://test.local/')
  })

  it('returns translated string for current locale', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true })
    const i18n = await loadI18n()
    i18n.init({
      defaultLocale: 'ja',
      supportedLocales: ['ja', 'en'],
      translations: {
        ja: { hero: { title: 'タイトル' } },
        en: { hero: { title: 'Title' } }
      }
    })
    expect(i18n.t('hero.title')).toBe('タイトル')
  })

  it('falls back to default locale when key missing', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    const i18n = await loadI18n()
    i18n.init({
      defaultLocale: 'ja',
      supportedLocales: ['ja', 'en'],
      translations: {
        ja: { hero: { title: 'タイトル' } },
        en: {}
      }
    })
    expect(i18n.t('hero.title')).toBe('タイトル')
  })

  it('returns key itself when missing in both locales', async () => {
    const i18n = await loadI18n()
    i18n.init({
      defaultLocale: 'ja',
      supportedLocales: ['ja', 'en'],
      translations: { ja: {}, en: {} }
    })
    expect(i18n.t('nonexistent.key')).toBe('nonexistent.key')
  })
})

describe('i18n: setLocale + onChange', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'http://test.local/')
  })

  it('setLocale updates URL ?lang= and localStorage', async () => {
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    i18n.setLocale('en')
    expect(i18n.getLocale()).toBe('en')
    expect(localStorage.getItem('locale')).toBe('en')
    expect(new URL(window.location.href).searchParams.get('lang')).toBe('en')
  })

  it('onChange listeners fire on setLocale', async () => {
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    let called = null
    i18n.onChange((newLocale) => { called = newLocale })
    i18n.setLocale('en')
    expect(called).toBe('en')
  })
})

describe('i18n: applyToDom', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', 'http://test.local/')
    document.body.innerHTML = ''
  })

  it('replaces text content for [data-i18n]', async () => {
    document.body.innerHTML = '<h1 data-i18n="hero.title"></h1>'
    const i18n = await loadI18n()
    i18n.init({
      defaultLocale: 'ja',
      supportedLocales: ['ja', 'en'],
      translations: { ja: { hero: { title: 'タイトル' } }, en: {} }
    })
    i18n.applyToDom()
    expect(document.querySelector('h1').textContent).toBe('タイトル')
  })

  it('sets body data-locale and html lang', async () => {
    const i18n = await loadI18n()
    i18n.init({ defaultLocale: 'ja', supportedLocales: ['ja', 'en'], translations: { ja: {}, en: {} } })
    i18n.applyToDom()
    expect(document.body.getAttribute('data-locale')).toBe('ja')
    expect(document.documentElement.getAttribute('lang')).toBe('ja')
  })
})
