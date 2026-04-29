import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wireLikeButton } from '../app/static/js/board.js'

beforeEach(() => {
  document.body.innerHTML = `
    <article class="board-card" data-post-id="abc">
      <button class="like-btn">♥ 5</button>
    </article>
  `
})

describe('wireLikeButton', () => {
  it('increments count optimistically on click', async () => {
    const apiCall = vi.fn(() => new Promise((r) => setTimeout(() => r({ likes: 6, alreadyVoted: false }), 0)))
    const card = document.querySelector('.board-card')
    wireLikeButton(card, { initialLikes: 5, apiCall })
    card.querySelector('.like-btn').click()
    expect(card.querySelector('.like-btn').textContent).toContain('6')
    await new Promise((r) => setTimeout(r, 5))
    expect(card.querySelector('.like-btn').textContent).toContain('6')
  })

  it('rolls back on API failure', async () => {
    const apiCall = vi.fn(() => Promise.reject(new Error('fail')))
    const card = document.querySelector('.board-card')
    wireLikeButton(card, { initialLikes: 5, apiCall })
    card.querySelector('.like-btn').click()
    await new Promise((r) => setTimeout(r, 5))
    expect(card.querySelector('.like-btn').textContent).toContain('5')
  })

  it('marks button as voted after success', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ likes: 6, alreadyVoted: false }))
    const card = document.querySelector('.board-card')
    wireLikeButton(card, { initialLikes: 5, apiCall })
    card.querySelector('.like-btn').click()
    await new Promise((r) => setTimeout(r, 5))
    expect(card.querySelector('.like-btn').classList.contains('voted')).toBe(true)
  })

  it('ignores second click while in-flight', async () => {
    let resolver
    const apiCall = vi.fn(() => new Promise((r) => { resolver = r }))
    const card = document.querySelector('.board-card')
    wireLikeButton(card, { initialLikes: 5, apiCall })
    const btn = card.querySelector('.like-btn')
    btn.click()
    btn.click()  // should be ignored (busy)
    expect(apiCall).toHaveBeenCalledTimes(1)
    resolver({ likes: 6, alreadyVoted: false })
    await new Promise((r) => setTimeout(r, 5))
  })
})
