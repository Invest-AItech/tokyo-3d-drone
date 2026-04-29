import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchTopPosts, fetchRecentPosts, createPost, likePost } from '../app/static/js/board.js'

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('board API client', () => {
  it('fetchTopPosts hits the correct URL', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ posts: [], nextCursor: null }) })
    await fetchTopPosts(5)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/sort=top.*limit=5/))
  })

  it('fetchRecentPosts uses cursor', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ posts: [], nextCursor: null }) })
    await fetchRecentPosts({ limit: 20, cursor: 'abc' })
    const calledUrl = fetch.mock.calls[0][0]
    expect(calledUrl).toMatch(/sort=recent/)
    expect(calledUrl).toMatch(/limit=20/)
    expect(calledUrl).toMatch(/cursor=abc/)
  })

  it('createPost POSTs JSON', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'x' }) })
    const res = await createPost({
      title: 't', presetUrl: 'https://x/?p=ey', recaptchaToken: 'r'
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/posts$/),
      expect.objectContaining({ method: 'POST' })
    )
    expect(res.id).toBe('x')
  })

  it('createPost throws on 429', async () => {
    // i18n 化により 429 メッセージは locale (i18n missing 時は en fallback) を返す。
    // テスト環境では window.i18n が未初期化なので fallback "Too many posts. Please wait a moment." が返る。
    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    await expect(createPost({ title: 't', presetUrl: 'https://x/?p=e', recaptchaToken: 'r' }))
      .rejects.toThrow(/too many|rate/i)
  })

  it('createPost throws on 403 (recaptcha)', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    await expect(createPost({ title: 't', presetUrl: 'https://x/?p=e', recaptchaToken: 'r' }))
      .rejects.toThrow(/recaptcha/i)
  })

  it('likePost POSTs to the right URL with credentials', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ likes: 6, alreadyVoted: false }) })
    const res = await likePost('abc')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/posts\/abc\/likes/),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )
    expect(res.likes).toBe(6)
  })
})
