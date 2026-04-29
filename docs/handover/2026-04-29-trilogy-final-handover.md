# 2026-04-29 — TOKYO 3D Lab Trilogy 完成引継ぎ（Drone）

## 達成

- 全 3 アプリ（View / Route / Drone）本番稼働中
- 旧 plateau-* URL 廃止完了（404 化）
- HP（invest-aitech.com）が 3 link card に更新済み

## このアプリのスペック

| 項目 | 値 |
|---|---|
| 役割 | TOKYO 3D Lab 第 3 部（多点合成型ドローン視点） |
| Cloud Run | https://tokyo-3d-drone-tcus2zi5tq-an.a.run.app/ |
| Firebase | https://invest-aitech-tokyo-drone.web.app/ |
| GitHub | Invest-AItech/tokyo-3d-drone |
| アクセント | Magenta |
| 掲示板 | Firestore `drone_posts` collection（route 側とは別） |
| Routes API | **使わない**（道路追従なし、多点合成のみ） |
| 構図形式 | composition.spec.md (50 点まで) |

## 主要 commit（Phase 1 着地）

- `c6bb3ef` PlaceSearchDroneUI 統合
- `43a4390` Firebase description-only landing
- `84fad2d` deploy.yml (Cloud Run, no Routes API)
- `6140735` Drone リブランド（landing / viewer）
- `afb35f5` Hero アニメを 5 点 composition に
- `f4a5154` Routes API badge を Drone 実スタックに置換
- `53aa84c` /runtime マウント + lifespan 修正（黒画面対応）
- `01ec384` polyline 3D 化（clampToGround=false + arcType=NONE）
- `4a410a8` sister-app URL を View / Route の新 URL に整合

## 既知の懸念 / 次セッションでの確認事項

- **ブラウザ実機 E2E**（モバイル含む）はユーザー作業。Phase J で a11y は確認済みだが、複数端末 / 各国の挙動は未網羅
- 旧 `plateau-3d-app` GCS バケット (`plateau-3d-app-data`) 等は Drone でも使うため残置 OK
- 旧 Cloud Run service の cleanup（古い revision のガベージ）は未実施
- composition AI Prompt のプロンプトコピー仕様は spec 準拠だが、ユーザー学習効果の検証は次フェーズ
- Drone 専用掲示板はまだ投稿数 0 ベース、シードコンテンツの検討は次フェーズ

## やってはいけないこと

- Routes API を Drone に持ち込まない（多点合成専用、道路追従禁止）
- 旧 `plateau-route-3d/creator/` ディレクトリへの逆移植は禁止（route 側から削除済み）
- `_paused/plateau-23ku-parallel-poc/` は触らない
