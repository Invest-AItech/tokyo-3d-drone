// ★★★ Creator Mode の上限値はこのファイルで一元管理。
// ★★★ 変更したらバックエンド側 (src/app/core/composition_models.py) も合わせて更新すること。

export const MAX_POINTS = 50
export const MAX_TOTAL_DISTANCE_M = 20_000
export const MAX_BUFFER_M = 500
export const MIN_BUFFER_M = 50
export const MAX_SPEED_KMH = 200
export const MIN_SPEED_KMH = 1
export const MIN_DURATION_S = 0.1
export const MAX_DURATION_S = 600
export const DEFAULT_DURATION_S = 10  // 新規 segment は秒指定をデフォルト
export const MAX_ALT_M = 500
export const MIN_ALT_M = 1
export const MAX_HOVER_S = 10
export const MAX_CORNER_RADIUS_M = 200

export const PITCH_MIN_DEG = -89
export const PITCH_MAX_DEG = 45
export const HEADING_REL_RANGE_DEG = 180  // ±180

export const TAU_MIN = 0
export const TAU_MAX = 2
export const LOOKAHEAD_MIN_M = 5
export const LOOKAHEAD_MAX_M = 150

export const VALID_LODS = ['lod1', 'lod2', 'lod2_no_texture']
