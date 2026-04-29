import { describe, it, expect } from 'vitest'
import * as C from '../app/static/viewer/constants.js'

describe('creator constants', () => {
  it('matches backend upper bounds (composition_models.py)', () => {
    expect(C.MAX_POINTS).toBe(50)
    expect(C.MAX_TOTAL_DISTANCE_M).toBe(20_000)
    expect(C.MAX_BUFFER_M).toBe(500)
    expect(C.MIN_BUFFER_M).toBe(50)
    expect(C.MAX_SPEED_KMH).toBe(200)
    expect(C.MIN_SPEED_KMH).toBe(1)
    expect(C.MAX_ALT_M).toBe(500)
    expect(C.MIN_ALT_M).toBe(1)
    expect(C.MAX_HOVER_S).toBe(10)
    expect(C.MAX_CORNER_RADIUS_M).toBe(200)
  })
})
