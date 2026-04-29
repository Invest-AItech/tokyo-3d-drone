// Edit Pane パネル (Task 2.7 本実装)
// POINTS リスト + 選択点スライダー + 区間編集 + グローバル設定
import * as C from '../constants.js'

export function mountEditPane(container, { state, actions, subscribe }) {
  function _esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
  }

  function render(s) {
    const c = s.composition
    const sel = c.points.find(p => p.id === s.selectedPointId)

    // 選択点の前後セグメント
    const segIn = sel ? c.segments.findIndex(seg => seg.to === sel.id) : -1
    const segOut = sel ? c.segments.findIndex(seg => seg.from === sel.id) : -1

    container.innerHTML = `
      <header class="pane-header">
        <div class="pane-header__title" data-i18n="creator.paneEditTitle">編集パネル</div>
        <div class="pane-header__hint" data-i18n="creator.paneEditHint">点をクリックして個別編集 · → All で全点に一括反映</div>
      </header>
      <div class="edit">
        <section class="points-section">
          <h2><span data-i18n="creator.points">POINTS</span> (${c.points.length} / ${C.MAX_POINTS})</h2>
          <ul class="point-list">
            ${c.points.map((p, i) => `
              <li class="point-row${p.id === s.selectedPointId ? ' sel' : ''}">
                <button data-act="select" data-id="${_esc(p.id)}" class="select-btn">${_esc(p.id)}</button>
                <span class="ll">${p.lon.toFixed(5)}, ${p.lat.toFixed(5)}</span>
                <button data-act="up" data-id="${_esc(p.id)}" ${i === 0 ? 'disabled' : ''} title="上へ">↑</button>
                <button data-act="down" data-id="${_esc(p.id)}" ${i === c.points.length - 1 ? 'disabled' : ''} title="下へ">↓</button>
                <button data-act="remove" data-id="${_esc(p.id)}" title="削除">⊗</button>
              </li>
            `).join('')}
          </ul>
          ${c.points.length === 0 ? '<p class="hint" data-i18n="creator.hintAddPoint">マップをクリックして点を追加</p>' : ''}
        </section>

        ${sel ? `
        <section class="point-edit-section">
          <h2><span data-i18n="creator.selectedPoint">選択点</span> ${_esc(sel.id)}</h2>
          ${_numField('point', sel.id, 'altM', '高さ (m)', sel.altM, C.MIN_ALT_M, C.MAX_ALT_M, 1)}
          ${_numField('point', sel.id, 'pitchDeg', '俯角 (°)', sel.pitchDeg, C.PITCH_MIN_DEG, C.PITCH_MAX_DEG, 1)}
          ${_numField('point', sel.id, 'headingRelDeg', '左右角 (°)', sel.headingRelDeg, -C.HEADING_REL_RANGE_DEG, C.HEADING_REL_RANGE_DEG, 5)}
          ${_numField('point', sel.id, 'hoverS', 'hover (秒)', sel.hoverS ?? 0, 0, C.MAX_HOVER_S, 0.5)}
          ${_numField('point', sel.id, 'cornerRadiusM', 'カーブ半径 (m)', sel.cornerRadiusM ?? c.global.cornerRadiusM, 0, C.MAX_CORNER_RADIUS_M, 5)}
        </section>
        ` : ''}

        ${(segIn >= 0 || segOut >= 0) ? `
        <section class="segment-section">
          <h2 data-i18n="creator.segments">区間</h2>
          ${segIn >= 0 ? _segField(segIn, c.segments[segIn]) : ''}
          ${segOut >= 0 ? _segField(segOut, c.segments[segOut]) : ''}
        </section>
        ` : ''}

        <section class="global-section">
          <h2 data-i18n="creator.global">GLOBAL</h2>
          ${_numField('global', '', 'tau', 'τ (秒)', c.global.tau, C.TAU_MIN, C.TAU_MAX, 0.1)}
          ${_numField('global', '', 'lookaheadM', '先読み (m)', c.global.lookaheadM, C.LOOKAHEAD_MIN_M, C.LOOKAHEAD_MAX_M, 5)}
          ${_numField('global', '', 'bufferM', 'バッファ (m)', c.global.bufferM, C.MIN_BUFFER_M, C.MAX_BUFFER_M, 50)}
          ${_numField('global', '', 'cornerRadiusM', 'デフォルトカーブ (m)', c.global.cornerRadiusM, 0, C.MAX_CORNER_RADIUS_M, 5)}
          <label class="select-field">
            <span>LOD</span>
            <select data-act="global" data-key="lod">
              ${C.VALID_LODS.map(v => `<option value="${v}" ${v === c.global.lod ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
        </section>
      </div>
    `

    // ボタンと input/select のイベント結線
    container.querySelectorAll('button[data-act]').forEach(btn => {
      const act = btn.dataset.act
      const id = btn.dataset.id
      btn.addEventListener('click', () => {
        if (act === 'select') actions.selectPoint(id)
        else if (act === 'remove') actions.removePoint(id)
        else if (act === 'up') actions.movePoint(id, -1)
        else if (act === 'down') actions.movePoint(id, 1)
      })
    })

    container.querySelectorAll('input[type="range"][data-act]').forEach(el => {
      el.addEventListener('input', () => {
        const value = Number(el.value)
        const key = el.dataset.key
        if (el.dataset.act === 'point') {
          actions.updatePoint(el.dataset.id, { [key]: value })
        } else if (el.dataset.act === 'global') {
          actions.updateGlobal({ [key]: value })
        } else if (el.dataset.act === 'segment') {
          actions.updateSegment(Number(el.dataset.idx), { [key]: value })
        }
      })
    })

    container.querySelectorAll('select[data-act="global"]').forEach(el => {
      el.addEventListener('change', () => {
        actions.updateGlobal({ [el.dataset.key]: el.value })
      })
    })

    // → All ボタン（点の属性を全点に一括反映）
    container.querySelectorAll('button[data-act="apply-all-point"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key
        const sel = s.composition.points.find(p => p.id === s.selectedPointId)
        if (!sel) return
        const value = sel[key]
        if (value == null) return
        if (confirm(`全 ${s.composition.points.length} 点の ${key} を ${value} に揃えますか？`)) {
          actions.applyToAllPoints(key, value)
        }
      })
    })

    // → All ボタン（区間速度を全区間に一括反映）
    container.querySelectorAll('button[data-act="apply-all-segment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key
        const idx = Number(btn.dataset.idx)
        const value = s.composition.segments[idx]?.[key]
        if (value == null) return
        if (confirm(`全 ${s.composition.segments.length} 区間の ${key} を ${value} に揃えますか？`)) {
          actions.applyToAllSegments(key, value)
        }
      })
    })

    // i18n: render 後に data-i18n 属性を再適用
    if (window.i18n?.applyToDom) window.i18n.applyToDom()
  }

  function _numField(scope, id, key, label, value, min, max, step) {
    const v = (value == null) ? '' : value
    const showAll = scope === 'point'
    return `
      <label class="numfield">
        <span class="numfield-label">${label}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${v}"
               data-act="${scope}" data-key="${key}" data-id="${id}">
        <span class="numfield-value">${v}</span>
        ${showAll ? `<button class="apply-all-btn" data-act="apply-all-point" data-key="${key}" title="この値を全点に反映" data-i18n="creator.applyAll">→ All</button>` : ''}
      </label>
    `
  }

  function _segField(idx, seg) {
    return `
      <div class="seg-row">
        <span class="seg-label">${_esc(seg.from)} → ${_esc(seg.to)}</span>
        <input type="range" min="${C.MIN_SPEED_KMH}" max="${C.MAX_SPEED_KMH}" step="1" value="${seg.speedKmh}"
               data-act="segment" data-key="speedKmh" data-idx="${idx}">
        <span class="numfield-value">${seg.speedKmh} km/h</span>
        <button class="apply-all-btn" data-act="apply-all-segment" data-key="speedKmh" data-idx="${idx}" title="この速度を全区間に反映" data-i18n="creator.applyAll">→ All</button>
      </div>
    `
  }

  subscribe(render)
}
