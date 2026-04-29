// Cesium に依存しない純関数群。

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

// Catmull-Rom スプライン補間。
// pts: [[x, y], ...] (x = lon, y = lat の想定)
// sampleCount: 各隣接点間に挿入する中間点の数
// 出力: 元点 + 中間点をすべて並べた配列。始点と終点は元のまま。
export function catmullRomSpline(pts, sampleCount) {
  if (sampleCount === 0 || pts.length < 2) return pts.map((p) => [...p])
  const out = []
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? pts[i + 1]
    out.push([...p1])
    for (let j = 1; j <= sampleCount; j++) {
      const t = j / (sampleCount + 1)
      out.push(catmullRomPoint(p0, p1, p2, p3, t))
    }
  }
  out.push([...pts[n - 1]])
  return out
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ]
}
