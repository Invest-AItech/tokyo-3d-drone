// @version: 1.0.0
// MapTiler URL ビルダー。plateau-3d-app と plateau-route-3d-v2 でコピー同期。
// MAPTILER_KEY は window.MAPTILER_KEY 経由で /api/config.js から注入される。

(function () {
  const STYLE = 'streets-v2'
  window.mapTiles = {
    rasterUrl(lang) {
      const key = window.MAPTILER_KEY || ''
      return `https://api.maptiler.com/maps/${STYLE}/{z}/{x}/{y}.png?key=${key}&lang=${lang}`
    }
  }
})()
