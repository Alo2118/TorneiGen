import { describe, it, expect } from 'vitest'
import { generateSingleElimination, advanceWinner, resolveByes } from './bracket'

describe('generateSingleElimination', () => {
  it('4 squadre → 3 partite (2 semifinali + 1 finale)', () => {
    const b = generateSingleElimination(['A', 'B', 'C', 'D'])
    expect(b).toHaveLength(3)
    expect(b.filter((m) => m.round === 1)).toHaveLength(2)
    expect(b.filter((m) => m.round === 2)).toHaveLength(1)
  })

  it('testa di serie 1 e 2 si incontrano solo in finale', () => {
    const b = generateSingleElimination(['S1', 'S2', 'S3', 'S4'])
    const r1 = b.filter((m) => m.round === 1)
    // S1 non affronta S2 al primo round
    const insieme = r1.some(
      (m) =>
        (m.teamAId === 'S1' && m.teamBId === 'S2') ||
        (m.teamAId === 'S2' && m.teamBId === 'S1'),
    )
    expect(insieme).toBe(false)
  })

  it('3 squadre → padding a 4 con un bye', () => {
    const b = generateSingleElimination(['A', 'B', 'C'])
    const r1 = b.filter((m) => m.round === 1)
    const conBye = r1.filter((m) => m.teamAId === null || m.teamBId === null)
    expect(conBye).toHaveLength(1)
  })
})

describe('advanceWinner', () => {
  it('inserisce il vincitore nella partita successiva', () => {
    const b = generateSingleElimination(['A', 'B', 'C', 'D'])
    const semi = b.find((m) => m.round === 1)!
    const dopo = advanceWinner(b, semi.id, semi.teamAId as string)
    const finale = dopo.find((m) => m.id === semi.feedsMatchId)!
    const slot = semi.feedsSlot === 'A' ? finale.teamAId : finale.teamBId
    expect(slot).toBe(semi.teamAId)
  })
})

describe('resolveByes', () => {
  it('la squadra con bye al primo round avanza da sola', () => {
    const b = generateSingleElimination(['A', 'B', 'C']) // D = bye
    const risolto = resolveByes(b)
    const finale = risolto.find((m) => m.round === 2)!
    // uno dei due slot della finale è già occupato dalla squadra col bye
    expect(finale.teamAId !== null || finale.teamBId !== null).toBe(true)
  })
})
