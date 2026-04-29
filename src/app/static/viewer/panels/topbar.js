// Topbar パネル
// - Play / Stop / Reset / Preview tiles / Save & Share / Export JSON / Import JSON / AI Prompt ボタンを描画
// - Save & Share: reCAPTCHA トークン取得 → POST /api/v1/compositions → URL クリップボードコピー + Toast
// - Export JSON: モーダルでテキストコピーまたはファイル DL
// - Import JSON: モーダルでテキストペーストまたはファイル選択
// - Reset: 点と区間をクリア（global 設定と地図/3D 視点は維持）
// - Preview tiles: 保存せずにタイルを取得して 3D Viewer に描画
// - AI Prompt: ChatGPT / Claude 等に貼るプロンプトをクリップボードコピー
import { saveAndShare, copyToClipboard, showToast, getRecaptchaToken } from '../share.js'
import { downloadJson, readJsonFile, exportComposition, importComposition } from '../io.js'
import { buildAIPrompt } from '../ai-prompt.js'

export function mountTopbar(container, { state, actions, subscribe }) {
  container.innerHTML = `
    <div class="topbar">
      <span class="brand">tokyo-3d-drone · Composition Editor</span>
      <div class="actions">
        <button data-action="play" data-i18n="creator.play">▶ Play</button>
        <button data-action="stop" data-i18n="creator.stop">⏸ Stop</button>
        <button data-action="reset" data-i18n="creator.reset" title="点をすべてクリア (global 設定は維持)">⟲ Reset</button>
        <button data-action="preview-tiles" data-i18n="creator.previewTiles">🏙️ Preview tiles</button>
        <button data-action="save" data-i18n="creator.save">Save &amp; Share</button>
        <button data-action="export" data-i18n="creator.export">Export JSON</button>
        <button data-action="import" data-i18n="creator.import">Import JSON</button>
        <button data-action="ai-prompt" data-i18n="creator.aiPrompt">🤖 AI Prompt</button>
        <input type="file" data-action="import-file" accept="application/json,.json" hidden>
      </div>
    </div>
  `
  // i18n が後から init される場合に再 apply
  if (window.__i18nReady) window.__i18nReady.then(() => window.i18n?.applyToDom?.())
  container.querySelector('[data-action="play"]').addEventListener('click', () => actions.play())
  container.querySelector('[data-action="stop"]').addEventListener('click', () => actions.stop())

  container.querySelector('[data-action="reset"]').addEventListener('click', () => {
    if (state.composition.points.length === 0) return
    if (confirm('すべての点をリセットしますか？ (global 設定と地図視点は維持)')) {
      actions.resetPoints()
      showToast('点をリセットしました')
    }
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
      await copyToClipboard(url)
      showToast(`保存しました（URL コピー済み）：${url}`)
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
  let promptText = buildAIPrompt(composition, { includeCurrent: hasPoints })

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
        <textarea id="ai-prompt-text" readonly></textarea>
      </div>
      <footer class="modal-footer">
        <button data-action="copy-prompt" class="btn-primary">📋 プロンプトを丸ごとコピー</button>
        <button data-action="close-modal">閉じる</button>
      </footer>
    </div>
  `
  document.body.appendChild(modal)

  const textarea = modal.querySelector('#ai-prompt-text')
  textarea.value = promptText

  modal.querySelector('#ai-include-current').addEventListener('change', (e) => {
    promptText = buildAIPrompt(composition, { includeCurrent: e.target.checked })
    textarea.value = promptText
  })

  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove())
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })
  modal.querySelector('[data-action="copy-prompt"]').addEventListener('click', async () => {
    try {
      await copyToClipboard(textarea.value)
      showToast('AI プロンプトをコピーしました')
      modal.remove()
    } catch (err) {
      showToast(`コピー失敗: ${err.message}`)
    }
  })
}
