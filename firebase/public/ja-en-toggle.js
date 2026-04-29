(function () {
  const KEY = "tokyo3d_lang";
  const btn = document.getElementById("lang-toggle");

  function detectInitial() {
    const saved = localStorage.getItem(KEY);
    if (saved === "ja" || saved === "en") return saved;
    const url = new URLSearchParams(location.search).get("lang");
    if (url === "ja" || url === "en") return url;
    return navigator.language && navigator.language.startsWith("ja") ? "ja" : "en";
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-ja][data-en]").forEach(el => {
      el.textContent = el.getAttribute("data-" + lang);
    });
    if (btn) {
      btn.textContent = lang === "ja" ? "EN / 日本語" : "日本語 / EN";
    }
  }

  let current = detectInitial();
  apply(current);

  if (btn) {
    btn.addEventListener("click", () => {
      current = current === "ja" ? "en" : "ja";
      localStorage.setItem(KEY, current);
      apply(current);
    });
  }
})();
