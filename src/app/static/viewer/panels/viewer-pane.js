// Viewer Pane パネル
// - Cesium Viewer 初期化（PLATEAU-Terrain + OSM imagery）
// - composition の点 / 折れ線をオーバーレイ表示
// - URL ?id=xxx → /api/v1/compositions/{id}/tileset から PLATEAU 3D Tiles を描画
// - state.previewTilesTrigger 変化 → fetchPreviewTileset で unsaved タイルを描画
// - state.isPlaying === true で precomputeComposition + computeFrameComposition を毎 tick 呼んで Play 再生
// - Play 完了で自動 actions.stop()
import { precomputeComposition, computeFrameComposition } from '../../js/camera-pure.js'
import { fetchPreviewTileset } from '../share.js'

const Cesium = window.Cesium

// PLATEAU 公式ストリーミングトークン（viewer/app.js と共通）
const PLATEAU_TERRAIN_ION_ASSET_ID = 3258112
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiODVhMmQ5OS1hOWZjLTQ3YmYtODlmNi1lNWUwY2MwOGUxYTMiLCJpZCI6MTQ5ODk3LCJpYXQiOjE2ODc5MzQ3NDN9.OG0mc3i7ZxGwHQjlMv3TRjiOvKWpzxglxmJRaUIykTY'

const POLYLINE_COLOR = '#22d3ee'
const POINT_COLOR = '#e879f9'

const HOME_LON = 139.7671
const HOME_LAT = 35.6812
const HOME_ALT_M = 2000

