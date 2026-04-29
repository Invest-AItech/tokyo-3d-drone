// src/app/static/js/landing-bootstrap.js
// Drone landing は静的ページ（form / samples なし）。
// 旧 plateau-route-3d 由来の samples.js / form.js への import を撤去し、
// 必要時のみ glossary tooltip を初期化する no-op 寄りのブートストラップに整理した。

import { attachTooltips, renderGlossary } from "/static/js/glossary.js";

function mount() {
  attachTooltips(document);

  const glossaryTarget = document.getElementById("glossary-body");
  if (glossaryTarget) renderGlossary(glossaryTarget);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
