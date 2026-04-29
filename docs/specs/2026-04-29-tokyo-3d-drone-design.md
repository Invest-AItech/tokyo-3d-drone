# TOKYO 3D Drone — Phase 1 設計書

| 項目 | 値 |
|---|---|
| 作成日 | 2026-04-29 |
| 案件 | `10_projects/tokyo-3d-drone/` |
| 対象 Phase | Phase 1（新 3 部独立リリース） |
| Status | 設計確定・実装プラン作成待ち |
| 次ステップ | `superpowers:writing-plans` で実装プラン作成 |

---

## 1. ゴール

PLATEAU 3D 都市モデルを背景に、ユーザーが**多数の地点（最大 15-20 点）と各点の高さを指定**して**ドローン視点でカメラビューをシネマティックに描く** Web アプリを、既存の 1 部 `plateau-3d-app` および 2 部 `plateau-route-3d` から完全独立した第 3 部として独立リリースする。

「PLATEAU」名称は本文の出典記載（"PLATEAU データを使用しています" 等）でのみ使用し、タイトル・URL・repo 名・ホスト名からは除外する（誤認回避）。

## 2. 3 部作の位置付け

| 部 | 既存 ID | 新ブランド | 機能の本質 |
|---|---|---|---|
| 第 1 部 | plateau-3d-app | **TOKYO 3D View** | 1 点指定で周辺建物を立体表示 |
| 第 2 部 | plateau-route-3d | **TOKYO 3D Route** | 2 点 (AB) のルートを Google Routes API で取得しドローン視点で自動飛行 |
| **第 3 部 (新)** | **tokyo-3d-drone** | **TOKYO 3D Drone** | 多点 (15-20 点) + 高さ指定 + ユーザー設計のカメラワーク |
| 総称 | — | **TOKYO 3D Lab** | 3 部作の傘 |

第 1 部・第 2 部のリブランドは Phase 2/3 の対象（本書 §16 参照）。

## 3. スコープ（IN）

- v1 `repos/plateau-route-3d/src/app/static/creator/` 一式と関連 backend (`routes_creator.py` / `routes_compositions.py` / `composition_service.py`) をクリーンコピーで移植
- 新 GitHub repo / Cloud Run service / Firebase host の作成
- 共有掲示板（新 Firestore collection `drone_posts`）
- Drone → View / Route の cross-link（既存 URL を仮 link、Phase 2/3 で URL 更新）
- i18n（ja / en）, MapTiler 地図, Cesium ion PLATEAU-Terrain, Google Places API（場所検索）

## 4. スコープ（OUT — Phase 2-4）

- 第 1 部・第 2 部のリブランド、リポ・URL の切替
- 既存 v1 の `creator/` 削除と掲示板からの composition 投稿撤去
- `40_hp/src/data/projects.ts` の 3 link card 化
- `sister-app.js` の 3-way 完成（View / Route 側の更新）
- 3 アプリ landing デザインの最終総仕上げ

## 5. 命名規約（Phase 1 適用範囲）

| 区分 | 値 |
|---|---|
| 案件管理フォルダ | `10_projects/tokyo-3d-drone/` |
| ローカル repo | `20_repos/tokyo-3d-drone/` |
| GitHub repo | `Invest-AItech/tokyo-3d-drone` |
| Cloud Run service | `tokyo-3d-drone`（asia-northeast1） |
| Firebase host | `invest-aitech-tokyo-drone.web.app`（multi-site under `invest-aitech-financial`） |
| Firebase target エイリアス | `tokyo-drone` |
| Service Account | `tokyo-3d-drone-runtime@plateau-3d-app.iam.gserviceaccount.com`（新規発行） |
| Firestore collections | `drone_posts` / `drone_posts/{postId}/voters/{anonId}` / `drone_rate_limits/{ipHash}` |
| ローカルショートカット | `10_projects/tokyo-3d-drone/repo-tokyo-3d-drone.lnk` → `20_repos/tokyo-3d-drone/` |
| ブランド表示名 | **TOKYO 3D Drone** |
| 総称 | TOKYO 3D Lab |
| 衝突時 suffix | `-aitech`（GitHub repo 名 / Cloud Run service 名 / Firestore project ID 等が既に使われている場合のみ） |

