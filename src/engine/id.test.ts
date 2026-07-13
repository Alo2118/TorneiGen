import { describe, it, expect } from 'vitest'
import { newId } from './id'

describe('newId', () => {
  it('genera id diversi e non vuoti', () => {
    const a = newId()
    const b = newId()
    expect(a).not.toBe('')
    expect(a).not.toBe(b)
  })
})
