// Creator Mode エントリポイント
// - グローバルステート管理 (state / setState / subscribe)
// - 各パネルの結線
// - URL ?id= による composition 復元
import { emptyComposition, addPoint, removePoint, movePoint, resetPoints, validateComposition, removeLastPoint, applyToAllPoints, applyToAllSegments } from './composition.js'
import { mountTopbar } from './panels/topbar.js'
import { mountMapPane } from './panels/map-pane.js'
import { mountViewerPane } from './panels/viewer-pane.js'
import { mountEditPane } from './panels/edit-pane.js'
import { loadCompositionById } from './loader.js'
import { mountPlaceSearchDrone } from '/static/js/ui-place-search-drone.js'

const state = {
  composition: emptyComposition(),
  selectedPointId: null,
  isPlaying: false,
  playStartedFromPointId: null,
  previewTilesTrigger: 0,
}

const subscribers = new Set()

function setState(updater) {
  if ('composition' in updater) state.composition = updater.composition
  if ('selectedPointId' in updater) state.selectedPointId = updater.selectedPointId
  if ('isPlaying' in updater) state.isPlaying = updater.isPlaying
  if ('playStartedFromPointId' in updater) state.playStartedFromPointId = updater.playStartedFromPointId
  if ('previewTilesTrigger' in updater) state.previewTilesTrigger = updater.previewTilesTrigger
  for (const s of subscribers) s(state)
}

function subscribe(cb) {
  subscribers.add(cb)
  cb(state)
  return () => subscribers.delete(cb)
}

const actions = {
  addPointAt: ({ lon, lat }) => setState({ composition: addPoint(state.composition, { lon, lat }) }),
  removePoint: id => setState({ composition: removePoint(state.composition, id) }),
  movePoint: (id, delta) => setState({ composition: movePoint(state.composition, id, delta) }),
  selectPoint: id => setState({ selectedPointId: id }),
  updatePoint: (id, patch) => {
    const newPoints = state.composition.points.map(p => (p.id === id ? { ...p, ...patch } : p))
    setState({ composition: { ...state.composition, points: newPoints } })
  },
  updateSegment: (idx, patch) => {
    const newSegments = state.composition.segments.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    setState({ composition: { ...state.composition, segments: newSegments } })
  },
  updateGlobal: patch => {
    setState({
      composition: { ...state.composition, global: { ...state.composition.global, ...patch } },
    })
  },
  loadComposition: comp => {
    validateComposition(comp)
    setState({ composition: comp, selectedPointId: comp.points[0]?.id ?? null })
  },
  play: ({ fromPointId = null } = {}) => setState({ isPlaying: true, playStartedFromPointId: fromPointId }),
  stop: () => setState({ isPlaying: false, playStartedFromPointId: null }),
  resetPoints: () => setState({ composition: resetPoints(state.composition), selectedPointId: null }),
  removeLastPoint: () => setState({ composition: removeLastPoint(state.composition), selectedPointId: null }),
  applyToAllPoints: (key, value) => setState({ composition: applyToAllPoints(state.composition, key, value) }),
  applyToAllSegments: (key, value) => setState({ composition: applyToAllSegments(state.composition, key, value) }),
  triggerPreviewTiles: () => setState({ previewTilesTrigger: Date.now() }),
}

mountTopbar(document.getElementById('topbar'), { state, actions, subscribe })
mountMapPane(document.getElementById('map-pane'), { state, actions, subscribe })
mountViewerPane(document.getElementById('viewer-pane'), { state, actions, subscribe })
mountEditPane(document.getElementById('edit-pane'), { state, actions, subscribe })

// Place search wiring (F.7) — Drone-specific, AbSelector-free
const psRoot = document.getElementById('ps-root')
if (psRoot) {
  const placesApi = {
    async autocomplete(input) {
      const r = await fetch(`/api/v1/places/autocomplete?input=${encodeURIComponent(input)}`)
      return r.json()
    },
    async getDetails(placeId) {
      const r = await fetch(`/api/v1/places/details?place_id=${encodeURIComponent(placeId)}`)
      return r.json()
    },
  }
  mountPlaceSearchDrone({
    rootEl: psRoot,
    api: placesApi,
    onPick: ({ lat, lon, name }) => {
      // composition state へ点を追加（既存の addPointAt を流用）
      actions.addPointAt({ lon, lat })
      // 追加された点を選択状態にしてユーザーがすぐに高度などを編集できるよう導線
      const newPoints = state.composition.points
      const last = newPoints[newPoints.length - 1]
      if (last) actions.selectPoint(last.id)
    },
  })
}

// URL ?id= による composition 復元
const urlId = new URLSearchParams(location.search).get('id')
if (urlId) {
  loadCompositionById(urlId)
    .then(c => actions.loadComposition(c))
    .catch(err => console.warn('failed to load composition by id:', err))
}

// mobile bottom tabs
const mobileTabs = document.getElementById('mobile-tabs')
if (mobileTabs) {
  mobileTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pane]')
    if (!btn) return
    const pane = btn.dataset.pane
    document.body.dataset.activePane = pane
    mobileTabs.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-current', b.dataset.pane === pane ? 'page' : 'false')
    })
    // Cesium / Leaflet にリサイズイベント発火（display: none → block 切替時に必要）
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
  })
}