GCP project ID `plateau-3d-app` は不変（Google 仕様）。ユーザー可視 URL には現れないので問題なし。GCS bucket・Service Account・Secret Manager 等の内部識別子に既存の `plateau-*` プレフィックスが残っても問題なし（CLAUDE.md と整合：「PLATEAU の名前は body 内の出典で OK、タイトル・URL から除外」）。

## 6. アーキテクチャ（Cloud Run + Firebase warmup pattern）

CLAUDE.md「アプリ作成ルール」に厳密準拠。

```
[User Browser]
     │
     ▼
[Firebase Hosting]                    https://invest-aitech-tokyo-drone.web.app/
  index.html (description-only)
   - hero + 説明セクション
   - <script> /warmup を { mode: "no-cors", cache: "no-store" } で発火
   - 「アプリを試す」ボタン → Cloud Run /start へ
   - aria-busy + 「起動中...」表示でコールドスタート体感対策
     │ button click
     ▼
[Cloud Run: tokyo-3d-drone]           https://tokyo-3d-drone-tcus2zi5tq-an.a.run.app/
  GET /warmup    → {"status":"warmed"}（軽い init のみ）
  GET /health    → {"status":"ok"}     （/healthz は GFE intercept で使えない）
  GET /          → 301 → https://invest-aitech-tokyo-drone.web.app/
  GET /start     → interactive landing（form / samples / preview map）
  GET /viewer/   → Cesium 本体（Drone カメラ編集 UI）
  POST /api/v1/compositions
  GET  /api/v1/compositions/{id}
  POST /api/v1/posts
  GET  /api/v1/posts
  POST /api/v1/posts/{id}/likes
  GET  /api/v1/places/{autocomplete,details}
  GET  /api/v1/datasets               （PLATEAU タイル一覧）
  GET  /api/config.js                 （MAPTILER_KEY / RECAPTCHA_SITE_KEY 配信）
     │
     ├─→ [GCS] PLATEAU 3D Tiles（v1 と共有 bucket、SA 権限のみ追加）
     ├─→ [Firestore] drone_posts（plateau-3d-app project 内に新コレクション）
     ├─→ [Cesium ion] PLATEAU-Terrain（asset 3258112、PLATEAU 公式公開トークン）
     ├─→ [MapTiler] streets-v2（既存 key 流用、Origin allowlist に新 URL 追加）
     ├─→ [Google Places API] （既存 google-places-api-key 流用）
     └─→ [reCAPTCHA Enterprise]（plateau-3d-app project で稼働、新 SA に Agent ロール付与）
```

### 共有リソース一覧

| リソース | 名前 | 流用方法 |
|---|---|---|
| GCP Project | `plateau-3d-app` | そのまま共用（不変） |
| GCS PLATEAU タイル bucket | (v1 既存名) | 新 SA に Storage Object Viewer 権限を付与 |
| Cesium ion access token | PLATEAU 公式公開トークン | コードに同じハードコード |
| MapTiler API key | Secret Manager `MAPTILER_API_KEY` | 新 SA に Secret Accessor、Origin allowlist に新 URL 追加 |
| Google Places API key | Secret Manager `google-places-api-key` | 新 SA に Secret Accessor |
| reCAPTCHA Enterprise | 同 project 内 | 新 SA に `roles/recaptchaenterprise.agent`、site key は新規発行を推奨（測定分離） |
| IP_HASH_SALT | Secret Manager `IP_HASH_SALT` | 新 SA に Secret Accessor（同一 salt） |

### 不要リソース（v1 から削除）

- Google Routes API key（Drone はルート検索しない、ユーザー指定多点を直接 Catmull-Rom 補間）
- `routes_route.py` / `routes_service.py`
- `height_offset_service.py`（v1 で常に 0 を返すスタブ。新 repo に持ち込まない）

## 7. Repo / フォルダ構造

