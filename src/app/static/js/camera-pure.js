// Cesium 非依存の純関数群（自動カメラワーク計算）。
// - smoothstep / bearingDegrees
// - precomputePath(polyline) → 累積距離テーブル + 各種派生値
// - samplePathAtDistance(table, d) → 位置 {lon, lat}（線形補間、両端クランプ）
// - bearingAtDistance(table, d, lookaheadM) → heading（度）
// - computeFrame(ctx, t) → { phase, lon, lat, heightM, headingDeg, pitchDeg }

import { haversineMeters } from './geo-utils.js'

export const CRUISE_SPEED_MPS = 80_000 / 3600 // 80 km/h ≈ 22.22 m/s
export const TAKEOFF_DURATION_S = 3
export const LANDING_DURATION_S = 3

export const TAKEOFF_START_ALT_M = 80
export const CRUISE_ALT_M = 5
export const LANDING_END_ALT_M = 50

export const TAKEOFF_START_PITCH_DEG = -30
export const CRUISE_PITCH_DEG = -5
export const LANDING_END_PITCH_DEG = -45

// 巡航中の heading 計算で前方をどれだけ先読みするか。
// 小さいほど polyline の細かい屈曲に反応してカメラが左右に振れ、大きいほど均される。
export const CRUISE_BEARING_LOOKAHEAD_M = 30

export function smoothstep(p) {
  if (p <= 0) return 0
  if (p >= 1) return 1
  return p * p * (3 - 2 * p)
}

// 北基準・時計回り 0..360 度
export function bearingDegrees(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const λ1 = toRad(lon1)
  const λ2 = toRad(lon2)
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function precomputePath(polyline, options = {}) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    throw new Error('precomputePath: polyline must have at least 2 points')
  }
  const cruiseAltM = options.cruiseAltM ?? CRUISE_ALT_M
  const cruisePitchDeg = options.cruisePitchDeg ?? CRUISE_PITCH_DEG
  const bearingLookaheadM = Math.max(1, options.bearingLookaheadM ?? CRUISE_BEARING_LOOKAHEAD_M)
  const table = []
  let cum = 0
  table.push({ lon: polyline[0][0], lat: polyline[0][1], cum_m: 0 })
  for (let i = 1; i < polyline.length; i++) {
    const [lon0, lat0] = polyline[i - 1]
    const [lon, lat] = polyline[i]
    cum += haversineMeters(lat0, lon0, lat, lon)
    table.push({ lon, lat, cum_m: cum })
  }
  const totalDistanceM = cum
  const a = polyline[0]
  const b = polyline[polyline.length - 1]
  const abBearingDeg = bearingDegrees(a[1], a[0], b[1], b[0])
  const cruiseDurationS = totalDistanceM / CRUISE_SPEED_MPS
  const totalDurationS = TAKEOFF_DURATION_S + cruiseDurationS + LANDING_DURATION_S
  return {
    table,
    totalDistanceM,
    abBearingDeg,
    cruiseDurationS,
    cruiseAltM,
    cruisePitchDeg,
    bearingLookaheadM,
    takeoffDurationS: TAKEOFF_DURATION_S,
    landingDurationS: LANDING_DURATION_S,
    totalDurationS,
    cruiseStartLonLat: { lon: a[0], lat: a[1] },
    cruiseEndLonLat: { lon: b[0], lat: b[1] },
  }
}

export function samplePathAtDistance(table, d) {
  if (d <= 0) return { lon: table[0].lon, lat: table[0].lat }
  const last = table[table.length - 1]
  if (d >= last.cum_m) return { lon: last.lon, lat: last.lat }
  for (let i = 1; i < table.length; i++) {
    if (table[i].cum_m >= d) {
      const a = table[i - 1]
      const b = table[i]
      const span = b.cum_m - a.cum_m
      const t = span > 0 ? (d - a.cum_m) / span : 0
      return {
        lon: a.lon + (b.lon - a.lon) * t,
        lat: a.lat + (b.lat - a.lat) * t,
      }
    }
  }
  return { lon: last.lon, lat: last.lat }
}

