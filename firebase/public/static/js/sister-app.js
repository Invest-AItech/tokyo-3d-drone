// @version: 2.0.0
// 姉妹アプリ URL 一元管理。TOKYO 3D Lab 三部作（View / Route / Drone）の連携に使用。
// URL がハードコードで HTML に散らばらないよう、ここに集約する。
// 変更:
//  - v2.0.0: plateau-3d-app → tokyo-3d-view, plateau-route-3d → tokyo-3d-route にリブランド。

(function () {
  window.sisterApp = {
    urls: {
      'tokyo-3d-view':  'https://invest-aitech-tokyo-view.web.app',
      'tokyo-3d-route': 'https://invest-aitech-tokyo-route.web.app',
      'tokyo-3d-drone': 'https://invest-aitech-tokyo-drone.web.app'  // self
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
