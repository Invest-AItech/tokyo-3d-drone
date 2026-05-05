// Topbar パネル
// - Play / Stop / Reset / Preview tiles / Save & Share / Export JSON / Import JSON / AI Prompt ボタンを描画
// - Save & Share: reCAPTCHA トークン取得 → POST /api/v1/compositions → URL クリップボードコピー + Toast
// - Export JSON: モーダルでテキストコピーまたはファイル DL
// - Import JSON: モーダルでテキストペーストまたはファイル選択
// - Reset: 点と区間をクリア（global 設定と地図/3D 視点は維持）
// - Preview tiles: 保存せずにタイルを取得して 3D Viewer に描画
// - AI Prompt: ChatGPT / Claude 等に貼るプロンプトをクリップボードコピー
import { saveAndShare, copyToClipboard, showToast, showToastWithCta, getRecaptchaToken } from '../share.js'
import { downloadJson, readJsonFile, exportComposition, importComposition } from '../io.js'
import { buildAIPrompt } from '../ai-prompt.js'

// Bundled sample presets (viewer/samples/*.json). i18n keys live in
// locales/{ja,en}.json under creator.samples_NN. Order matches file ID.
const SAMPLE_PRESETS = [
  { id: '01-skytree',       i18n: 'creator.samples_01', label: '01 · スカイツリー' },
  { id: '02-tokyo-tower',   i18n: 'creator.samples_02', label: '02 · 東京タワー' },
  { id: '03-shinjuku',      i18n: 'creator.samples_03', label: '03 · 新宿西口' },
  { id: '04-tokyo-station', i18n: 'creator.samples_04', label: '04 · 東京駅' },
  { id: '05-shibuya',       i18n: 'creator.samples_05', label: '05 · 渋谷駅前' },
]

const FIREBASE_LANDING = 'https://invest-aitech-tokyo-drone.web.app/'

