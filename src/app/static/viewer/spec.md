# plateau-route-3d Creator Mode · composition フォーマット仕様 v1

このドキュメントは Creator Mode (`/viewer/`) で使用する composition JSON の仕様です。
あなた (AI) はこの仕様に従って `composition.json` を生成すれば、ユーザーがそのまま Creator にインポートして再生できます。

## 概要

- composition は v=1 の単一 JSON オブジェクト
- 最大 50 点 (`MAX_POINTS`)、折れ線総延長 20km (`MAX_TOTAL_DISTANCE_M`)
- 直線で点を繋ぎ、コーナーは半径指定で丸める
- 各点に高さ・俯角・進行方向相対角・hover 秒・コーナー半径
- 各区間に巡航速度 (km/h)
- グローバル設定: τ / lookahead / バッファ / LOD / デフォルトコーナー半径

## クイックスタート (最小の 2 点 composition)

```json
{
  "v": 1,
  "name": "東京駅→東京タワー",
  "global": { "tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20 },
  "points": [
    { "id": "A", "lon": 139.7671, "lat": 35.6812, "altM": 80, "pitchDeg": -10, "headingRelDeg": 0 },
    { "id": "B", "lon": 139.7454, "lat": 35.6586, "altM": 250, "pitchDeg": -30, "headingRelDeg": 0 }
  ],
  "segments": [
    { "from": "A", "to": "B", "speedKmh": 80 }
  ]
}
```

## フィールド全仕様

### トップレベル

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `v` | int | ✅ | スキーマバージョン。`1` 固定 |
| `_doc` | str | – | 仕様ページ URL（参考リンク。動作には影響しない） |
| `name` | str ≤80 | – | 表示用名称 |
| `author` | str ≤40 | – | 投稿者名（匿名 OK） |
| `createdAt` | ISO8601 | – | サーバ側で自動付与 |
| `global` | object | ✅ | 下記参照 |
| `points` | array | ✅ | 2〜50 個 |
| `segments` | array | ✅ | `points.length - 1` 個（順序連結） |

### `global`

| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| `tau` | num | 0–2 (秒) | カメラ向き平滑時定数 (EMA) |
| `lookaheadM` | num | 5–150 (m) | 進行方向の先読み距離 |
| `bufferM` | num | 50–500 (m) | PLATEAU タイル切り出しバッファ |
| `lod` | str | `lod1` / `lod2` / `lod2_no_texture` | タイル LOD |
| `cornerRadiusM` | num | 0–200 (m) | デフォルトコーナー丸め半径 |

### `points[]`

| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| `id` | str ≤8 | – | 重複不可。例: `A`〜`Z`、`A1`〜`A99` |
| `lon` / `lat` | num | WGS84 度 | 緯度経度 |
| `altM` | num | 1–500 (m) | 地表からの高度 |
| `pitchDeg` | num | -89〜45 (°) | 俯角（- が見下ろし） |
| `headingRelDeg` | num | -180〜180 (°) | 進行方向に対する相対角 (0 = 真正面) |
| `hoverS` | num | 0–10 (秒) | 通過時の空中静止秒（任意、既定 0） |
| `cornerRadiusM` | num \| null | 0–200 (m) | この点の丸め半径上書き（null → global） |

### `segments[]`

| フィールド | 型 | 範囲 | 説明 |
|---|---|---|---|
| `from` / `to` | str | `points[].id` を参照 | 必ず順序通り（A→B, B→C, ...） |
| `speedKmh` | num | 1–200 | 区間の巡航速度 |

## 不変条件

- `points` は 2 個以上、最大 `MAX_POINTS = 50`
- `points[].id` は重複不可
- `segments` は `points` を順番通りに連結（`points = [A, B, C]` なら `segments = [A→B, B→C]`）
- 折れ線の総延長 ≤ 20,000m
- 各境界値内

## AI への指示テンプレ

```
あなたは plateau-route-3d Creator Mode の composition JSON 設計者です。
ユーザーの希望に沿って、以下の仕様に従って composition JSON を生成してください。

仕様: <このページの URL またはこのページ全文>
制約:
  - 必ず "_doc" フィールドに仕様 URL を入れる
  - 緯度経度は WGS84
  - "v": 1 固定
  - 各点 / 各区間の境界値を超えない
  - 経由地は順番通り、segments は points と整合
出力: composition.json の中身だけを返す（コードブロックで囲む）
```

## 5 つのサンプル

各サンプルへのリンクは下のセクションで（spec.js が動的に表示）。

## 互換性ポリシー

- `v: 1` の後方互換は維持
- フィールド追加は許容
- 削除/型変更は `v: 2` で
