import { describe, it, expect } from 'vitest'
import { renderCard } from '../app/static/js/board.js'

const post = {
  id: 'abc',
  title: 'My preset',
  comment: 'cool',
  authorName: 'alice',
  presetUrl: 'https://x/?p=ey',
  likes: 7,
  createdAt: new Date().toISOString(),
  status: 'active',
}

describe('renderCard', () => {
  it('returns an Element with title and likes', () => {
    const el = renderCard(post, { variant: 'top' })
    expect(el.querySelector('.card-title').textContent).toContain('My preset')
    expect(el.querySelector('.like-btn').textContent).toContain('7')
  })

  it('shows "anonymous" when authorName is null', () => {
    const el = renderCard({ ...post, authorName: null }, {})
    expect(el.textContent).toContain('anonymous')
  })

  it('open button has href to presetUrl', () => {
    const el = renderCard(post, {})
    expect(el.querySelector('.open-btn').href).toContain('?p=ey')
  })

  it('applies the top variant class', () => {
    const el = renderCard(post, { variant: 'top' })
    expect(el.classList.contains('top')).toBe(true)
  })

  it('truncates comment via CSS class but stores full text', () => {
    const long = { ...post, comment: 'x'.repeat(500) }
    const el = renderCard(long, {})
    expect(el.querySelector('.card-comment').textContent.length).toBe(500)
  })
})
