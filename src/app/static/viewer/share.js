export function buildSharedUrl(origin, id) {
  return `${origin}/viewer/?id=${encodeURIComponent(id)}`
}

export async function saveAndShare(composition, { recaptchaToken }) {
  const body = { ...composition, recaptchaToken }
  const r = await fetch('/api/v1/compositions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `save failed: ${r.status}`)
  }
  const data = await r.json()
  return data.url
}

export async function fetchPreviewTileset(composition) {
  const r = await fetch('/api/v1/compositions/preview-tileset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(composition),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || `preview failed: ${r.status}`)
  }
  return await r.json()  // { request_id, tileset_url }
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  // フォールバック: clipboard API 非対応環境
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
}

export function showToast(text, ms = 4000) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = text
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

export function showToastWithCta(text, ctaLabel, ctaFn, ms = 6000) {
  const el = document.getElementById('toast')
  if (!el) return
  el.innerHTML = `<span>${text}</span><button class="toast-cta">${ctaLabel}</button>`
  el.classList.add('show')
  const timer = setTimeout(() => { el.classList.remove('show'); el.textContent = '' }, ms)
  el.querySelector('.toast-cta').addEventListener('click', () => {
    clearTimeout(timer)
    el.classList.remove('show')
    el.textContent = ''
    ctaFn()
  })
}

/**
 * reCAPTCHA Enterprise トークンを取得。
 * site key が未設定なら 'dev' を返す（dev 環境用フォールバック）。
 */
export async function getRecaptchaToken(action = 'save_composition') {
  if (!window.RECAPTCHA_SITE_KEY) return 'dev'
  if (!window.grecaptcha?.enterprise) {
    throw new Error('reCAPTCHA Enterprise script not loaded')
  }
  return new Promise((resolve, reject) => {
    window.grecaptcha.enterprise.ready(() => {
      window.grecaptcha.enterprise
        .execute(window.RECAPTCHA_SITE_KEY, { action })
        .then(resolve, reject)
    })
  })
}
