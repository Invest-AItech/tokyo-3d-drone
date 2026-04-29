// Community board (Phase 2): API client + UI renderer + form handling.
// Loaded as a module from landing.html only.

const API_BASE = '/api/v1/board'

// i18n ヘルパ。キーが見つからない時は fallback (英語) を返す。
function tr(key, fallback, params) {
  let s = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function')
    ? window.i18n.t(key)
    : (fallback ?? key)
  if (s === key) s = fallback ?? key
  if (params && typeof s === 'string') {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return s
}

// ─── API client ──────────────────────────────────────────────

export async function fetchTopPosts(limit = 5) {
  const res = await fetch(`${API_BASE}/posts?sort=top&limit=${limit}`)
  if (!res.ok) throw new Error(`fetch top failed: ${res.status}`)
  return res.json()
}

export async function fetchRecentPosts({ limit = 20, cursor = null } = {}) {
  const qs = new URLSearchParams({ sort: 'recent', limit: String(limit) })
  if (cursor) qs.set('cursor', cursor)
  const res = await fetch(`${API_BASE}/posts?${qs}`)
  if (!res.ok) throw new Error(`fetch recent failed: ${res.status}`)
  return res.json()
}

export async function createPost(payload) {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  })
  if (res.status === 429) throw new Error(tr('board.errorRateLimit', 'Too many posts. Please wait a moment.'))
  if (res.status === 403) throw new Error('recaptcha verification failed')
  if (!res.ok) throw new Error(`create failed: ${res.status}`)
  return res.json()
}

export async function likePost(postId) {
  const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/likes`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`like failed: ${res.status}`)
  return res.json()
}

// ─── Card renderer ───────────────────────────────────────────

export function renderCard(post, { variant = 'recent' } = {}) {
  const el = document.createElement('article')
  el.className = `board-card ${variant}`
  el.dataset.postId = post.id
  const openLabel = tr('board.openButton', '▶ Open')
  const openAria = tr('board.openButtonAriaLabel', 'Open preset in viewer')
  const anonLabel = tr('board.anonymous', 'anonymous')
  el.innerHTML = `
    <div class="card-title-row">
      <span class="card-badge"></span>
      <div class="card-title"></div>
    </div>
    <div class="card-comment"></div>
    <div class="card-meta">
      <span class="card-author">by <span class="author-name"></span></span>
      <span class="card-date"></span>
    </div>
    <div class="card-actions">
      <button class="like-btn" type="button">♥ <span class="like-count"></span></button>
      <a class="open-btn" target="_blank" rel="noopener" aria-label="${openAria}">${openLabel}</a>
    </div>
  `
  const badge = el.querySelector('.card-badge')
  if (post.postType === 'composition') {
    badge.textContent = tr('board.badgeComposition', 'Creator')
    badge.classList.add('badge-composition')
  } else {
    badge.textContent = tr('board.badgePreset', 'A→B')
    badge.classList.add('badge-preset')
  }
  el.querySelector('.card-title').textContent = post.title
  el.querySelector('.card-comment').textContent = post.comment || ''
  el.querySelector('.author-name').textContent = post.authorName || anonLabel
  el.querySelector('.card-date').textContent = formatRelativeDate(post.createdAt)
  const likes = post.likes ?? 0
  el.querySelector('.like-count').textContent = String(likes)
  el.querySelector('.like-btn').textContent = `♥ ${likes}`
  el.querySelector('.open-btn').href = post.presetUrl
  return el
}

function formatRelativeDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const ms = Date.now() - d.getTime()
  const min = ms / 60000
  if (min < 1) return tr('board.relativeJustNow', 'just now')
  if (min < 60) return tr('board.relativeMinutesAgo', '{n} min ago', { n: Math.floor(min) })
  if (min < 1440) return tr('board.relativeHoursAgo', '{n} hr ago', { n: Math.floor(min / 60) })
  return tr('board.relativeDaysAgo', '{n} days ago', { n: Math.floor(min / 1440) })
}

// ─── Optimistic like button ──────────────────────────────────

export function wireLikeButton(cardEl, { initialLikes = 0, apiCall } = {}) {
  const btn = cardEl.querySelector('.like-btn')
  if (!btn) return
  let current = initialLikes
  let busy = false
  btn.addEventListener('click', async () => {
    if (busy) return
    busy = true
    current += 1
    btn.textContent = `♥ ${current}`
    try {
      const res = await apiCall()
      current = res.likes
      btn.textContent = `♥ ${current}`
      btn.classList.add('voted')
    } catch (e) {
      current -= 1
      btn.textContent = `♥ ${current}`
      console.error('like failed', e)
    } finally {
      busy = false
    }
  })
}

// ─── Bootstrap ───────────────────────────────────────────────

async function loadAndRender() {
  const topEl = document.getElementById('board-top')
  const recentEl = document.getElementById('board-recent')
  if (!topEl || !recentEl) return

  topEl.textContent = tr('board.loading', 'Loading...')
  recentEl.textContent = tr('board.loading', 'Loading...')

  let top, recent
  try {
    [top, recent] = await Promise.all([
      fetchTopPosts(5),
      fetchRecentPosts({ limit: 20 }),
    ])
  } catch (e) {
    console.error('board: failed to load posts', e)
    topEl.textContent = ''
    recentEl.textContent = tr('board.errorLoadFailed', 'Failed to load')
    return
  }

  topEl.innerHTML = ''
  for (const p of top.posts) {
    const card = renderCard(p, { variant: 'top' })
    wireLikeButton(card, { initialLikes: p.likes ?? 0, apiCall: () => likePost(p.id) })
    topEl.appendChild(card)
  }
  if (top.posts.length === 0) {
    const emptyMsg = tr('board.emptyPosts', 'No posts yet')
    const p = document.createElement('p')
    p.style.cssText = 'color:var(--ink-mu);font-size:12px'
    p.textContent = emptyMsg
    topEl.appendChild(p)
  }

  recentEl.innerHTML = ''
  for (const p of recent.posts) {
    const card = renderCard(p, { variant: 'recent' })
    wireLikeButton(card, { initialLikes: p.likes ?? 0, apiCall: () => likePost(p.id) })
    recentEl.appendChild(card)
  }

  const more = document.getElementById('board-loadmore')
  if (more) {
    if (recent.nextCursor) {
      more.hidden = false
      more.dataset.cursor = recent.nextCursor
      more.onclick = async () => {
        const next = await fetchRecentPosts({ limit: 20, cursor: more.dataset.cursor })
        for (const p of next.posts) {
          const card = renderCard(p, { variant: 'recent' })
          wireLikeButton(card, { initialLikes: p.likes ?? 0, apiCall: () => likePost(p.id) })
          recentEl.appendChild(card)
        }
        if (next.nextCursor) more.dataset.cursor = next.nextCursor
        else more.hidden = true
      }
    } else {
      more.hidden = true
    }
  }
}

function loadRecaptchaScript() {
  const sk = window.RECAPTCHA_SITE_KEY
  if (!sk) return
  if (document.querySelector('script[data-recaptcha]')) return
  const s = document.createElement('script')
  s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(sk)}`
  s.async = true
  s.defer = true
  s.dataset.recaptcha = '1'
  document.head.appendChild(s)
}