```
20_repos/tokyo-3d-drone/
├── README.md
├── Dockerfile
├── requirements.txt
├── pyproject.toml
├── firebase.json
├── .firebaserc
├── firestore.rules                 # allow read,write: if false（Cloud Run 経由のみ）
├── firestore.indexes.json
├── firebase/
│   └── public/
│       ├── index.html              # description-only landing（warmup 発火 + CTA）
│       ├── style.css
│       └── ja-en-toggle.js
├── .github/
│   └── workflows/
│       └── deploy.yml              # main push → Cloud Run + Firebase auto deploy
├── docs/
│   ├── specs/
│   │   └── 2026-04-29-tokyo-3d-drone-design.md
│   └── handover/
└── src/
    ├── .env.example
    ├── app/
    │   ├── __init__.py
    │   ├── main.py                 # FastAPI app, route 登録, lifespan, static mount
    │   ├── server.py               # uvicorn entry（PORT env / 0.0.0.0 bind）
    │   ├── config.py               # Pydantic Settings
    │   ├── core/
    │   │   ├── composition_models.py
    │   │   ├── board_models.py
    │   │   ├── places_models.py
    │   │   └── config.py
    │   ├── api/
    │   │   ├── routes_health.py    # /health（NOT /healthz）
    │   │   ├── routes_warmup.py    # /warmup
    │   │   ├── routes_ui.py        # / → 301, /start, /viewer/, /api/config.js
    │   │   ├── routes_compositions.py
    │   │   ├── routes_creator.py
    │   │   ├── routes_board.py     # drone_posts collection
    │   │   ├── routes_places.py
    │   │   └── routes_datasets.py
    │   ├── services/
    │   │   ├── composition_service.py
    │   │   ├── board_service.py    # collection 名 = "drone_posts"
    │   │   ├── places_service.py
    │   │   ├── recaptcha_service.py
    │   │   └── tileset_service.py
    │   └── static/
    │       ├── landing.html        # /start のランディング（interactive）
    │       ├── viewer/             # creator/ をリネーム
    │       │   ├── index.html
    │       │   ├── app.js
    │       │   ├── composition.js
    │       │   ├── constants.js
    │       │   ├── io.js
    │       │   ├── loader.js
    │       │   ├── share.js
    │       │   ├── ai-prompt.js
    │       │   ├── style.css
    │       │   └── panels/
    │       │       ├── edit-pane.js
    │       │       ├── map-pane.js
    │       │       ├── topbar.js
    │       │       └── viewer-pane.js
    │       ├── samples/
    │       │   ├── 01-skytree.json
    │       │   ├── 02-tokyo-tower.json
    │       │   ├── 03-shinjuku.json
    │       │   ├── 04-tokyo-station.json
    │       │   └── 05-shibuya.json
    │       ├── locales/
    │       │   ├── ja.json
    │       │   └── en.json
    │       ├── js/
    │       │   ├── i18n.js          # plateau-3d-app マスター v1.0.0 と同期
    │       │   ├── map-tiles.js     # 同上
    │       │   ├── sister-app.js    # 3 アプリ URL 一元管理
    │       │   └── board.js
    │       ├── vendor/
    │       │   └── pako.esm.min.js
    │       ├── css/
    │       │   ├── lang-toggle.css  # Magenta グロー
    │       │   ├── cross-link.css   # Cyan アクセント（View/Route を匂わせる）
    │       │   └── i18n-en.css
    │       └── images/
    └── tests/
        ├── conftest.py
        ├── test_health.py
        ├── test_compositions.py
        ├── test_board.py
        ├── test_places.py
        └── tests-frontend/
            ├── package.json
            ├── package-lock.json
            ├── vitest.config.js
            └── *.test.js
```

## 8. ソース移植マップ（v1 → 新 repo）

**抽出元**: `repos/plateau-route-3d/`（v1 本体）。
**禁止**: `_paused/plateau-23ku-parallel-poc/`（旧 v2）からの参照・コピー（CLAUDE.md `_paused/` ルール）。