export function mountTopbar(container, { state, actions, subscribe }) {
  const sampleOptions = SAMPLE_PRESETS.map(p =>
    `<option value="${p.id}" data-i18n="${p.i18n}">${p.label}</option>`
  ).join('')

  container.innerHTML = `
    <div class="topbar">
      <a class="topbar-back" href="${FIREBASE_LANDING}"
         title="トップページに戻る" data-i18n-attr-title="creator.backToLandingHint"
         aria-label="トップに戻る" data-i18n-attr-aria-label="creator.backToLanding">
        <span class="topbar-back__icon" aria-hidden="true">←</span>
        <span class="topbar-back__label" data-i18n="creator.backToLanding">トップ</span>
      </a>
      <span class="brand" aria-label="tokyo-3d-drone"><span class="brand__seg">tokyo</span><span class="brand__seg">-3d-</span><span class="brand__seg">drone</span></span>
      <div class="actions">
        <!-- グループA: 再生操作 -->
        <div class="btn-group">
          <button data-action="play" data-i18n="creator.play">▶ Play</button>
          <button data-action="stop" data-i18n="creator.stop">⏸ Stop</button>
          <button data-action="reset" data-i18n="creator.reset" title="点をすべてクリア (global 設定は維持)">⟲ Reset</button>
        </div>
        <div class="btn-group-sep"></div>
        <!-- グループB: 構図/表示 -->
        <div class="btn-group">
          <label class="sample-picker" title="プリセット構図を選択" data-i18n-attr-title="creator.loadSampleHint">
            <span class="sample-picker__visually-hidden" data-i18n="creator.loadSample">サンプルを読み込む</span>
            <select data-action="load-sample" class="sample-picker__select" aria-label="サンプル">
              <option value="" data-i18n="creator.samplePlaceholder">📂 サンプル…</option>
              ${sampleOptions}
            </select>
          </label>
          <button data-action="preview-tiles" data-tiles-state="needed" title="3D建物データを取得（Play前に必要）">🏙️ 建物を読込</button>
          <button data-action="toggle-polyline" class="toolbar-btn" aria-pressed="${state.showPolyline}"
                  title="経路の表示/非表示" data-i18n-title="creator.togglePolylineHint"><span data-i18n="creator.togglePolyline">⛓️ 経路</span></button>
          <button data-action="toggle-viewer-only" class="toolbar-btn" aria-pressed="${state.viewerOnly}"
                  title="3 画面表示／3D だけ表示の切替" data-i18n-attr-title="creator.toggleViewerOnlyHint"><span data-i18n="creator.toggleViewerOnly">🎬 3D のみ</span></button>
        </div>
        <div class="btn-group-sep"></div>
        <!-- グループC: データ操作 -->
        <div class="btn-group">
          <button data-action="ai-prompt" data-i18n="creator.aiPrompt" title="ChatGPT/Claude/Geminiで経路JSONを生成">🤖 AI Prompt</button>
          <button data-action="save" data-i18n="creator.save">Save &amp; Share</button>
          <button data-action="export" data-i18n="creator.export">Export JSON</button>
          <button data-action="import" data-i18n="creator.import">Import JSON</button>
        </div>
        <input type="file" data-action="import-file" accept="application/json,.json" hidden aria-label="JSON ファイルをインポート">
      </div>
    </div>
  `
  // i18n が後から init される場合に再 apply
  if (window.__i18nReady) window.__i18nReady.then(() => window.i18n?.applyToDom?.())

  const previewTilesBtn = container.querySelector('[data-action="preview-tiles"]')

  container.querySelector('[data-action="play"]').addEventListener('click', () => {
    const pts = state.composition.points.length
    if (pts === 0) {
      showToast('① 左マップをクリックして経路の点を追加してください')
      return
    }
    if (pts < 2) {
      showToast('点を 2 つ以上追加してから Play してください')
      return
    }
    if (!state.tilesLoaded) {
      showToastWithCta(
        '⚠️ 3D建物データが未読込です',
        '今すぐ 🏙️ 建物を読込',
        () => { actions.triggerPreviewTiles(); showToast('建物データを取得中...') }
      )
      return
    }
    actions.play()
  })
  container.querySelector('[data-action="stop"]').addEventListener('click', () => actions.stop())

  container.querySelector('[data-action="reset"]').addEventListener('click', () => {
    if (state.composition.points.length === 0) return
    showToastWithCta(
      'すべての点をリセットしますか？ (global 設定と地図視点は維持)',
      '✓ リセット実行',
      () => { actions.resetPoints(); showToast('点をリセットしました') }
    )
  })

  container.querySelector('[data-action="preview-tiles"]').addEventListener('click', async () => {
    if (state.composition.points.length < 2) {
      showToast('点を 2 つ以上追加してから押してください')
      return
    }
    showToast('タイルを取得中...')
    try {
      actions.triggerPreviewTiles()
    } catch (e) {
      showToast(`Preview に失敗: ${e.message}`)
    }
  })

  container.querySelector('[data-action="save"]').addEventListener('click', async () => {
    try {
      const token = await getRecaptchaToken('save_composition')
      const url = await saveAndShare(state.composition, { recaptchaToken: token })
      // clipboard write は save 後の async context で失敗することがあるため、
      // 成功・失敗いずれでも URL を toast に表示してユーザーが手動コピーできるようにする
      try {
        await copyToClipboard(url)
        showToast(`✅ 保存完了（URLをコピーしました）: ${url}`)
      } catch {
        showToast(`✅ 保存完了（URLを手動でコピーしてください）: ${url}`)
      }
    } catch (e) {
      showToast(`保存に失敗: ${e.message}`)
    }
  })

  container.querySelector('[data-action="export"]').addEventListener('click', () => {
    showExportModal(state.composition)
  })

  container.querySelector('[data-action="import"]').addEventListener('click', () => {
    showImportModal(actions)
  })

  // hidden file input: モーダル内の「ファイルから読み込む」ボタンからも参照される
  const fileInput = container.querySelector('[data-action="import-file"]')
  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const c = await readJsonFile(file)
      actions.loadComposition(c)
      showToast('読み込み完了')
      // モーダルが開いていたら閉じる
      document.getElementById('import-modal')?.remove()
    } catch (err) {
      showToast(`読み込み失敗: ${err.message}`)
    } finally {
      fileInput.value = ''  // 同じファイルを再選択できるようにリセット
    }
  })

  container.querySelector('[data-action="ai-prompt"]').addEventListener('click', () => {
    showAIPromptModal(state.composition)
  })

  // ポリライン表示 ON/OFF トグル
  const polylineBtn = container.querySelector('[data-action="toggle-polyline"]')
  polylineBtn.addEventListener('click', () => {
    actions.togglePolyline()
  })

  // 3D のみ表示トグル
  const viewerOnlyBtn = container.querySelector('[data-action="toggle-viewer-only"]')
  viewerOnlyBtn.addEventListener('click', () => {
    actions.toggleViewerOnly()
  })

  // サンプル読込ドロップダウン
  const sampleSelect = container.querySelector('[data-action="load-sample"]')
  sampleSelect.addEventListener('change', async (e) => {
    const id = e.target.value
    if (!id) return
    try {
      const res = await fetch(`/static/viewer/samples/${id}.json`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const comp = await res.json()
      actions.loadComposition(comp)
      const label = sampleSelect.options[sampleSelect.selectedIndex]?.textContent ?? id
      showToast(`サンプル: ${label.trim()}`)
    } catch (err) {
      showToast(`サンプル読込に失敗: ${err.message}`)
    } finally {
      // プレースホルダ option に戻す（再選択を許可）
      sampleSelect.value = ''
    }
  })

  // state 変化に応じて aria-pressed / Preview tiles の状態を更新
  subscribe(s => {
    polylineBtn.setAttribute('aria-pressed', String(s.showPolyline))
    viewerOnlyBtn.setAttribute('aria-pressed', String(s.viewerOnly))
    previewTilesBtn.dataset.tilesState = s.tilesLoaded ? 'loaded' : 'needed'
    previewTilesBtn.disabled = s.tilesLoading
    previewTilesBtn.textContent = s.tilesLoading ? '⏳ 読込中...' : '🏙️ 建物を読込'
  })
}

