// src/app/static/js/glossary.js
// 用語集の単一ソース。
// ランディングページ内で:
//   1) <abbr data-term="plateau"> の title 属性にツールチップを注入
//   2) 「07 用語集」セクションに <dt>/<dd> リストをレンダリング

export const GLOSSARY = {
  plateau: {
    term: "PLATEAU",
    short: "国交省の 3D 都市モデル整備プロジェクト",
    long:  "国土交通省が主導する、日本全国の都市を 3D データとして整備・オープンデータ化するプロジェクト。本アプリは PLATEAU の LOD1/LOD2 データを配信している。",
  },
  lod: {
    term: "LOD (Level of Detail)",
    short: "建物の詳細度。LOD1 は箱、LOD2 は屋根まで",
    long:  "Level of Detail の略。LOD1 は建物を単純な箱として表現、LOD2 は屋根の形状やテクスチャを含む。数字が大きいほど詳細だがデータ量も増える。",
  },
  "3d_tiles": {
    term: "3D Tiles / b3dm",
    short: "WebGL 向け 3D モデル配信規格",
    long:  "OGC 標準の大規模 3D シーン配信フォーマット。b3dm は 3D Tiles におけるバッチ化された建物タイルの形式。CesiumJS で直接読み込める。",
  },
  corridor: {
    term: "corridor",
    short: "複数点を結んだ回廊状の範囲指定モード",
    long:  "中心点 + 半径の円ではなく、複数の座標を結んだ折れ線の周辺（指定半径）を切り出すクエリモード。ルート沿いの建物だけ抜き出したいときに使う。",
  },
  cesium: {
    term: "CesiumJS",
    short: "WebGL で地球儀・3D 都市を描画するライブラリ",
    long:  "WebGL ベースのオープンソース 3D ビューアライブラリ。地球儀上にタイル、地形、3D モデルを重ねて表示できる。本アプリではビューア側で 3D Tiles を描画するために使用。",
  },
  gcs_fuse: {
    term: "GCS FUSE",
    short: "GCS バケットをファイルシステムとしてマウントする仕組み",
    long:  "Google Cloud Storage のバケットを Linux のディレクトリとしてマウントできる Google 公式の FUSE ドライバ。本アプリは Cloud Run インスタンスに GCS をマウントしてタイルデータを読む。",
  },
  wif: {
    term: "Workload Identity Federation",
    short: "サービスアカウント鍵なしで GCP を叩く認証機構",
    long:  "GCP の認証機構。サービスアカウントの秘密鍵 JSON をダウンロードせず、GitHub Actions などの外部 ID プロバイダから直接 GCP を叩ける。鍵漏洩リスクを下げる。",
  },
};

export function attachTooltips(root) {
  const nodes = root.querySelectorAll("abbr[data-term]");
  nodes.forEach((node) => {
    const key = node.getAttribute("data-term");
    const entry = GLOSSARY[key];
    if (!entry) return;
    if (!node.getAttribute("title")) {
      node.setAttribute("title", entry.short);
    }
  });
}

export function renderGlossary(targetEl) {
  const dl = document.createElement("dl");
  dl.className = "glossary-list";
  Object.values(GLOSSARY).forEach((entry) => {
    const dt = document.createElement("dt");
    dt.textContent = entry.term;
    const dd = document.createElement("dd");
    dd.textContent = entry.long;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  targetEl.replaceChildren(dl);
}