| v1 のパス | 新 repo のパス | 変更点 |
|---|---|---|
| `src/app/static/creator/*` | `src/app/static/viewer/*` | フォルダ名 `creator/` → `viewer/`（plateau-3d-app / plateau-route-3d との命名統一） |
| `src/app/static/js/i18n.js` | 同 | コピー（plateau-3d-app v1.0.0 マスターに同期維持） |
| `src/app/static/js/map-tiles.js` | 同 | コピー |
| `src/app/static/js/sister-app.js` | 同 | plateau-3d-app マスターからコピー後、`tokyo-3d-drone` 自身のエントリを追加。Phase 2/3 で URL 変更時は 3 アプリ間で同期更新（plateau-cross-link-i18n 案件で確立した運用ルール） |
| `src/app/static/js/board.js` | 同 | コピー |
| `src/app/static/vendor/pako.esm.min.js` | 同 | コピー |
| `src/app/api/routes_creator.py` | 同 | コピー |
| `src/app/api/routes_compositions.py` | 同 | コピー |
| `src/app/api/routes_board.py` | 同 | collection 参照を `posts` → `drone_posts` に切替 |
| `src/app/api/routes_places.py` | 同 | コピー |
| `src/app/api/routes_health.py` | 同 | コピー |
| `src/app/api/routes_warmup.py` | 同 | コピー |
| `src/app/api/routes_ui.py` | 同 | `/` の 301 redirect 先 / `/start` の HTML を差し替え |
| `src/app/api/routes_datasets.py` | 同 | コピー |
| `src/app/services/composition_service.py` | 同 | コピー |
| `src/app/services/board_service.py` | 同 | collection 名を `posts` → `drone_posts` に |
| `src/app/services/places_service.py` | 同 | コピー |
| `src/app/services/recaptcha_service.py` | 同 | コピー |
| `src/app/services/tileset_service.py` | 同 | コピー（GCS bucket は v1 と同名参照） |
| `src/app/main.py` / `server.py` / `config.py` | 同 | route 登録から `routes_route.py` を除外 |
| `firebase.json` / `.firebaserc` / `firestore.rules` / `firestore.indexes.json` | 同 | indexes は新 collection 名で再定義、project = invest-aitech-financial |
| `.github/workflows/deploy.yml` | 同 | service 名 / Secret 名置換（GOOGLE_ROUTES_API_KEY を削除） |

**移植しないファイル:**
- `src/app/api/routes_route.py`
- `src/app/services/routes_service.py`
- `src/app/services/height_offset_service.py`

**移植時の git 履歴**: クリーンコピー（履歴なし）。最初のコミットメッセージは `chore: initial commit (extracted from plateau-route-3d v1 creator/)`。

## 9. 掲示板（Drone Board）データモデル

Firestore（`plateau-3d-app` project 内）に新コレクション:

```
drone_posts/{postId}
  title:           string
  description:     string
  composition:     object   # {waypoints: [...], heights: [...], camera: {...}, version: 1}
  authorAnonId:    string   # Cookie arpd_aid から取得
  ipHash:          string
  likes:           number
  status:          "active" | "removed"
  createdAt:       Timestamp
  updatedAt:       Timestamp

  voters/{anonId}
    likedAt:       Timestamp

drone_rate_limits/{ipHash}
  posts:           [Timestamp, ...]   # 1 IP / 1 分 / 5 投稿
```

**Composite indexes** (`firestore.indexes.json`):
- `drone_posts: status ASC + likes DESC`（top クエリ）
- `drone_posts: status ASC + createdAt DESC`（recent クエリ）

**Firestore rules**: `allow read, write: if false;`（v1 同様、Cloud Run 経由のみ）。

**reCAPTCHA Enterprise**: 新 SA `tokyo-3d-drone-runtime` に `roles/recaptchaenterprise.agent` を付与。site key は新規発行（appごとの計測分離）。

**Phase 2 で v1 から移管する投稿**: v1 `posts` collection から `composition` フィールドを持つ投稿（= creator-typed）を抽出し `drone_posts` に複製する処理を Phase 2 内で実施（本 Phase では空のコレクションで開始）。

## 10. Cross-link 設定（Phase 1 時点）

`sister-app.js`（Drone repo 内）の URL マップ:

```js
const APPS = {
  'plateau-3d-app':   'https://invest-aitech-plateau-3d.web.app/',     // P3 で invest-aitech-tokyo-view.web.app に
  'plateau-route-3d': 'https://invest-aitech-route-3d.web.app/',       // P2 で invest-aitech-tokyo-route.web.app に
  'tokyo-3d-drone':   'https://invest-aitech-tokyo-drone.web.app/',
};
```

