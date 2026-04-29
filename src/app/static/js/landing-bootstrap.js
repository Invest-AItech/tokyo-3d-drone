// src/app/static/js/landing-bootstrap.js
// landing.html のインタラクティブ要素を初期化する。

import { SAMPLE_POINTS } from "/static/js/samples.js";
import { attachTooltips, renderGlossary } from "/static/js/glossary.js";
import { initForm } from "/static/js/form.js";

function renderSamples(target, formApi) {
  const frag = document.createDocumentFragment();
  SAMPLE_POINTS.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sample glass";
    btn.setAttribute("data-sample-id", s.id);
    btn.innerHTML = `
      <div class="thumb">${s.emoji}</div>
      <h3>${s.name}</h3>
      <p>${s.subtitle}</p>
    `;
    btn.addEventListener("click", () => {
      if (formApi && typeof formApi.applyPreset === "function") {
        formApi.applyPreset(s);
      }
      const tryEl = document.getElementById("try");
      if (tryEl) tryEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    frag.appendChild(btn);
  });
  target.replaceChildren(frag);
}

function mount() {
  attachTooltips(document);

  const glossaryTarget = document.getElementById("glossary-body");
  if (glossaryTarget) renderGlossary(glossaryTarget);

  const tryRoot = document.querySelector("#try .try-wrap");
  const formApi = tryRoot ? initForm(tryRoot) : null;

  const sampleGrid = document.getElementById("sample-grid");
  if (sampleGrid) renderSamples(sampleGrid, formApi);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
