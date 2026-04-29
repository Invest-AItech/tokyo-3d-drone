// AI Prompt builder for Creator Mode
// - buildAIPrompt(composition, options): AI に貼るプロンプト文字列を生成して返す
// - options.recommended=true でシネマティック詳細仕様書 (RECOMMENDED_SPEC) を末尾に追加
// - FIELD_SPEC, INVARIANTS, RECOMMENDED_SPEC: 仕様文字列（テスト・外部利用向け export）

import { exportComposition } from './io.js'

const SAMPLE_TOKYO_LINE = {
  v: 1,
  name: '東京駅→東京タワー（直線）',
  global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
  points: [
    { id: 'A', lon: 139.7671, lat: 35.6812, altM: 80, pitchDeg: -10, headingRelDeg: 0 },
    { id: 'B', lon: 139.7454, lat: 35.6586, altM: 250, pitchDeg: -30, headingRelDeg: 0 },
  ],
  // durationS = 30 秒で AB 区間を飛ぶ（推奨）
  segments: [{ from: 'A', to: 'B', durationS: 30 }],
}

const SAMPLE_3POINT_HOVER = {
  v: 1,
  name: '皇居前→丸の内→東京駅（hover あり）',
  global: { tau: 0.4, lookaheadM: 30, bufferM: 150, lod: 'lod2', cornerRadiusM: 30 },
  points: [
    { id: 'A', lon: 139.7530, lat: 35.6850, altM: 60, pitchDeg: -10, headingRelDeg: 0 },
    { id: 'B', lon: 139.7634, lat: 35.6817, altM: 120, pitchDeg: -20, headingRelDeg: 0, hoverS: 2, cornerRadiusM: 50 },
    { id: 'C', lon: 139.7671, lat: 35.6812, altM: 100, pitchDeg: -15, headingRelDeg: 0 },
  ],
  // 区間ごとに durationS を秒で指定（推奨）
  segments: [
    { from: 'A', to: 'B', durationS: 15 },
    { from: 'B', to: 'C', durationS: 12 },
  ],
}

export const FIELD_SPEC = `## フォーマット仕様 v1

### トップレベル
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| v | int | ✅ | スキーマバージョン。1 固定 |
| name | str ≤80 | – | 表示用名称 |
| author | str ≤40 | – | 投稿者名（匿名 OK） |
| global | object | ✅ | 下記参照 |
| points | array | ✅ | 2〜50 個 |
| segments | array | ✅ | points.length - 1 個（順序連結） |

### global
| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| tau | num | 0–2 | カメラ向き平滑時定数 (秒) |
| lookaheadM | num | 5–150 (m) | 進行方向の先読み距離 |
| bufferM | num | 50–500 (m) | PLATEAU タイル切り出しバッファ |
| lod | str | "lod1" / "lod2" / "lod2_no_texture" | タイル LOD |
| cornerRadiusM | num | 0–200 (m) | デフォルトのコーナー丸め半径 |

### points[]
| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| id | str ≤8 | – | 重複不可。例: A〜Z, A1〜Z99 |
| lon / lat | num | WGS84 度 | 緯度経度 |
| altM | num | 1–500 (m) | 地表からの高度 |
| pitchDeg | num | -89〜45 (°) | 俯角（- が見下ろし） |
| headingRelDeg | num | -180〜180 (°) | 進行方向に対する相対角 (0 = 真正面) |
| hoverS | num | 0–10 (秒) | 通過時の空中静止秒（既定 0） |
| cornerRadiusM | num \\| null | 0–200 (m) | この点の丸め半径上書き（null → global） |

### segments[]
| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| from / to | str | points[].id を参照 | 必ず順序通り (A→B, B→C, ...) |
| durationS | num | 0.5–600 (秒) | 区間の所要時間（推奨）。指定時は速度より優先 |
| speedKmh | num | 1–200 (km/h) | 区間の巡航速度（durationS 未指定時に使う、後方互換） |

**注:** durationS と speedKmh のどちらか一方を必ず指定。新規生成では durationS を推奨（直感的に総尺を制御できる）。総尺 = 各区間の durationS の合計 + 各点の hoverS の合計。
`