export function mountViewerPane(container, { state, actions, subscribe }) {
  // index.html で既に div#cesiumContainer / div#hud を用意済み

  // OSM imagery（viewer/app.js と同じパターン）
  const osmImagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
    maximumLevel: 18,
  })

  const viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(Promise.resolve(osmImagery)),
    sceneMode: Cesium.SceneMode.SCENE3D,
    timeline: false,
    animation: false,
    geocoder: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  })

  // PLATEAU-Terrain
  const plateauTerrain = new Cesium.Terrain(
    Cesium.CesiumTerrainProvider.fromIonAssetId(PLATEAU_TERRAIN_ION_ASSET_ID),
  )
  plateauTerrain.errorEvent.addEventListener((err) => {
    console.error('[creator viewer] PLATEAU-Terrain ロード失敗', err)
  })
  viewer.scene.setTerrain(plateauTerrain)

  viewer.scene.globe.depthTestAgainstTerrain = true
  viewer.scene.globe.enableLighting = false

  // 初期視点（東京駅周辺、斜め俯瞰）
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_ALT_M),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
  })

  // --- state ---
  let polylineEntity = null
  const pointEntities = new Map() // id → Entity
  let currentTilesetId = null
  let currentTileset = null
  let previewTileset = null
  let lastPreviewTrigger = 0
  let removeTick = null
  let playStartMs = 0
  let playCtx = null
  let lastIsPlaying = false
  let lastPointsKey = ''

  // --- overlay ---

  function syncOverlay(comp) {
    // polyline
    if (polylineEntity) {
      viewer.entities.remove(polylineEntity)
      polylineEntity = null
    }
    if (comp.points.length >= 2) {
      polylineEntity = viewer.entities.add({
        polyline: {
          // 3D で点と点を直線で結ぶ（地面に貼り付けず、各点の高度で空中を通す）
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            comp.points.flatMap(p => [p.lon, p.lat, p.altM]),
          ),
          width: 4,
          material: Cesium.Color.fromCssColorString(POLYLINE_COLOR).withAlpha(0.7),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
        },
      })
    }

    // points
    const seenIds = new Set(comp.points.map(p => p.id))
    for (const [id, ent] of pointEntities) {
      if (!seenIds.has(id)) {
        viewer.entities.remove(ent)
        pointEntities.delete(id)
      }
    }
    comp.points.forEach(p => {
      const existing = pointEntities.get(p.id)
      const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM)
      if (existing) {
        existing.position = new Cesium.ConstantPositionProperty(position)
      } else {
        const ent = viewer.entities.add({
          position,
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString(POINT_COLOR),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: p.id,
            font: '14px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
          },
        })
        pointEntities.set(p.id, ent)
      }
    })
  }

  // --- tileset ---

  async function syncTileset() {
    const urlId = new URLSearchParams(location.search).get('id')
    if (!urlId) {
      if (currentTileset) {
        viewer.scene.primitives.remove(currentTileset)
        currentTileset = null
        currentTilesetId = null
      }
      return
    }
    if (currentTilesetId === urlId) return
    currentTilesetId = urlId
    if (currentTileset) {
      viewer.scene.primitives.remove(currentTileset)
      currentTileset = null
    }
    try {
      const r = await fetch(`/api/v1/compositions/${encodeURIComponent(urlId)}/tileset`)
      if (!r.ok) throw new Error(`tileset endpoint ${r.status}`)
      const meta = await r.json()
      currentTileset = await Cesium.Cesium3DTileset.fromUrl(meta.tileset_url)
      viewer.scene.primitives.add(currentTileset)
    } catch (e) {
      console.error('[creator viewer] composition tileset load failed', e)
    }
  }

  // --- preview tileset ---

  async function loadPreviewTileset(comp) {
    if (previewTileset) {
      viewer.scene.primitives.remove(previewTileset)
      previewTileset = null
    }
    if (currentTileset) {
      // ?id= 由来の tileset があれば消す（preview と競合しないように）
      viewer.scene.primitives.remove(currentTileset)
      currentTileset = null
      currentTilesetId = null
    }
    try {
      const meta = await fetchPreviewTileset(comp)
      previewTileset = await Cesium.Cesium3DTileset.fromUrl(meta.tileset_url)
      viewer.scene.primitives.add(previewTileset)
      viewer.zoomTo(previewTileset)
    } catch (e) {
      console.error('[creator viewer] preview tileset load failed', e)
    }
  }

  // --- play ---

  function startPlay(comp) {
    if (comp.points.length < 2) return
    playCtx = precomputeComposition(comp)
    playStartMs = performance.now()
    // EMA state for heading smoothing
    let smoothedHeading = null
    let lastTickMs = playStartMs
    if (removeTick) { removeTick(); removeTick = null }
    removeTick = viewer.clock.onTick.addEventListener(() => {
      const nowMs = performance.now()
      const t = (nowMs - playStartMs) / 1000
      if (t >= playCtx.totalDurationS) {
        stopPlay()
        return
      }
      const f = computeFrameComposition(playCtx, t)

      // EMA on headingAbsDeg, handling 360° wraparound
      const tau = playCtx.tau
      const dt = Math.max(0.001, (nowMs - lastTickMs) / 1000)
      lastTickMs = nowMs
      let appliedHeading
      if (smoothedHeading === null || tau <= 0) {
        smoothedHeading = f.headingAbsDeg
        appliedHeading = f.headingAbsDeg
      } else {
        const alpha = 1 - Math.exp(-dt / tau)
        const diff = ((f.headingAbsDeg - smoothedHeading + 540) % 360) - 180
        smoothedHeading = (smoothedHeading + diff * alpha + 360) % 360
        appliedHeading = smoothedHeading
      }

      const cartographic = Cesium.Cartographic.fromDegrees(f.lon, f.lat)
      const terrainH = viewer.scene.globe.getHeight(cartographic) ?? 0
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, terrainH + f.heightM),
        orientation: {
          heading: Cesium.Math.toRadians(appliedHeading),
          pitch: Cesium.Math.toRadians(f.pitchDeg),
          roll: 0,
        },
      })
    })
  }

  function stopPlay() {
    if (removeTick) { removeTick(); removeTick = null }
    playCtx = null
    actions.stop()
  }

  // --- subscribe ---

  subscribe(s => {
    // points が変わったら overlay 更新（key で簡易差分）
    const key = s.composition.points.map(p => `${p.id}:${p.lon}:${p.lat}:${p.altM}`).join('|')
    if (key !== lastPointsKey) {
      syncOverlay(s.composition)
      lastPointsKey = key
    }

    // tileset 同期（URL ?id= ベース、非同期で呼ぶが Promise は捨てない）
    syncTileset().catch(e => console.error('[creator viewer] syncTileset error', e))

    // preview tileset トリガー
    if (s.previewTilesTrigger && s.previewTilesTrigger !== lastPreviewTrigger) {
      lastPreviewTrigger = s.previewTilesTrigger
      loadPreviewTileset(s.composition).catch(e => console.error('[creator viewer] loadPreviewTileset error', e))
    }

    // play 状態管理
    if (s.isPlaying && !lastIsPlaying) startPlay(s.composition)
    if (!s.isPlaying && lastIsPlaying && removeTick) {
      // 外部から stop() が呼ばれた場合（isPlaying が外部で false になった）
      if (removeTick) { removeTick(); removeTick = null }
      playCtx = null
    }
    lastIsPlaying = s.isPlaying
  })
}
