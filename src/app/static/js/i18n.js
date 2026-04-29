// @version: 1.0.0
// 共通 i18n モジュール。plateau-3d-app と plateau-route-3d-v2 でコピー同期。
// 変更時は両リポジトリに反映すること。

(function () {
  let _locale = 'ja'
  let _supportedLocales = ['ja', 'en']
  let _defaultLocale = 'ja'
  let _translations = { ja: {}, en: {} }
  const _listeners = []

  function detectLocale() {
    // 1. URL ?lang=
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang && _supportedLocales.includes(urlLang)) return urlLang
    // 2. localStorage
    const stored = localStorage.getItem('locale')
    if (stored && _supportedLocales.includes(stored)) return stored
    // 3. navigator.language
    const browser = (navigator.language || 'ja').toLowerCase()
    if (browser.startsWith('ja')) return 'ja'
    if (_supportedLocales.includes('en')) return 'en'
    return _defaultLocale
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
  }

  window.i18n = {
    init({ defaultLocale = 'ja', supportedLocales = ['ja', 'en'], translations = { ja: {}, en: {} } } = {}) {
      _defaultLocale = defaultLocale
      _supportedLocales = supportedLocales
      _translations = translations
      _locale = detectLocale()
      // 自動判定で EN になった場合、URL に明示しておく（共有しやすさ）
      const urlLang = new URLSearchParams(window.location.search).get('lang')
      if (!urlLang && _locale !== _defaultLocale) {
        const url = new URL(window.location.href)
        url.searchParams.set('lang', _locale)
        window.history.replaceState({}, '', url)
      }
      // localStorage に同期
      localStorage.setItem('locale', _locale)
    },
    getLocale() {
      return _locale
    },
    setLocale(locale) {
      if (!_supportedLocales.includes(locale)) return
      if (_locale === locale) return
      _locale = locale
      localStorage.setItem('locale', locale)
      const url = new URL(window.location.href)
      url.searchParams.set('lang', locale)
      window.history.pushState({}, '', url)
      this.applyToDom()
      _listeners.forEach((cb) => cb(locale))
    },
    t(key) {
      const val = getByPath(_translations[_locale], key)
      if (val !== undefined) return val
      const fallback = getByPath(_translations[_defaultLocale], key)
      if (fallback !== undefined) {
        if (typeof console !== 'undefined') console.warn(`[i18n] missing key for ${_locale}: ${key}`)
        return fallback
      }
      return key
    },
    applyToDom() {
      // [data-i18n] テキスト
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = this.t(el.dataset.i18n)
      })
      // [data-i18n-html] HTML
      document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        el.innerHTML = this.t(el.dataset.i18nHtml)
      })
      // [data-i18n-attr-<attr>] 属性翻訳
      document.querySelectorAll('*').forEach((el) => {
        for (const dataKey in el.dataset) {
          if (dataKey.startsWith('i18nAttr')) {
            const attr = dataKey
              .replace(/^i18nAttr/, '')
              .replace(/^./, (c) => c.toLowerCase())
              .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
            el.setAttribute(attr, this.t(el.dataset[dataKey]))
          }
        }
      })
      // body data-locale 属性（CSS で EN 専用スタイルを当てるため）
      document.body.setAttribute('data-locale', _locale)
      // html lang 属性
      document.documentElement.setAttribute('lang', _locale)
    },
    onChange(callback) {
      _listeners.push(callback)
    }
  }
})()
