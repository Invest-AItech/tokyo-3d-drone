// Edit Pane パネル (Task 2.7 本実装)
// POINTS リスト + 選択点スライダー + 区間編集 + グローバル設定
// 区間: 「秒で指定」(durationS, デフォルト) / 「速度で指定」(speedKmh) を toggle
import * as C from '../constants.js'

// 既存 segment の単位モードを判定（既存値があるほうが優先）
function _segMode(seg) {
  if (typeof seg.durationS === 'number') return 'duration'
  if (typeof seg.speedKmh === 'number') return 'speed'
  return 'duration'  // 不明時はデフォルト
}

// segment の haversine 距離 (m) を points から逆算（UI でモード切替時の換算に使う）
function _segDistanceM(comp, seg) {
  const a = comp.points.find(p => p.id === seg.from)
  const b = comp.points.find(p => p.id === seg.to)
  if (!a || !b) return 0
  const R = 6_371_000
  const phi1 = a.lat * Math.PI / 180
  const phi2 = b.lat * Math.PI / 180
  const dphi = (b.lat - a.lat) * Math.PI / 180
  const dlam = (b.lon - a.lon) * Math.PI / 180
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

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
          <div class="bulk-apply-row">
            <button class="bulk-apply-btn" data-act="apply-all-point-params"
                    title="この点の全パラメータ (高さ・俯角・左右角・hover・カーブ) を全 ${c.points.length} 点にコピー"
                    data-i18n-attr-title="creator.applyAllParamsHint"
                    data-i18n="creator.applyAllParams">→ 全パラメータを全点に適用</button>
          </div>
        </section>
        ` : ''}

        ${(segIn >= 0 || segOut >= 0) ? `
        <section class="segment-section">
          <h2 data-i18n="creator.segments">区間</h2>
          ${segIn >= 0 ? _segField(segIn, c.segments[segIn]) : ''}
          ${segOut >= 0 ? _segField(segOut, c.segments[segOut]) : ''}
          <div class="bulk-apply-row">
            <button class="bulk-apply-btn" data-act="apply-all-segment-params"
                    data-idx="${segIn >= 0 ? segIn : segOut}"
                    title="この区間の全パラメータ (秒・速度) を全 ${c.segments.length} 区間にコピー"
                    data-i18n-attr-title="creator.applyAllSegmentParamsHint"
                    data-i18n="creator.applyAllSegmentParams">→ 全パラメータを全区間に適用</button>
          </div>
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

    // 数値直接入力（slider と並列。スマホで精密調整しやすくする）
    container.querySelectorAll('input[type="number"][data-act-num]').forEach(el => {
      el.addEventListener('input', () => {
        // 入力途中（"-" や "." だけの状態、空文字）は state 更新しない
        if (el.value === '' || el.value === '-' || el.value === '.') return
        const value = Number(el.value)
        if (!Number.isFinite(value)) return
        const key = el.dataset.key
        const scope = el.dataset.actNum
        if (scope === 'point') {
          actions.updatePoint(el.dataset.id, { [key]: value })
        } else if (scope === 'global') {
          actions.updateGlobal({ [key]: value })
        } else if (scope === 'segment') {
          actions.updateSegment(Number(el.dataset.idx), { [key]: value })
        }
      })
      // タップで全選択 → そのまま新しい数値を打てる（モバイル UX 改善）
      el.addEventListener('focus', () => {
        // 次の tick まで待たないと iOS で select が無効化されることがある
        requestAnimationFrame(() => {
          try { el.select() } catch (_) { /* ignore */ }
        })
      })
      // blur 時に範囲外なら clamp して再描画を促す
      el.addEventListener('blur', () => {
        if (el.value === '') return
        const v = Number(el.value)
        if (!Number.isFinite(v)) return
        const min = Number(el.min)
        const max = Number(el.max)
        const clamped = Math.min(max, Math.max(min, v))
        if (clamped !== v) {
          el.value = String(clamped)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })
    })

    // ± Stepper ボタン（タップで step 量だけ増減。長押しで連続増減）
    // 連続実行は pointerdown で開始、pointerup/cancel/leave で停止。
    let stepRepeatDelay = null
    let stepRepeatTimer = null
    const stopStepRepeat = () => {
      if (stepRepeatDelay) { clearTimeout(stepRepeatDelay); stepRepeatDelay = null }
      if (stepRepeatTimer) { clearInterval(stepRepeatTimer); stepRepeatTimer = null }
    }
    container.querySelectorAll('button.num-step').forEach(btn => {
      const applyStep = () => {
        const scope = btn.dataset.actStep
        const key = btn.dataset.key
        const delta = Number(btn.dataset.step)
        if (!Number.isFinite(delta)) return

        // 現在値を読む
        let current
        if (scope === 'point') {
          const p = s.composition.points.find(pt => pt.id === btn.dataset.id)
          if (!p) return
          current = Number(p[key] ?? 0)
        } else if (scope === 'global') {
          current = Number(s.composition.global[key] ?? 0)
        } else if (scope === 'segment') {
          const seg = s.composition.segments[Number(btn.dataset.idx)]
          if (!seg) return
          current = Number(seg[key] ?? 0)
        }
        if (!Number.isFinite(current)) return

        // 新値を min/max 内に clamp
        const sibling = btn.parentElement.querySelector('input[type="number"]')
        const min = sibling ? Number(sibling.min) : -Infinity
        const max = sibling ? Number(sibling.max) : Infinity
        // step が小数の場合の浮動小数誤差を抑制（小数 2 桁まで）
        const next = Math.min(max, Math.max(min, Math.round((current + delta) * 100) / 100))
        if (next === current) return

        if (scope === 'point') {
          actions.updatePoint(btn.dataset.id, { [key]: next })
        } else if (scope === 'global') {
          actions.updateGlobal({ [key]: next })
        } else if (scope === 'segment') {
          actions.updateSegment(Number(btn.dataset.idx), { [key]: next })
        }
      }
      // 長押し連続: 350ms 後に開始、80ms 間隔
      btn.addEventListener('pointerdown', e => {
        e.preventDefault()
        applyStep()  // 即座に 1 回
        stopStepRepeat()
        stepRepeatDelay = setTimeout(() => {
          stepRepeatTimer = setInterval(applyStep, 80)
        }, 350)
      })
      btn.addEventListener('pointerup', stopStepRepeat)
      btn.addEventListener('pointercancel', stopStepRepeat)
      btn.addEventListener('pointerleave', stopStepRepeat)
      // キーボード操作（Enter/Space で 1 回）
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          applyStep()
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

    // → 全パラメータを全点に適用（選択点の全フィールドを一括コピー）
    container.querySelectorAll('button[data-act="apply-all-point-params"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sel = s.composition.points.find(p => p.id === s.selectedPointId)
        if (!sel) return
        const n = s.composition.points.length
        if (confirm(`全 ${n} 点の高さ・俯角・左右角・hover・カーブ半径を「点 ${sel.id}」と同じ値に揃えますか？\n（lon/lat は各点固有のため変更されません）`)) {
          actions.applyAllPointParams(sel)
        }
      })
    })

    // → 全パラメータを全区間に適用（選択区間の全フィールドを一括コピー）
    container.querySelectorAll('button[data-act="apply-all-segment-params"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx)
        const seg = s.composition.segments[idx]
        if (!seg) return
        const n = s.composition.segments.length
        if (confirm(`全 ${n} 区間の秒数・速度を「区間 ${seg.from}→${seg.to}」と同じ値に揃えますか？`)) {
          actions.applyAllSegmentParams(seg)
        }
      })
    })

    // 区間の単位切替（durationS ⇔ speedKmh）
    // 切替時は現在の距離からもう一方を計算して同じ動きを保つ。元の値は削除。
    container.querySelectorAll('button[data-act="seg-unit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx)
        const targetMode = btn.dataset.mode  // 'duration' | 'speed'
        const seg = s.composition.segments[idx]
        if (!seg) return
        const currentMode = _segMode(seg)
        if (currentMode === targetMode) return
        const distM = _segDistanceM(s.composition, seg)
        if (targetMode === 'duration') {
          // speedKmh → durationS。速度 0 防御。
          const speedKmh = typeof seg.speedKmh === 'number' && seg.speedKmh > 0 ? seg.speedKmh : 80
          const speedMps = (speedKmh * 1000) / 3600
          let durationS = distM > 0 ? distM / speedMps : C.DEFAULT_DURATION_S
          durationS = Math.max(C.MIN_DURATION_S, Math.min(C.MAX_DURATION_S, Math.round(durationS * 10) / 10))
          actions.updateSegment(idx, { durationS, speedKmh: undefined })
        } else {
          // durationS → speedKmh
          const durationS = typeof seg.durationS === 'number' && seg.durationS > 0 ? seg.durationS : C.DEFAULT_DURATION_S
          let speedKmh = distM > 0 ? (distM / durationS) * 3.6 : 80
          speedKmh = Math.max(C.MIN_SPEED_KMH, Math.min(C.MAX_SPEED_KMH, Math.round(speedKmh)))
          actions.updateSegment(idx, { speedKmh, durationS: undefined })
        }
      })
    })

    // i18n: render 後に data-i18n 属性を再適用
    if (window.i18n?.applyToDom) window.i18n.applyToDom()

    // 選択点が POINTS リストの可視範囲内に来るよう自動スクロール
    // （リストが独立スクロール領域になったため、選択行が画面外にあると編集しづらい）
    if (s.selectedPointId) {
      const selRow = container.querySelector('.point-row.sel')
      if (selRow && typeof selRow.scrollIntoView === 'function') {
        selRow.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      }
    }
  }

  function _numField(scope, id, key, label, value, min, max, step) {
    const v = (value == null) ? '' : value
    const showAll = scope === 'point'
    // step を「タップで増減する量」として使う。整数 step なら 1、0.5 step なら 0.5 など。
    return `
      <label class="numfield">
        <div class="numfield-head">
          <span class="numfield-label">${label}</span>
          <span class="numfield-range">${min}〜${max}</span>
        </div>
        <div class="numfield-stepper">
          <button type="button" class="num-step" data-act-step="${scope}" data-key="${key}" data-id="${id}" data-step="${-step}" aria-label="${label} を ${step} 減らす">−</button>
          <input type="number" class="numfield-num" min="${min}" max="${max}" step="${step}" value="${v}"
                 data-act-num="${scope}" data-key="${key}" data-id="${id}"
                 inputmode="decimal" enterkeyhint="done"
                 aria-label="${label} 直接入力">
          <button type="button" class="num-step" data-act-step="${scope}" data-key="${key}" data-id="${id}" data-step="${step}" aria-label="${label} を ${step} 増やす">＋</button>
        </div>
        <input type="range" class="numfield-slider" min="${min}" max="${max}" step="${step}" value="${v}"
               data-act="${scope}" data-key="${key}" data-id="${id}"
               aria-label="${label} スライダー">
        ${showAll ? `<div class="numfield-meta"><button class="apply-all-btn" data-act="apply-all-point" data-key="${key}" title="この値を全点に反映" data-i18n="creator.applyAll">→ All</button></div>` : ''}
      </label>
    `
  }

  function _segField(idx, seg) {
    const mode = _segMode(seg)
    const isDuration = mode === 'duration'
    const min = isDuration ? C.MIN_DURATION_S : C.MIN_SPEED_KMH
    const max = isDuration ? Math.min(C.MAX_DURATION_S, 60) : C.MAX_SPEED_KMH  // duration は実用域 60s に丸め
    const step = isDuration ? 0.5 : 1
    const value = isDuration ? (seg.durationS ?? C.DEFAULT_DURATION_S) : (seg.speedKmh ?? 80)
    const unit = isDuration ? '秒' : 'km/h'
    const key = isDuration ? 'durationS' : 'speedKmh'
    return `
      <div class="seg-row">
        <div class="seg-row__head">
          <span class="seg-label">${_esc(seg.from)} → ${_esc(seg.to)}</span>
          <span class="numfield-range">${min}〜${max} ${unit}</span>
          <div class="unit-pill-group" role="tablist" aria-label="区間タイミング単位">
            <button class="unit-pill${isDuration ? ' active' : ''}"
                    role="tab" aria-selected="${isDuration}"
                    data-act="seg-unit" data-idx="${idx}" data-mode="duration"
                    title="所要時間 (秒) で指定" aria-label="秒モード">🕐</button>
            <button class="unit-pill${!isDuration ? ' active' : ''}"
                    role="tab" aria-selected="${!isDuration}"
                    data-act="seg-unit" data-idx="${idx}" data-mode="speed"
                    title="巡航速度 (km/h) で指定" aria-label="速度モード">🛞</button>
          </div>
        </div>
        <div class="numfield-stepper">
          <button type="button" class="num-step" data-act-step="segment" data-key="${key}" data-idx="${idx}" data-step="${-step}" aria-label="${unit} を ${step} 減らす">−</button>
          <input type="number" class="numfield-num" min="${min}" max="${max}" step="${step}" value="${value}"
                 data-act-num="segment" data-key="${key}" data-idx="${idx}"
                 inputmode="decimal" enterkeyhint="done"
                 aria-label="${unit} 直接入力">
          <span class="numfield-unit">${unit}</span>
          <button type="button" class="num-step" data-act-step="segment" data-key="${key}" data-idx="${idx}" data-step="${step}" aria-label="${unit} を ${step} 増やす">＋</button>
        </div>
        <input type="range" class="numfield-slider" min="${min}" max="${max}" step="${step}" value="${value}"
               data-act="segment" data-key="${key}" data-idx="${idx}"
               aria-label="${unit} スライダー">
        <div class="numfield-meta">
          <button class="apply-all-btn" data-act="apply-all-segment" data-key="${key}" data-idx="${idx}"
                  title="この値を全区間に反映" data-i18n="creator.applyAll">→ All</button>
        </div>
      </div>
    `
  }

  subscribe(render)
}