export function bearingAtDistance(table, d, lookaheadM = 5) {
  const total = table[table.length - 1].cum_m
  // 前方 lookahead 地点を見る（終端近くは「終端-1m → 終端」で代替）
  let from = d
  let to = d + lookaheadM
  if (to > total) {
    to = total
    from = Math.max(0, total - lookaheadM)
  }
  const p1 = samplePathAtDistance(table, from)
  const p2 = samplePathAtDistance(table, to)
  return bearingDegrees(p1.lat, p1.lon, p2.lat, p2.lon)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// 2 つの度数方位（0..360）の最短補間（近い方向に回る）
function lerpBearingDeg(fromDeg, toDeg, t) {
  let diff = ((toDeg - fromDeg + 540) % 360) - 180 // -180..180
  return (fromDeg + diff * t + 360) % 360
}

export function computeFrame(ctx, t) {
  const cruiseEnd = TAKEOFF_DURATION_S + ctx.cruiseDurationS
  const total = ctx.totalDurationS

  // Complete phase
  if (t >= total) {
    return {
      phase: 'complete',
      lon: ctx.cruiseEndLonLat.lon,
      lat: ctx.cruiseEndLonLat.lat,
      heightM: LANDING_END_ALT_M,
      headingDeg: ctx.abBearingDeg,
      pitchDeg: LANDING_END_PITCH_DEG,
    }
  }

  // Takeoff: [0, TAKEOFF_DURATION_S)
  if (t < TAKEOFF_DURATION_S) {
    const p = smoothstep(t / TAKEOFF_DURATION_S)
    return {
      phase: 'takeoff',
      lon: ctx.cruiseStartLonLat.lon,
      lat: ctx.cruiseStartLonLat.lat,
      heightM: lerp(TAKEOFF_START_ALT_M, ctx.cruiseAltM, p),
      headingDeg: ctx.abBearingDeg,
      pitchDeg: lerp(TAKEOFF_START_PITCH_DEG, ctx.cruisePitchDeg, p),
    }
  }

  // Cruise: [TAKEOFF_DURATION_S, cruiseEnd)
  if (t < cruiseEnd) {
    const cruiseT = t - TAKEOFF_DURATION_S
    const d = Math.min(cruiseT * CRUISE_SPEED_MPS, ctx.totalDistanceM)
    const pos = samplePathAtDistance(ctx.table, d)
    const heading = bearingAtDistance(ctx.table, d, ctx.bearingLookaheadM ?? CRUISE_BEARING_LOOKAHEAD_M)
    return {
      phase: 'cruise',
      lon: pos.lon,
      lat: pos.lat,
      heightM: ctx.cruiseAltM,
      headingDeg: heading,
      pitchDeg: ctx.cruisePitchDeg,
    }
  }

  // Landing: [cruiseEnd, total)
  const p = smoothstep((t - cruiseEnd) / LANDING_DURATION_S)
  return {
    phase: 'landing',
    lon: ctx.cruiseEndLonLat.lon,
    lat: ctx.cruiseEndLonLat.lat,
    heightM: lerp(ctx.cruiseAltM, LANDING_END_ALT_M, p),
    headingDeg: lerpBearingDeg(ctx.abBearingDeg, ctx.abBearingDeg, p),
    pitchDeg: lerp(ctx.cruisePitchDeg, LANDING_END_PITCH_DEG, p),
  }
}

// ---------------------------------------------------------------------------
// Composition (point-list) 対応 API — Catmull-Rom スプライン + heading EMA
// ---------------------------------------------------------------------------

const COMPOSITION_SAMPLES_PER_SEGMENT = 32

// Uniform Catmull-Rom: t in [0,1] between p1 and p2.
// p0, p3 are surrounding control points (use phantom for endpoints).
function _crSpline1D(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

function _phantomPoint(near, neighbor) {
  return {
    lon: 2 * near.lon - neighbor.lon,
    lat: 2 * near.lat - neighbor.lat,
    altM: 2 * near.altM - neighbor.altM,
  }
}

/**
 * Sample a position on the polyline by cumulative distance d (meters).
 * Linear interpolation between adjacent table samples.
 * @param {Array} table — [{lon, lat, altM, cum_m, segIdx, segT}, ...]
 */
function _sampleCompositionAtDistance(table, d) {
  if (d <= 0) {
    const a = table[0]
    return { lon: a.lon, lat: a.lat, altM: a.altM, segIdx: a.segIdx, segT: a.segT }
  }
  const last = table[table.length - 1]
  if (d >= last.cum_m) {
    return { lon: last.lon, lat: last.lat, altM: last.altM, segIdx: last.segIdx, segT: last.segT }
  }
  // Binary search
  let lo = 0, hi = table.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (table[mid].cum_m <= d) lo = mid
    else hi = mid
  }
  const a = table[lo], b = table[hi]
  const span = b.cum_m - a.cum_m
  const t = span > 0 ? (d - a.cum_m) / span : 0
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    altM: a.altM + (b.altM - a.altM) * t,
    segIdx: a.segIdx,
    segT: a.segT + (b.segT - a.segT) * t,
  }
}

