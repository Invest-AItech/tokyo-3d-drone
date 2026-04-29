"""Creator Mode page handlers: /creator/ (SPA entry) and /creator/spec (docs)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["creator"])

_STATIC_DIR = Path(__file__).resolve().parents[1] / "static" / "creator"


@router.get("/creator/", include_in_schema=False)
@router.get("/creator", include_in_schema=False)
def creator_index() -> HTMLResponse:
    html = (_STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(content=html)


@router.get("/creator/spec", include_in_schema=False)
def creator_spec() -> HTMLResponse:
    md = (_STATIC_DIR / "spec.md").read_text(encoding="utf-8")
    samples_dir = _STATIC_DIR / "samples"
    sample_links_html = ""
    if samples_dir.exists():
        for f in sorted(samples_dir.glob("*.json")):
            sample_links_html += (
                f'<li><a href="/static/creator/samples/{f.name}" download>{f.stem}</a></li>'
            )
    body = f"""<!DOCTYPE html><html lang='ja'><head><meta charset='utf-8'>
<title>composition spec · Creator Mode</title>
<link rel='stylesheet' href='/static/css/creator.css'>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }}
  pre {{ background: #f6f8fa; padding: 1rem; border-radius: 6px; overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
  th, td {{ border: 1px solid #d1d5da; padding: 0.5rem; text-align: left; }}
  .actions {{ display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0; }}
  .actions button, .actions a {{ padding: 0.5rem 1rem; border: 1px solid #d1d5da; background: #fff; cursor: pointer; text-decoration: none; color: inherit; border-radius: 6px; }}
</style>
</head>
<body data-page='creator-spec'>
<h1>composition フォーマット仕様 v1</h1>
<div class="actions">
  <button id="copy-spec">📋 Spec を Markdown でコピー</button>
  <a href="/static/creator/samples/01-tokyo-station-to-tower.json" download>📥 空テンプレ JSON (= サンプル 01)</a>
  <a href="/creator/">← Creator Mode に戻る</a>
</div>
<h2>サンプル composition</h2>
<ul>{sample_links_html}</ul>
<hr>
<pre id="spec-md">{_html_escape(md)}</pre>
<script>
document.getElementById('copy-spec').addEventListener('click', async () => {{
  const md = document.getElementById('spec-md').textContent;
  try {{ await navigator.clipboard.writeText(md); alert('Spec を Markdown でコピーしました'); }}
  catch (e) {{ alert('コピーに失敗: ' + e.message); }}
}});
</script>
</body></html>"""
    return HTMLResponse(content=body)


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