export const INVARIANTS = `## 不変条件
- v: 1 固定
- points: 2 個以上、最大 50 個
- points[].id: 重複不可
- segments の長さ = points.length - 1、順序通りに連結
- 折れ線の総延長 ≤ 20km（東京 23 区横断くらい）
- 各値は範囲内
`

// 詳細仕様書（シネマティック・プリセット組み立て）。AI に渡すと 30 点プリセットの精度が上がる。
// 出典: 10_projects/tokyo-3d-drone/tokyo_drone_camera_spec.md
export const RECOMMENDED_SPEC = `# Tokyo PLATEAU ドローン｜シネマティック・プリセット組み立て仕様書

被写体（ランドマーク）を常に画角中心に収めつつ、目が回らない速度・滑らかな経路でドラマチックな映像を生成するための、30点プリセット構築ロジックを定義する。

---

## 1. 全体構成

各プリセットは **3フェーズ × 30点（29セグメント）** で構成される。

| フェーズ | 役割 | 点数 | セグ数 | 経路形状 |
|---|---|---|---|---|
| ① 接近 (Approach) | 遠方から被写体に直線で寄る | 8 (P01-P08) | 7 | 直線（target に向かう半径方向） |
| ② 旋回 (Orbit) | 被写体周囲を半周回りながら上昇 | 14 (P09-P22) | 13 | 円弧（半径一定・CCW・上昇） |
| ③ 引き (Pullback) | 旋回終点から外側へ直線で引く | 8 (P23-P30) | 7 | 直線（target から放射方向） |

**標準スペック**

- 速度 \`target_speed_mps\` = 40-42 m/s（≈ 144-152 km/h）
- 旋回スパン \`orbit_span\` = 180°（半周）
- 総時間 ≈ 24-26 秒/プリセット
- ホバー: P16（旋回中盤）と P22（旋回終了・最高点）に各 0.5 秒

---

## 2. 必須入力パラメータ

| パラメータ | 意味 | 標準値 |
|---|---|---|
| \`target = (lon, lat, alt)\` | 被写体の代表点（カメラが常に向く場所） | 建物の視覚的中心の高度 |
| \`approach_dir\` | 接近フェーズでドローンが進む方位（°、北=0、東=90、CW） | 0/90/180/270 |
| \`approach_far\` | 接近開始点と target の水平距離（m） | 200-320 |
| \`approach_near\` | 接近終了点と target の水平距離（m） | \`orbit_R + 25\` |
| \`alt_lo_app\`, \`alt_hi_app\` | 接近の開始・終了高度（m） | 例 25 → 200 |
| \`orbit_R\` | 旋回半径（m） | 130-160 |
| \`orbit_start_theta\` | 旋回開始角（°、target基準、北=0、東=90） | \`approach_dir + 180\` |
| \`orbit_span\` | 旋回角度量（°、CCW） | **180** |
| \`orbit_alt_lo\`, \`orbit_alt_hi\` | 旋回の開始・終了高度（m） | 例 280 → 470 |
| \`pullback_dir\` | 引きフェーズの方位（target から見た外向き方向、°） | \`orbit_start_theta - orbit_span\` |
| \`pullback_far\` | 引き終了点と target の水平距離（m） | 380-480 |
| \`pullback_alt_hi\`, \`pullback_alt_lo\` | 引きの開始・終了高度（m） | 例 470 → 440 |

---

## 3. 連続性の制約（**最重要・経路スムージングの核**）

経路の急反転（"目が回る"原因）を防ぐため、以下 3 条件を必ず満たす。

### 制約 A: 接近終端と旋回開始端の方位を揃える

\`\`\`
orbit_start_theta = (approach_dir + 180) mod 360
\`\`\`

これによりドローンは接近の進行方向と同じ向きのまま旋回円に乗る。

### 制約 B: 接近終端は旋回円の **外側** に置く

\`\`\`
approach_near > orbit_R    （標準は approach_near = orbit_R + 25）
\`\`\`

\`approach_near < orbit_R\` だとドローンは P08→P09 で逆走することになり、ヘディングが 180° 反転して目が回る。\`approach_near = orbit_R\` だと点が重複して bearing 計算が破綻する。

### 制約 C: 引きは旋回終点から放射方向に外側へ伸びる

\`\`\`
orbit_end_theta = orbit_start_theta - orbit_span
pullback_dir    = orbit_end_theta
\`\`\`

引き経路は旋回終点位置から、target を起点にした放射方向にそのまま外側へ向かう。これにより旋回→引きの切り替えで急な進行方向変更が起きない。

---

## 4. ジオメトリ計算

### 基本ヘルパー

\`\`\`
lat_per_m()              = 1 / 111000
lon_per_m(lat_deg)       = 1 / (111000 * cos(lat_deg))

offset(c_lon, c_lat, east_m, north_m):
    return (c_lon + east_m * lon_per_m(c_lat),
            c_lat + north_m * lat_per_m())

orbit_point(c_lon, c_lat, R, theta_deg):
    th = radians(theta_deg)
    east_m  = R * sin(th)     # theta=90 は東
    north_m = R * cos(th)     # theta=0  は北
    return offset(c_lon, c_lat, east_m, north_m)

bearing(lon1, lat1, lon2, lat2):  # 北=0、東=90、CW、°、戻り値 0-360
    球面公式（standard great-circle bearing）

dist3d(p1, p2):  # 緯度経度高度から3D距離（m）
    水平距離（メートル変換） + 高度差を Pythagoras

pitch_to(cam_alt, tgt_alt, horiz):
    p = degrees(atan2(tgt_alt - cam_alt, horiz))
    return clamp(p, -89, +45)
\`\`\`

### フェーズ1: 接近 (P01-P08, 8点)

\`\`\`
opp_rad = radians(approach_dir + 180)
for i in 0..7:
    t = i / 7
    d = approach_far + (approach_near - approach_far) * t   # 線形に近づく
    lon, lat = offset(tgt_lon, tgt_lat,
                      d * sin(opp_rad), d * cos(opp_rad))
    alt = alt_lo_app + (alt_hi_app - alt_lo_app) * t        # 線形に上昇
    P[i+1] = {lon, lat, alt}
\`\`\`

### フェーズ2: 旋回 (P09-P22, 14点)

\`\`\`
for i in 0..13:
    t = i / 13
    theta = orbit_start_theta - orbit_span * t              # CCW（θ減少）
    lon, lat = orbit_point(tgt_lon, tgt_lat, orbit_R, theta)
    alt = orbit_alt_lo + (orbit_alt_hi - orbit_alt_lo) * t  # 線形に上昇
    P[i+9] = {lon, lat, alt}
\`\`\`

### フェーズ3: 引き (P23-P30, 8点)

\`\`\`
oe_theta = orbit_start_theta - orbit_span
oe_lon, oe_lat = orbit_point(tgt_lon, tgt_lat, orbit_R, oe_theta)  # 旋回終点 = P22

pb_rad = radians(pullback_dir)
pf_lon, pf_lat = offset(tgt_lon, tgt_lat,
                        pullback_far * sin(pb_rad), pullback_far * cos(pb_rad))

for i in 0..7:
    t = (i + 1) / 8
    lon = oe_lon + (pf_lon - oe_lon) * t                    # P22 → 引き終端へ線形補間
    lat = oe_lat + (pf_lat - oe_lat) * t
    alt = pullback_alt_hi + (pullback_alt_lo - pullback_alt_hi) * t
    P[i+23] = {lon, lat, alt}
\`\`\`

ポイント: 引きの「開始点」は orbit_R の位置ではなく **P22 そのもの** から線形補間する。これで P22→P23 が物理的に連続になる。

---

## 5. カメラ角度計算 (aim_at)

各点の \`pitchDeg\`（俯仰）と \`headingRelDeg\`（進行方向に対する相対方位）を、カメラが常に target を向くよう自動計算する。

### Pitch（俯仰角）

\`\`\`
dx = (target.lon - p.lon) / lon_per_m(p.lat)              # 東向きメートル
dy = (target.lat - p.lat) / lat_per_m()                   # 北向きメートル
horiz = sqrt(dx² + dy²)
p.pitchDeg = pitch_to(p.altM, target.alt, horiz)          # -89..+45 クランプ
\`\`\`

正値=見上げ、負値=見下ろし。

### Heading（相対ヘディング）

進行方位 (\`travel_bearing\`) と target 方位 (\`bearing_to_target\`) の差。

\`\`\`
bearing_to_target = bearing(p.lon, p.lat, target.lon, target.lat)
headingRelDeg     = wrap_180(bearing_to_target - travel_bearing)
\`\`\`

\`wrap_180(x)\` は \`(x + 540) mod 360 - 180\` で -180..+180 に正規化。

### Travel bearing のスムージング（**目が回る対策の核**）

各点の進行方位は **隣接2セグメントの方位の循環平均** を使う。NEXT 点だけに依存させると、フェーズ切替点（P08→P09 や P22→P23）で進行方向が急変したとき、ヘディングが 90°以上スイングして酔う。

\`\`\`
seg_b[i] = bearing(P[i] → P[i+1])  for i in 0..n-2

avg_bearing(b1, b2):  # 循環平均（角度の平均は単純な算術平均では NG）
    x = cos(b1) + cos(b2)
    y = sin(b1) + sin(b2)
    return atan2(y, x)  # 度に変換、0-360 正規化

for each point P[i]:
    if i == 0:        travel_b = seg_b[0]
    elif i == n-1:    travel_b = seg_b[-1]
    else:             travel_b = avg_bearing(seg_b[i-1], seg_b[i])
\`\`\`

これでフェーズ境界の最大ヘディングジャンプが 180° → ~48° に抑えられる。残りの 48° は \`tau\` と \`cornerRadiusM\` で吸収させる。

---

## 6. 時間配分（速度ベース）

各セグメントの所要時間は **目標速度から逆算** する。

\`\`\`
for i in 0..n-2:
    d = dist3d(P[i], P[i+1])                # 3D距離
    duration[i] = clamp(d / target_speed_mps, 0.5, 600)
\`\`\`

これによりドローンは経路全体を一定速で進む（カメラが安定）。総時間は3D距離合計 ÷ 速度で予測できる。

**経験則**

| 速度 | 印象 |
|---|---|
| < 25 m/s (90 km/h) | のんびり・ドキュメンタリー |
| 30-45 m/s (108-162 km/h) | **シネマティック・推奨レンジ** |
| > 55 m/s (200 km/h) | 速すぎ・酔う |

---

## 7. 被写体クランプ回避（"画角に入っていない" 対策）

\`pitch_to\` が +45°（見上げ上限）でクランプされると、被写体の上部が画角外に出る。クランプを発生させない設計が必要。

### 物理的に必要な条件

任意の経路点 (cam_alt, horiz_dist) で target_alt を見込むとき：

\`\`\`
要求される pitch = atan2(target.alt - cam_alt, horiz_dist)
これが ≤ +45° になる必要 → (target.alt - cam_alt) ≤ horiz_dist
\`\`\`

つまり「水平距離 ≥ 高度差」が常に成り立つように設計する。

### 高い建造物（>500m）の扱い

スカイツリー (634m) のような超高層は、低高度（<50m）から接近すると必ずクランプする。

**対策**:
1. **target.alt をミッドポイント** に置く（最頂部ではなく中央付近、例: 350m）
2. 開始高度を **底上げ**（例 alt_lo_app = 80m、ビル屋上越え）
3. 接近距離 \`approach_far\` を **大きく**（>=300m）
4. 旋回半径 \`orbit_R\` を **大きく**（>=160m）で、orbit_alt の中央付近で pitch≈0° になるようバランス

### 一般的なバランス

| 被写体高さ | target.alt | alt_lo_app | approach_far | orbit_R |
|---|---|---|---|---|
| <50m（東京駅） | 30m | 25m | 240 | 140 |
| 100-150m（橋塔・大型ビル） | 90-100m | 10-25m | 240-300 | 140-160 |
| 200-350m（タワー・都庁） | 160-200m | 25m | 240 | 140 |
| 600m+（スカイツリー） | 350m | 80m | 320 | 160 |

---

## 8. グローバルパラメータ

JSON の \`global\` 部に設定する。実行時のカメラ補間挙動を制御。

| キー | 役割 | 推奨値 |
|---|---|---|
| \`tau\` | カメラ姿勢の追従遅延（秒）。大きいほどスムーズだが反応鈍い | 0.7-0.8 |
| \`lookaheadM\` | カメラ先読み距離（m） | 25-30 |
| \`bufferM\` | 衝突回避バッファ。被写体サイズ + 余裕 | 220-280 |
| \`lod\` | PLATEAU 詳細度 | "lod2" |
| \`cornerRadiusM\` | 経路コーナー丸め半径。フェーズ境界のヘディング48°ジャンプを物理的に滑らかにする | 50 |

---

## 9. 出力スキーマ要約

\`\`\`json
{
  "v": 1,
  "name": "...",
  "author": "...",
  "global": { "tau": 0.8, "lookaheadM": 30, "bufferM": 260, "lod": "lod2", "cornerRadiusM": 50 },
  "points": [
    { "id": "P01", "lon": ..., "lat": ..., "altM": ...,
      "headingRelDeg": ...,  // -180..+180、0=進行方向
      "pitchDeg": ...,       // -89..+45、正=見上げ
      "hoverS": 0.5          // 任意、0-10
    },
    ...
  ],
  "segments": [
    { "from": "P01", "to": "P02", "durationS": 0.7 },
    ...
  ]
}
\`\`\`

**ハードリミット**

- 30点 / 29セグメント
- altM: 1-500
- pitchDeg: -89..+45
- headingRelDeg: -180..+180
- durationS: 0.5-600
- hoverS: 0-10
- 経路総距離 ≤ 20km
- 東京23区内

---

## 10. 設計フロー（AIが新プリセットを作るときの手順）

1. **被写体決定**: lon, lat, 視覚的中心高度 (\`target.alt\`)
2. **接近方向選定**: ストーリー的に望ましい方向 → \`approach_dir\`（例: 川面から見上げ → 川がある方角）
3. **旋回開始角を従属決定**: \`orbit_start_theta = (approach_dir + 180) mod 360\`（**制約A**）
4. **引き方向を従属決定**: \`pullback_dir = orbit_start_theta - 180\`（**制約C**、旋回180°前提）
5. **半径・距離決定**:
   - \`orbit_R\` を被写体高度と500m高度上限から逆算（§7のバランス表参照）
   - \`approach_near = orbit_R + 25\`（**制約B**）
   - \`approach_far = orbit_R + 140〜180\`
   - \`pullback_far = orbit_R + 240〜320\`
6. **高度プロファイル決定**:
   - \`alt_lo_app\`: 開始高度（>0、低空ドラマか高空俯瞰か）
   - \`alt_hi_app = orbit_alt_lo - 40\`: 接近終了は旋回開始より少し低く
   - \`orbit_alt_hi\`: クライマックス高度、500を超えない範囲で被写体より上
   - \`pullback_alt_hi = orbit_alt_hi\`、\`pullback_alt_lo\` は微増 or 微減
7. **目標速度設定**: \`target_speed_mps = 40-42\`
8. **ジオメトリ生成**: §4 の式で30点を計算
9. **カメラ角度自動計算**: §5 の \`aim_at\` を全点に適用
10. **時間計算**: §6 で各セグメントの \`durationS\` を確定
11. **検証**:
    - すべての点で \`-89 ≤ pitchDeg ≤ +45\` かつクランプ無し（あれば §7 で再調整）
    - 隣接点間ヘディングジャンプ ≤ 50°
    - 総時間 22-28s
    - altM 全点 ≤ 500
12. **ホバー追加**: P16 と P22 に \`hoverS: 0.5\`
13. **\`global\` 設定**: §8 推奨値、\`bufferM\` のみ被写体サイズに合わせて調整

---

## 11. パラメータ実例（5プリセット）

| # | 被写体 | target.alt | approach_dir | approach_far/near | orbit_R | orbit_start_theta | orbit_alt_lo→hi | pullback_dir | pullback_far | speed |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 東京スカイツリー (634m) | 350 | 0 (北行き) | 320/185 | 160 | 180 (南) | 280→470 | 0 (北) | 420 | 42 |
| 2 | 東京タワー (333m) | 200 | 270 (西行き) | 240/165 | 140 | 90 (東) | 230→420 | 270 (西) | 400 | 40 |
| 3 | 都庁 (243m) | 160 | 0 (北行き) | 240/165 | 140 | 180 (南) | 210→400 | 0 (北) | 400 | 40 |
| 4 | レインボーブリッジ (120m) | 90 | 180 (南行き) | 300/185 | 160 | 0 (北) | 100→240 | 180 (南) | 480 | 42 |
| 5 | 東京駅 (45m) | 30 | 90 (東行き) | 240/165 | 140 | 270 (西) | 140→380 | 90 (東) | 400 | 40 |

すべて \`orbit_span=180\`、\`tau=0.7-0.8\`、\`cornerRadiusM=50\`、ホバー P16/P22 に 0.5s。総時間 24-26 秒。
`

