// Map Pane パネル
// Leaflet ベース: OSM タイル + クリックで点追加 + マーカードラッグ + ポリライン描画
import { showToastWithCta } from '../share.js'
const TOKYO_CENTER = [35.6812, 139.7671]
const DEFAULT_ZOOM = 14

export function mountMapPane(container, { state, actions, subscribe }) {
  container.innerHTML = `
    <header class="pane-header">
      <div class="pane-header__title" data-i18n="creator.paneMapTitle">① 経路設定</div>
      <div class="pane-header__hint" role="status" aria-live="polite">クリックで飛行ルートの点を追加（最大 50 点）</div>
      <div class="pane-header__actions">
        <button data-action="undo-last-point" class="pane-toolbar-btn" title="直前に追加した点を削除" data-i18n="creator.undoLastPoint">⌫ 直前を削除</button>
      </div>
    </header>
    <div id="map-canvas" class="map-canvas"></div>
  `
  const mapEl = container.querySelector('#map-canvas')

  const map = L.map(mapEl).setView(TOKYO_CENTER, DEFAULT_ZOOM)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map)

  const markers = new Map() // id → L.Marker
  let polyline = null

  function syncMarkers(comp) {
    // 削除された点のマーカーを除去
    for (const [id, m] of markers) {
      if (!comp.points.find(p => p.id === id)) {
        map.removeLayer(m)
        markers.delete(id)
      }
    }

    // 追加 / 移動
    comp.points.forEach(p => {
      let m = markers.get(p.id)
      if (!m) {
        m = L.marker([p.lat, p.lon], { draggable: true, title: p.id }).addTo(map)
        m.bindTooltip(p.id, { permanent: true, direction: 'top', offset: [0, -10] })
        m.on('click', () => actions.selectPoint(p.id))
        m.on('contextmenu', (ev) => {
          ev.originalEvent.preventDefault()
          showToastWithCta(
            `点 ${p.id} を削除しますか？`,
            '✓ 削除',
            () => actions.removePoint(p.id)
          )
        })
        m.on('dragend', () => {
          const ll = m.getLatLng()
          actions.updatePoint(p.id, { lon: ll.lng, lat: ll.lat })
        })
        markers.set(p.id, m)
      } else {
        const cur = m.getLatLng()
        if (cur.lat !== p.lat || cur.lng !== p.lon) {
          m.setLatLng([p.lat, p.lon])
        }
      }
    })

    // ポリライン更新
    if (polyline) {
      map.removeLayer(polyline)
      polyline = null
    }
    if (comp.points.length >= 2) {
      polyline = L.polyline(
        comp.points.map(p => [p.lat, p.lon]),
        { color: '#22d3ee', weight: 4, opacity: 0.7 }
      ).addTo(map)
    }
  }

  // 直前を削除ボタン
  const undoBtn = container.querySelector('[data-action="undo-last-point"]')
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (state.composition.points.length === 0) return
      actions.removeLastPoint()
    })
  }

  // クリックで点追加
  map.on('click', e => {
    actions.addPointAt({ lon: e.latlng.lng, lat: e.latlng.lat })
  })

  // 選択点をハイライト（zIndexOffset で前面に）
  function highlightSelection(selId) {
    for (const [id, m] of markers) {
      m.setZIndexOffset(id === selId ? 1000 : 0)
    }
  }

  const hintEl = container.querySelector('.pane-header__hint')

  subscribe(s => {
    syncMarkers(s.composition)
    highlightSelection(s.selectedPointId)
    // 点数に応じて動的ヒントを更新
    if (hintEl) {
      const n = s.composition.points.length
      if (n === 0) {
        hintEl.textContent = 'クリックで飛行ルートの点を追加（最大 50 点）'
      } else if (n === 1) {
        hintEl.textContent = 'あと 1 点以上追加すると飛行ルートが確定します'
      } else {
        hintEl.textContent = `${n} 点 · ② 右パネルでカメラ高度を調整 → ▶ Play`
      }
    }
  })
}
