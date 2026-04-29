// ★ Creator Mode の composition state ヘルパー / バリデーター
// ★ 全関数は immutable（引数を mutate せず新オブジェクトを返す）

import * as C from './constants.js'

const DEFAULT_SPEED_KMH = 80
const DEFAULT_DURATION_S = C.DEFAULT_DURATION_S

export function emptyComposition() {
  return {
    v: 1,
    name: '',
    global: {
      tau: 0.4,
      lookaheadM: 30,
      bufferM: 100,
      lod: 'lod2',
      cornerRadiusM: 20,
    },
    points: [],
    segments: [],
  }
}

export function nextPointId(points) {
  const used = new Set(points.map(p => p.id))
  // A〜Z
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i)
    if (!used.has(id)) return id
  }
  // A1〜Z99
  for (let letter = 65; letter < 65 + 26; letter++) {
    for (let n = 1; n < 100; n++) {
      const id = `${String.fromCharCode(letter)}${n}`
      if (!used.has(id)) return id
    }
  }
  throw new Error('point id exhausted')
}

function _withRebuiltSegments(comp) {
  const segments = []
  for (let i = 0; i < comp.points.length - 1; i++) {
    const existing = comp.segments.find(
      s => s.from === comp.points[i].id && s.to === comp.points[i + 1].id
    )
    // 既存は維持（speedKmh / durationS どちらでも）。新規は durationS デフォルト。
    segments.push(
      existing || { from: comp.points[i].id, to: comp.points[i + 1].id, durationS: DEFAULT_DURATION_S }
    )
  }
  return { ...comp, segments }
}

export function rebuildSegments(comp) {
  return _withRebuiltSegments(comp)
}

export function addPoint(comp, { lon, lat, altM = 50, pitchDeg = -10, headingRelDeg = 0 }) {
  const id = nextPointId(comp.points)
  const newPoints = [
    ...comp.points,
    { id, lon, lat, altM, pitchDeg, headingRelDeg, hoverS: 0, cornerRadiusM: null },
  ]
  return _withRebuiltSegments({ ...comp, points: newPoints })
}

export function removePoint(comp, id) {
  const newPoints = comp.points.filter(p => p.id !== id)
  return _withRebuiltSegments({ ...comp, points: newPoints })
}

export function resetPoints(comp) {
  return { ...comp, points: [], segments: [] }
}

export function movePoint(comp, id, delta) {
  const idx = comp.points.findIndex(p => p.id === id)
  if (idx < 0) return comp
  const target = idx + delta
  if (target < 0 || target >= comp.points.length) return comp
  const newPoints = [...comp.points]
  const [removed] = newPoints.splice(idx, 1)
  newPoints.splice(target, 0, removed)
  return _withRebuiltSegments({ ...comp, points: newPoints })
}

export function removeLastPoint(comp) {
  if (comp.points.length === 0) return comp
  const newPoints = comp.points.slice(0, -1)
  return _withRebuiltSegments({ ...comp, points: newPoints })
}

export function applyToAllPoints(comp, key, value) {
  const newPoints = comp.points.map(p => ({ ...p, [key]: value }))
  return { ...comp, points: newPoints }
}

export function applyToAllSegments(comp, key, value) {
  const newSegments = comp.segments.map(s => ({ ...s, [key]: value }))
  return { ...comp, segments: newSegments }
}

export function validateComposition(c) {
  if (!c || typeof c !== 'object') throw new Error('composition must be an object')
  if (c.v !== 1) throw new Error(`unsupported version: ${c.v}`)

  if (!Array.isArray(c.points) || c.points.length < 2) {
    throw new Error('points must have at least 2 entries')
  }
  if (c.points.length > C.MAX_POINTS) {
    throw new Error(`points exceeds MAX_POINTS=${C.MAX_POINTS}`)
  }

  const ids = c.points.map(p => p.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate point id')

  for (const p of c.points) {
    if (typeof p.lon !== 'number' || p.lon < -180 || p.lon > 180) throw new Error(`invalid lon: ${p.id}`)
    if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) throw new Error(`invalid lat: ${p.id}`)
    if (typeof p.altM !== 'number' || p.altM < C.MIN_ALT_M || p.altM > C.MAX_ALT_M) {
      throw new Error(`altM out of range at ${p.id}`)
    }
    if (typeof p.pitchDeg !== 'number' || p.pitchDeg < C.PITCH_MIN_DEG || p.pitchDeg > C.PITCH_MAX_DEG) {
      throw new Error(`pitchDeg out of range at ${p.id}`)
    }
    if (typeof p.headingRelDeg !== 'number' || Math.abs(p.headingRelDeg) > C.HEADING_REL_RANGE_DEG) {
      throw new Error(`headingRelDeg out of range at ${p.id}`)
    }
    if (p.hoverS != null && (p.hoverS < 0 || p.hoverS > C.MAX_HOVER_S)) {
      throw new Error(`hoverS out of range at ${p.id}`)
    }
    if (p.cornerRadiusM != null && (p.cornerRadiusM < 0 || p.cornerRadiusM > C.MAX_CORNER_RADIUS_M)) {
      throw new Error(`cornerRadiusM out of range at ${p.id}`)
    }
  }

  if (!Array.isArray(c.segments) || c.segments.length !== c.points.length - 1) {
    throw new Error(`segments length must be points-1`)
  }
  for (let i = 0; i < c.segments.length; i++) {
    const s = c.segments[i]
    if (s.from !== ids[i] || s.to !== ids[i + 1]) {
      throw new Error(`segments[${i}] must connect ${ids[i]}->${ids[i + 1]}`)
    }
    // durationS（推奨）と speedKmh（後方互換）のどちらか一方が必須。両方指定時は durationS 優先。
    const hasDuration = typeof s.durationS === 'number'
    const hasSpeed = typeof s.speedKmh === 'number'
    if (!hasDuration && !hasSpeed) {
      throw new Error(`segment ${i} requires durationS or speedKmh`)
    }
    if (hasDuration && (s.durationS < C.MIN_DURATION_S || s.durationS > C.MAX_DURATION_S)) {
      throw new Error(`durationS out of range at segment ${i}`)
    }
    if (hasSpeed && (s.speedKmh < C.MIN_SPEED_KMH || s.speedKmh > C.MAX_SPEED_KMH)) {
      throw new Error(`speedKmh out of range at segment ${i}`)
    }
  }

  if (!c.global || !C.VALID_LODS.includes(c.global.lod)) {
    throw new Error('invalid global.lod')
  }
  if (c.global.bufferM < C.MIN_BUFFER_M || c.global.bufferM > C.MAX_BUFFER_M) {
    throw new Error('global.bufferM out of range')
  }

  return c
}
