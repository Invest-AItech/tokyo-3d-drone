// Google Places API (New) のバックエンド proxy (/api/v1/places/...) を叩く
// クライアント。debounce 付き autocomplete + place details の 2 関数を提供する。
//
// セッショントークン: Google の課金単位 (autocomplete-then-details) を 1 セッション
// にまとめるため UUID v4 を生成して保持。新しいセッション開始時 (= 検索ボックスへの
// フォーカス時) に rotateSessionToken で更新する。

const AUTOCOMPLETE_URL = '/api/v1/places/autocomplete'
const DETAILS_URL = '/api/v1/places/details'
const DEFAULT_DEBOUNCE_MS = 250
const MIN_QUERY_LEN = 1

export function generateSessionToken() {
  // RFC 4122 v4
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  let s = ''
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) s += '-'
    const v = (Math.random() * 16) | 0
    s += v.toString(16)
  }
  return s
}

export class PlaceSearchClient {
  constructor({ debounceMs = DEFAULT_DEBOUNCE_MS, fetchImpl = null } = {}) {
    this._debounceMs = debounceMs
    this._fetch = fetchImpl || ((...args) => fetch(...args))
    this._timer = null
    this._abortCtrl = null
    this._pendingResolve = null
    this._sessionToken = generateSessionToken()
  }

  rotateSessionToken() {
    this._sessionToken = generateSessionToken()
  }

  getSessionToken() {
    return this._sessionToken
  }

  /**
   * Schedule an autocomplete request; cancels any in-flight one for the
   * previous keystroke. Returns a Promise resolving to predictions array.
   * If the query is empty/too short, resolves to [] immediately (no request).
   *
   * @param {string} query
   * @param {string} locale - 'ja' | 'en'
   */
  autocomplete(query, locale) {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (this._abortCtrl) {
      this._abortCtrl.abort()
      this._abortCtrl = null
    }
    // 前回スケジュールされた呼び出しの promise が hang しないよう、
    // 古い resolve をここで { predictions: [], status: 'cancelled' } で完了させる。
    if (this._pendingResolve) {
      const r = this._pendingResolve
      this._pendingResolve = null
      r({ predictions: [], status: 'cancelled' })
    }
    const trimmed = (query || '').trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      return Promise.resolve({ predictions: [], status: 'empty_query' })
    }
    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve
      this._timer = setTimeout(async () => {
        this._timer = null
        this._pendingResolve = null
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null
        this._abortCtrl = ctrl
        try {
          const res = await this._fetch(AUTOCOMPLETE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: trimmed,
              locale,
              session_token: this._sessionToken,
            }),
            signal: ctrl ? ctrl.signal : undefined,
          })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`autocomplete ${res.status}: ${text}`)
          }
          const data = await res.json()
          resolve({
            predictions: Array.isArray(data.predictions) ? data.predictions : [],
            status: typeof data.status === 'string' ? data.status : 'ok',
          })
        } catch (err) {
          if (err && err.name === 'AbortError') {
            // 後続の入力で上書きされた。呼び出し元には空を返す扱い。
            resolve({ predictions: [], status: 'cancelled' })
            return
          }
          reject(err)
        }
      }, this._debounceMs)
    })
  }

  /**
   * Fetch place details for a place_id (no debounce — user has explicitly
   * picked one). Rotates the session token on success/failure since the
   * billing session ends here.
   */
  async getDetails(placeId, locale) {
    const tokenForCall = this._sessionToken
    try {
      const res = await this._fetch(DETAILS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: placeId,
          locale,
          session_token: tokenForCall,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`details ${res.status}: ${text}`)
      }
      return await res.json()
    } finally {
      this.rotateSessionToken()
    }
  }
}
