import { describe, it, expect } from 'vitest'
import { generateRoundRobin } from './roundRobin'

describe('generateRoundRobin', () => {
  it('4 squadre → 3 round da 2 partite, ogni coppia una volta', () => {
    const p = generateRoundRobin(['A', 'B', 'C', 'D'])
    expect(p).toHaveLength(6)
    expect(new Set(p.map((m) => m.round)).size).toBe(3)
    const coppie = p.map((m) => [m.teamAId, m.teamBId].sort().join('-')).sort()
    expect(coppie).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D'])
  })

  it('3 squadre (dispari) → ogni round una squadra ha bye (null)', () => {
    const p = generateRoundRobin(['A', 'B', 'C'])
    expect(new Set(p.map((m) => m.round)).size).toBe(3)
    const conBye = p.filter((m) => m.teamAId === null || m.teamBId === null)
    expect(conBye).toHaveLength(3)
  })
})