function _bearingAtCompositionDistance(table, d, lookaheadM) {
  const total = table[table.length - 1].cum_m
  let from = d, to = d + Math.max(1, lookaheadM)
  if (to > total) { to = total; from = Math.max(0, total - Math.max(1, lookaheadM)) }
  const p1 = _sampleCompositionAtDistance(table, from)
  const p2 = _sampleCompositionAtDistance(table, to)
  return bearingDegrees(p1.lat, p1.lon, p2.lat, p2.lon)
}

/**
 * Precompute path & timing for a Creator composition.
 * Uses Catmull-Rom interpolation between points to smooth corners.
 * Returns: { points, segments, hovers, totalDurationS, table, lookaheadM, tau }
 */
export function precomputeComposition(composition) {
  const points = composition.points.slice()
  const N = points.length
  if (N < 2) throw new Error('precomputeComposition: need at least 2 points')

  // Build dense polyline via Catmull-Rom
  const table = []  // { lon, lat, altM, cum_m, segIdx, segT }
  for (let i = 0; i < N - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : _phantomPoint(points[i], points[i + 1])
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i < N - 2 ? points[i + 2] : _phantomPoint(points[i + 1], points[i])
    const stepCount = (i === N - 2) ? COMPOSITION_SAMPLES_PER_SEGMENT + 1 : COMPOSITION_SAMPLES_PER_SEGMENT
    for (let j = 0; j < stepCount; j++) {
      const t = j / COMPOSITION_SAMPLES_PER_SEGMENT
      table.push({
        lon: _crSpline1D(p0.lon, p1.lon, p2.lon, p3.lon, t),
        lat: _crSpline1D(p0.lat, p1.lat, p2.lat, p3.lat, t),
        altM: _crSpline1D(p0.altM, p1.altM, p2.altM, p3.altM, t),
        segIdx: i,
        segT: t,
      })
    }
  }

  // Cumulative distance
  table[0].cum_m = 0
  for (let k = 1; k < table.length; k++) {
    const dx = haversineMeters(table[k - 1].lat, table[k - 1].lon, table[k].lat, table[k].lon)
    table[k].cum_m = table[k - 1].cum_m + dx
  }

  // Per-segment cumulative range + duration
  // - durationS が指定されていればそれを使い、speedKmh は逆算（表示・後方互換用）
  // - 未指定なら speedKmh から durationS を計算（旧データ互換）
  const DEFAULT_SPEED_KMH = 80
  const segments = composition.segments.map((s, i) => {
    let firstIdx = -1, lastIdx = -1
    for (let k = 0; k < table.length; k++) {
      if (table[k].segIdx === i) {
        if (firstIdx === -1) firstIdx = k
        lastIdx = k
      }
    }
    const startCum = firstIdx >= 0 ? table[firstIdx].cum_m : 0
    const endCum = lastIdx >= 0 ? table[lastIdx].cum_m : 0
    const distM = endCum - startCum
    let durationS, speedKmh
    if (typeof s.durationS === 'number' && s.durationS > 0) {
      durationS = s.durationS
      speedKmh = (distM / durationS) * 3.6  // 逆算（表示用）
    } else {
      speedKmh = typeof s.speedKmh === 'number' ? s.speedKmh : DEFAULT_SPEED_KMH
      const speedMps = (speedKmh * 1000) / 3600
      durationS = distM / Math.max(0.1, speedMps)
    }
    return { from: s.from, to: s.to, startCum, endCum, distM, speedKmh, durationS }
  })

  // Hover: 最初/最後の点は無視、中間点のみ
  const hovers = points.map((p, i) => {
    if (i === 0 || i === N - 1) return 0
    return Math.max(0, p.hoverS || 0)
  })

  let totalDurationS = 0
  for (let i = 0; i < segments.length; i++) {
    totalDurationS += segments[i].durationS
    if (i < segments.length - 1) totalDurationS += hovers[i + 1]
  }

  const g = composition.global || {}
  return {
    points,
    segments,
    hovers,
    totalDurationS,
    table,
    lookaheadM: g.lookaheadM ?? 30,
    tau: g.tau ?? 0.4,
    globalCornerRadiusM: g.cornerRadiusM,
  }
}