function showExportModal(composition) {
  const existing = document.getElementById('export-modal')
  if (existing) existing.remove()

  const json = exportComposition(composition)

  const modal = document.createElement('div')
  modal.id = 'export-modal'
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="export-modal-title">
      <header class="modal-header">
        <h2 id="export-modal-title">📤 Export composition</h2>
        <button class="modal-close" aria-label="閉じる">×</button>
      </header>
      <div class="modal-body">
        <p class="modal-hint">下のテキストをコピーするか、ファイルとして保存してください。</p>
        <textarea id="export-text" readonly></textarea>
      </div>
      <footer class="modal-footer">
        <button data-action="copy-export" class="btn-primary">📋 コピー</button>
        <button data-action="download-export">📥 ファイル DL</button>
        <button data-action="close-modal">閉じる</button>
      </footer>
    </div>
  `
  document.body.appendChild(modal)

  const textarea = modal.querySelector('#export-text')
  textarea.value = json

  const closeFn = () => modal.remove()
  modal.querySelector('.modal-close').addEventListener('click', closeFn)
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeFn)
  modal.addEventListener('click', (e) => { if (e.target === modal) closeFn() })

  modal.querySelector('[data-action="copy-export"]').addEventListener('click', async () => {
    try {
      await copyToClipboard(textarea.value)
      showToast('Composition JSON をコピーしました')
      closeFn()
    } catch (err) {
      showToast(`コピー失敗: ${err.message}`)
    }
  })

  modal.querySelector('[data-action="download-export"]').addEventListener('click', () => {
    const filename = (composition.name?.trim() || 'composition') + '.json'
    downloadJson(composition, filename)
    showToast(`ファイル DL: ${filename}`)
    closeFn()
  })
}

function showImportModal(actions) {
  const existing = document.getElementById('import-modal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.id = 'import-modal'
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="import-modal-title">
      <header class="modal-header">
        <h2 id="import-modal-title">📥 Import composition</h2>
        <button class="modal-close" aria-label="閉じる">×</button>
      </header>
      <div class="modal-body">
        <p class="modal-hint">JSON テキストをペーストするか、ファイルから読み込んでください。</p>
        <button data-action="open-file-picker" class="btn-secondary-block">📂 ファイルから読み込む</button>
        <p class="modal-divider">または</p>
        <textarea id="import-text" placeholder="ここに composition JSON を貼り付け…"></textarea>
      </div>
      <footer class="modal-footer">
        <button data-action="confirm-import" class="btn-primary">✅ 取り込む</button>
        <button data-action="close-modal">閉じる</button>
      </footer>
    </div>
  `
  document.body.appendChild(modal)

  const textarea = modal.querySelector('#import-text')
  const closeFn = () => modal.remove()
  modal.querySelector('.modal-close').addEventListener('click', closeFn)
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeFn)
  modal.addEventListener('click', (e) => { if (e.target === modal) closeFn() })

  // 「ファイルから読み込む」: 既存の hidden file input をクリック
  modal.querySelector('[data-action="open-file-picker"]').addEventListener('click', () => {
    document.querySelector('input[data-action="import-file"]')?.click()
    // ファイル input の change handler が処理 → 成功時にモーダルを閉じる
  })

  modal.querySelector('[data-action="confirm-import"]').addEventListener('click', () => {
    const text = textarea.value.trim()
    if (!text) {
      showToast('テキストが空です')
      return
    }
    try {
      const comp = importComposition(text)
      actions.loadComposition(comp)
      showToast('読み込み完了')
      closeFn()
    } catch (err) {
      showToast(`読み込み失敗: ${err.message}`)
    }
  })

  // テキストエリアにフォーカス
  textarea.focus()
}

