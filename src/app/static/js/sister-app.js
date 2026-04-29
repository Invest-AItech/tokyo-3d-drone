// @version: 1.3.0
// 姉妹アプリ URL 一元管理。plateau-3d-app との連携に使用。
// URL がハードコードで HTML に散らばらないよう、ここに集約する。
// 変更: plateau-route-3d-v2 を削除 (v1.3.0)

(function () {
  window.sisterApp = {
    urls: {
      'plateau-3d-app':   'https://invest-aitech-plateau-3d.web.app',
      'plateau-route-3d': 'https://invest-aitech-route-3d.web.app'
    },
    buildHref(targetAppId, lang) {
      const base = this.urls[targetAppId]
      if (!base) return '#'
      const url = new URL(base)
      url.searchParams.set('lang', lang)
      return url.toString()
    }
  }
})()