function getRecaptchaToken(action) {
  return new Promise((resolve, reject) => {
    const sk = window.RECAPTCHA_SITE_KEY
    if (!sk) {
      // Dev mode: backend skips verification when secret is empty too
      resolve('')
      return
    }
    if (typeof grecaptcha === 'undefined') {
      reject(new Error('grecaptcha not loaded'))
      return
    }
    grecaptcha.ready(() => {
      grecaptcha.execute(sk, { action }).then(resolve, reject)
    })
  })
}

function wireForm() {
  const form = document.getElementById('board-form')
  const showBtn = document.getElementById('board-show-form')
  const cancel = document.getElementById('bf-cancel')
  const errEl = document.getElementById('bf-error')
  if (!form || !showBtn) return

  showBtn.addEventListener('click', () => {
    form.hidden = false
    showBtn.hidden = true
  })
  cancel?.addEventListener('click', () => {
    form.hidden = true
    showBtn.hidden = false
    errEl.hidden = true
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errEl.hidden = true
    const title = document.getElementById('bf-title').value
    const comment = document.getElementById('bf-comment').value || null
    const authorName = document.getElementById('bf-author').value || null
    const presetUrl = document.getElementById('bf-url').value

    let token = ''
    try {
      token = await getRecaptchaToken('post_preset')
    } catch (err) {
      errEl.hidden = false
      errEl.textContent = tr('board.errorRecaptchaNotLoaded', 'reCAPTCHA failed to load')
      return
    }

    try {
      await createPost({ title, comment, authorName, presetUrl, recaptchaToken: token })
      form.hidden = true
      showBtn.hidden = false
      form.reset()
      await loadAndRender()
    } catch (err) {
      errEl.hidden = false
      errEl.textContent = err.message
    }
  })
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    // i18n 初期化完了を待ってから render（fallback ではなくロケールに沿った文言を出すため）
    if (typeof window !== 'undefined' && window.__i18nReady) {
      try { await window.__i18nReady } catch (e) { /* ignore */ }
    }
    loadRecaptchaScript()
    wireForm()
    loadAndRender().catch((e) => console.error(e))
    // ロケール切替時はカードを描き直して文言反映
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      window.i18n.onChange(() => {
        loadAndRender().catch(() => {})
      })
    }
  })
}