function showAIPromptModal(composition) {
  // 既存モーダルがあれば閉じる
  const existing = document.getElementById('ai-prompt-modal')
  if (existing) existing.remove()

  const hasPoints = (composition.points?.length ?? 0) > 0

  function build(includeCurrent, recommended) {
    return buildAIPrompt(composition, { includeCurrent, recommended })
  }

  const modal = document.createElement('div')
  modal.id = 'ai-prompt-modal'
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="ai-prompt-title">
      <header class="modal-header">
        <h2 id="ai-prompt-title">🤖 AI Prompt</h2>
        <button class="modal-close" aria-label="閉じる">×</button>
      </header>
      <div class="modal-body">
        <p class="modal-hint">以下を ChatGPT / Claude / Gemini などに貼り付け、続けて作りたい composition を伝えてください。AI が JSON を返したら <strong>Import JSON</strong> ボタンで取り込めます。</p>
        <label class="modal-toggle">
          <input type="checkbox" id="ai-include-current" ${hasPoints ? 'checked' : ''} ${hasPoints ? '' : 'disabled'}>
          現在の編集内容を起点として含める${hasPoints ? '' : '（点が未追加のため利用不可）'}
        </label>

        <section class="prompt-pair">
          <header class="prompt-pair__head">
            <strong class="prompt-pair__title">① デフォルト</strong>
            <span class="prompt-pair__sub">最小プロンプト・トークン節約</span>
          </header>
          <textarea id="ai-prompt-text" readonly rows="5"></textarea>
          <button data-action="copy-prompt" class="btn-primary prompt-pair__copy">📋 デフォルトをコピー</button>
        </section>

        <section class="prompt-pair">
          <header class="prompt-pair__head">
            <strong class="prompt-pair__title">② おすすめ</strong>
            <span class="prompt-pair__sub">デフォルト + 30 点シネマティック詳細仕様書（精度↑・長文）</span>
          </header>
          <textarea id="ai-prompt-recommended" readonly rows="5"></textarea>
          <button data-action="copy-recommended" class="btn-primary prompt-pair__copy">📋 おすすめをコピー</button>
        </section>
      </div>
      <footer class="modal-footer">
        <button data-action="close-modal">閉じる</button>
      </footer>
    </div>
  `
  document.body.appendChild(modal)

  const textareaDefault = modal.querySelector('#ai-prompt-text')
  const textareaRecommended = modal.querySelector('#ai-prompt-recommended')

  function refresh() {
    const includeCurrent = modal.querySelector('#ai-include-current').checked
    textareaDefault.value = build(includeCurrent, false)
    textareaRecommended.value = build(includeCurrent, true)
  }
  refresh()

  modal.querySelector('#ai-include-current').addEventListener('change', refresh)

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove())
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })

  modal.querySelector('[data-action="copy-prompt"]').addEventListener('click', async () => {
    try {
      await copyToClipboard(textareaDefault.value)
      showToast('デフォルトプロンプトをコピーしました')
      modal.remove()
    } catch (err) {
      showToast(`コピー失敗: ${err.message}`)
    }
  })

  modal.querySelector('[data-action="copy-recommended"]').addEventListener('click', async () => {
    try {
      await copyToClipboard(textareaRecommended.value)
      showToast('おすすめプロンプトをコピーしました（精度↑）')
      modal.remove()
    } catch (err) {
      showToast(`コピー失敗: ${err.message}`)
    }
  })
}