Drone の `landing.html` cross-link section: 第 1 部 (View) + 第 2 部 (Route) を `data-cross-link-target` で 2 カード並列で紹介。Phase 2/3 で URL が変わったタイミングで Drone 側も自動追従できるよう、`sister-app.js` を 3 アプリ間でコピー同期維持する運用ルールを継承（plateau-cross-link-i18n 案件で確立済）。

## 11. ブランディング詳細

| 要素 | 値 |
|---|---|
| ベース背景 | `#0a0e1a`（深ネイビー黒） |
| 主要書体 | JetBrains Mono（英数 / コード）+ Zen Kaku Gothic New（和文） |
| **プライマリアクセント** | **Magenta `#e879f9`** |
| セカンダリアクセント | Violet `#a78bfa`（hover / 補助情報） |
| 抑制色 | Cyan `#22d3ee`（opacity .4–.6 で cross-link 装飾のみ） |
| 警告 | Amber `#fbbf24` |
| エラー | Rose `#fb7185` |
| Kicker label テンプレ | `MISSION 03 · DRONE` |
| Hero copy（仮） | "TOKYO 3D Drone — 自分のカメラワークで東京を撮る" / "Compose your own cinematic drone shot over Tokyo" |
| 主要 UI 要素 | PLAY ボタン枠 / waypoint 連結線 / 進捗バー / kicker / アクティブ状態 を Magenta に統一 |
| マーカー色配分 | 始点 = Magenta `#e879f9` / 経由地 = Amber `#fbbf24` / 終点 = Cyan `#22d3ee` |

CSS:
- `lang-toggle.css` — `box-shadow: 0 0 16px rgba(232,121,249,.45)` 等の Magenta グロー
- `cross-link.css` — Cyan アクセントで View/Route を匂わせる
- `i18n-en.css` — 英語表示時の letter-spacing / word-break 微調整

実装フェーズで `frontend-design` skill を呼んで landing / viewer の polish、`web-design-guidelines` skill でアクセシビリティレビューを行う。

## 12. i18n / locales 設計

`src/app/static/locales/ja.json` と `en.json` を対称キーで配置（不一致は CI スクリプトで検証）。主要キー名前空間:

```
app.name                     # "TOKYO 3D Drone" / "TOKYO 3D Drone"
app.kicker                   # "MISSION 03 · DRONE"
landing.hero.title
landing.hero.cta             # "アプリを試す" / "Launch app"
landing.section.howitworks.*
landing.section.samples.*    # サンプル 5 種の name / subtitle
landing.section.community.*  # 掲示板紹介
landing.section.sister.*     # cross-link
viewer.panel.*
viewer.action.*
viewer.status.*
board.*
samples.0[1-5].name          # 構造化済（ja/en object）
samples.0[1-5].subtitle
errors.*
```

ブラウザ言語自動判定 + URL `?lang=en` + localStorage の plateau-cross-link-i18n 仕様を継承。`__i18nReady` await 必須。

## 13. Tests 戦略

