// AI Prompt builder for Creator Mode
// - buildAIPrompt(composition, options): AI に貼るプロンプト文字列を生成して返す
// - FIELD_SPEC, INVARIANTS: 仕様文字列（テスト・外部利用向け export）

import { exportComposition } from './io.js'

const SAMPLE_TOKYO_LINE = {
  v: 1,
  name: '東京駅→東京タワー（直線）',
  global: { tau: 0.4, lookaheadM: 30, bufferM: 100, lod: 'lod2', cornerRadiusM: 20 },
  points: [
    { id: 'A', lon: 139.7671, lat: 35.6812, altM: 80, pitchDeg: -10, headingRelDeg: 0 },
    { id: 'B', lon: 139.7454, lat: 35.6586, altM: 250, pitchDeg: -30, headingRelDeg: 0 },
  ],
  segments: [{ from: 'A', to: 'B', speedKmh: 80 }],
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
  segments: [
    { from: 'A', to: 'B', speedKmh: 60 },
    { from: 'B', to: 'C', speedKmh: 80 },
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
| speedKmh | num | 1–200 | 区間の巡航速度 |
`

export const INVARIANTS = `## 不変条件
- v: 1 固定
- points: 2 個以上、最大 50 個
- points[].id: 重複不可
- segments の長さ = points.length - 1、順序通りに連結
- 折れ線の総延長 ≤ 20km（東京 23 区横断くらい）
- 各値は範囲内
`

export function buildAIPrompt(composition, options = {}) {
  const includeCurrent = options.includeCurrent !== false  // default true

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

  return `あなたは tokyo-3d-drone (Composition Editor) の composition JSON 設計者です。
ユーザーの希望に沿って、以下の仕様に従って composition JSON を生成してください。

## 出力ルール
- JSON だけを返してください（説明文不要）
- \`\`\`json \`\`\` コードブロックで囲んで OK
- 仕様外のフィールドは追加しない
- 緯度経度は WGS84 (10 進)
- 東京 23 区範囲内が動作確認済み

${FIELD_SPEC}

${INVARIANTS}

${samples}

${currentSnapshot}

## あなたへの依頼

ユーザーが次に書く要望を読んで、上記仕様に従って 1 つの composition JSON を返してください。

ユーザーの要望:
`
}