function _lerp(a, b, t) { return a + (b - a) * t }

/**
 * Compute camera frame at elapsed time t within a composition.
 * Position uses Catmull-Rom samples; heading uses lookahead bearing.
 * (EMA smoothing on heading is applied by viewer-pane.js, not here.)
 */
export function computeFrameComposition(ctx, t) {
  if (t <= 0) {
    const a = ctx.points[0]
    const head = _bearingAtCompositionDistance(ctx.table, 0, ctx.lookaheadM)
    return {
      phase: 'cruise',
      lon: a.lon, lat: a.lat, heightM: a.altM,
      pitchDeg: a.pitchDeg, headingRelDeg: a.headingRelDeg,
      headingAbsDeg: (head + a.headingRelDeg + 360) % 360,
    }
  }
  if (t >= ctx.totalDurationS) {
    const last = ctx.points[ctx.points.length - 1]
    const totalCum = ctx.table[ctx.table.length - 1].cum_m
    const head = _bearingAtCompositionDistance(ctx.table, totalCum, ctx.lookaheadM)
    return {
      phase: 'cruise',
      lon: last.lon, lat: last.lat, heightM: last.altM,
      pitchDeg: last.pitchDeg, headingRelDeg: last.headingRelDeg,
      headingAbsDeg: (head + last.headingRelDeg + 360) % 360,
    }
  }

  let cursor = 0
  for (let i = 0; i < ctx.segments.length; i++) {
    const seg = ctx.segments[i]
    const segEnd = cursor + seg.durationS
    if (t < segEnd) {
      const segT = (t - cursor) / seg.durationS
      const dInSeg = seg.startCum + (seg.endCum - seg.startCum) * segT
      const pos = _sampleCompositionAtDistance(ctx.table, dInSeg)
      const head = _bearingAtCompositionDistance(ctx.table, dInSeg, ctx.lookaheadM)
      const a = ctx.points[i], b = ctx.points[i + 1]
      const pitchDeg = _lerp(a.pitchDeg, b.pitchDeg, segT)
      const headingRelDeg = _lerp(a.headingRelDeg, b.headingRelDeg, segT)
      return {
        phase: 'cruise',
        lon: pos.lon, lat: pos.lat, heightM: pos.altM,
        pitchDeg, headingRelDeg,
        headingAbsDeg: (head + headingRelDeg + 360) % 360,
      }
    }
    cursor = segEnd
    // Hover at point i+1 (if not the last point)
    const hoverEnd = cursor + ctx.hovers[i + 1]
    if (t < hoverEnd && i + 1 < ctx.points.length - 1) {
      const p = ctx.points[i + 1]
      const head = _bearingAtCompositionDistance(ctx.table, ctx.segments[i].endCum, ctx.lookaheadM)
      return {
        phase: 'hover',
        lon: p.lon, lat: p.lat, heightM: p.altM,
        pitchDeg: p.pitchDeg, headingRelDeg: p.headingRelDeg,
        headingAbsDeg: (head + p.headingRelDeg + 360) % 360,
      }
    }
    cursor = hoverEnd
  }
  // Fallback (shouldn't reach)
  const last = ctx.points[ctx.points.length - 1]
  return {
    phase: 'cruise',
    lon: last.lon, lat: last.lat, heightM: last.altM,
    pitchDeg: last.pitchDeg, headingRelDeg: last.headingRelDeg,
    headingAbsDeg: 0,
  }
}