| 種別 | ツール | 最低カバレッジ | 主な対象 |
|---|---|---|---|
| Backend unit/integration | pytest + httpx | 80%+ | endpoints / composition_service / board_service / places_service / recaptcha_service |
| Frontend unit | Vitest | 80%+ | composition.js / share.js / io.js / board.js / panels/*.js / i18n.js |
| Smoke | curl in CI | — | /health / /warmup / /api/config.js / /viewer/ |
| E2E（手動） | ブラウザ実機 | — | Phase 1 完了直前にチェックリスト消化 |

**初期コミット時の最低テスト本数**: pytest 30 本以上、Vitest 50 本以上（v1 から移植 + 新規）。

**TDD 適用箇所**:
- 新規 `drone_posts` collection の Firestore IO（board_service の collection 切替部分）
- `sister-app.js` の 3 way URL ビルド（追加分）
- drone-specific 演出ロジック（マーカー色サイクル / Magenta テーマ適用）

## 14. CI/CD

`.github/workflows/deploy.yml` を v1 から流用 + 置換:

```yaml
service: tokyo-3d-drone               # was plateau-route-3d
firebase-target: tokyo-drone           # was route-3d
secrets-mount:
  - MAPTILER_API_KEY=MAPTILER_API_KEY:latest
  - GOOGLE_PLACES_API_KEY=google-places-api-key:latest
  - IP_HASH_SALT=IP_HASH_SALT:latest
  # GOOGLE_ROUTES_API_KEY は削除
```

main push → pytest + vitest → Cloud Run deploy + Firebase deploy → smoke test。

## 15. Phase 1 完了判定（DoD）

- [ ] 新 GitHub repo `Invest-AItech/tokyo-3d-drone` 作成・main で初回 push 済
- [ ] CI 緑（pytest 80%+ / Vitest 80%+）
- [ ] Cloud Run service `tokyo-3d-drone` 稼働、`/health` 200、`/warmup` 200
- [ ] Firebase host `invest-aitech-tokyo-drone.web.app` で description-only landing 表示
- [ ] 「アプリを試す」ボタンから Cloud Run `/start` に遷移、Magenta テーマで viewer ロード
- [ ] サンプル 5 種が動作、ユーザー指定多点 + 高さでドローンカメラ補間が動作
- [ ] 掲示板に投稿・いいね・recaptcha が動作（`drone_posts` に書込確認）
- [ ] 場所検索（Places API）動作
- [ ] ja / en 切替動作、MapTiler 地名がロケール切替
- [ ] cross-link section が View（既存 plateau-3d-app）/ Route（既存 plateau-route-3d）へ遷移
- [ ] 案件管理フォルダ `10_projects/tokyo-3d-drone/` 完備（README + 引継ぎ書 + ショートカット `repo-tokyo-3d-drone.lnk`）
- [ ] プロジェクトメモリ `tokyo_3d_drone_project.md` 作成、`MEMORY.md` 索引に追記

## 16. 触れない範囲（明示）

- `_paused/plateau-23ku-parallel-poc/`（旧 plateau-route-3d_v2）— 参照・コピー禁止（CLAUDE.md `_paused/` ルール）
- `_paused/plateau-3d-visual/` — 同上
- `plateau-3d-app` 本体・`plateau-route-3d` 本体への改変は Phase 2/3 で実施（Phase 1 では一切触らない）
- v1 `posts` collection 内データは Phase 1 で読み書きしない（Phase 2 で composition 投稿移管）

## 17. 次フェーズ backlog

| Phase | スコープ | 着手条件 |
|---|---|---|
| **Phase 2** | `plateau-route-3d` → `tokyo-3d-route` リブランド（repo / Cloud Run / Firebase host）、`creator/` 削除、`routes_creator.py` / `composition_service.py` 削除、掲示板から composition 投稿撤去 or `drone_posts` への移管、説明画面から creator 紹介ブロック削除、旧 URL の sunset / 301 redirect | Phase 1 本番稼働確認後 |
| **Phase 3** | `plateau-3d-app` → `tokyo-3d-view` リブランド、掲示板新設（View 用 collection）、`sister-app.js` を 3-way 化（全アプリで反映、URL 一斉更新）、cross-link section 完成 | Phase 2 完了後 |
| **Phase 4** | `40_hp/src/data/projects.ts` を 3 link card 構成に書き換え、3 アプリ landing デザインの最終総仕上げ（frontend-design / web-design-guidelines）、各アプリのアクセントカラー差別化を最終調整、記事化（Qiita / Zenn、任意） | Phase 3 完了後 |

各 Phase は独立した spec → plan → impl サイクルで進行する。

## 18. 補足 — skills 活用

- **frontend-design** — landing.html / viewer の hero / section レイアウト・Magenta テーマの polish・サンプルカードの絵作り
- **web-design-guidelines** — アクセシビリティレビュー（コントラスト比 / aria 属性 / keyboard navigation）。Phase 1 完了直前に通す
- **superpowers:writing-plans** — 本書を入力に実装プランを生成（次セッションの開始点）
- **superpowers:test-driven-development** — drone_posts collection IO・sister-app.js 拡張・drone-specific 演出ロジックで適用
- **superpowers:executing-plans** — 実装プラン実行