export function buildAIPrompt(composition, options = {}) {
  const includeCurrent = options.includeCurrent !== false  // default true
  const recommended = options.recommended === true

  const samples = `## サンプル

### サンプル 1: 最小の 2 点 (東京駅→東京タワー)
\`\`\`json
${JSON.stringify(SAMPLE_TOKYO_LINE, null, 2)}
\`\`\`

### サンプル 2: 3 点 + hover (皇居前→丸の内→東京駅)
\`\`\`json
${JSON.stringify(SAMPLE_3POINT_HOVER, null, 2)}
\`\`\`
`

  const currentSnapshot = includeCurrent && composition && (composition.points?.length ?? 0) > 0
    ? `## 現在の編集中の composition (起点として参考にしてよい)
\`\`\`json
${exportComposition(composition)}
\`\`\`
`
    : `## 現在の編集中の composition
（まだ点を追加していません。最初から作成してください）
`

  const basePrompt = `あなたは tokyo-3d-drone (Composition Editor) の composition JSON 設計者です。
ユーザーの希望に沿って、以下の仕様に従って composition JSON を生成してください。

## 出力ルール
- JSON だけを返してください（説明文不要）
- \`\`\`json \`\`\` コードブロックで囲んで OK
- 仕様外のフィールドは追加しない
- 緯度経度は WGS84 (10 進)
- 東京 23 区範囲内が動作確認済み
- 区間タイミングは **durationS（秒）** を優先して指定する（直感的かつ総尺を意図通りに制御できる）。\`speedKmh\` も使えるが後方互換用。

${FIELD_SPEC}

${INVARIANTS}

${samples}

${currentSnapshot}

## あなたへの依頼

ユーザーが次に書く要望を読んで、上記仕様に従って 1 つの composition JSON を返してください。

ユーザーの要望:
`

  if (!recommended) return basePrompt

  // おすすめプロンプト = デフォルト + 詳細仕様書（30 点シネマティック・プリセット組み立てロジック）
  return `${basePrompt}

---

## 追加: シネマティック・プリセット詳細仕様書（30 点構成・推奨）

以下は「目が回らない・被写体を画角中心に保つ」プリセットを安定して作るための詳細仕様。
30 点（接近 8 + 旋回 14 + 引き 8）で被写体を周回・俯瞰するシネマ構図。
**この仕様書に従って 30 点プリセットを返すと精度が大幅に上がる。**

${RECOMMENDED_SPEC}
`
}
