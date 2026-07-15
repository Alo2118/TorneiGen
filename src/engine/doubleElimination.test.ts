import { describe, it, expect } from 'vitest'
import { generateDoubleElimination } from './doubleElimination'

describe('generateDoubleElimination', () => {
  it('4 squadre: WB 3 match, LB 2 match, 1 finale, 1 golden (totale 7)', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    expect(b.filter((m) => m.tabelloneTipo === 'vincenti')).toHaveLength(3)
    expect(b.filter((m) => m.tabelloneTipo === 'perdenti')).toHaveLength(2)
    expect(b.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
    expect(b).toHaveLength(7)
  })

  it('8 squadre: WB 7, LB 6, finale 1, golden 1 (totale 15)', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(b.filter((m) => m.tabelloneTipo === 'vincenti')).toHaveLength(7)
    expect(b.filter((m) => m.tabelloneTipo === 'perdenti')).toHaveLength(6)
    expect(b.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
    expect(b).toHaveLength(15)
  })

  it('il perdente del WB round 1 finisce in uno slot LB', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    const wb1 = b.filter((m) => m.tabelloneTipo === 'vincenti' && m.round === 1)
    expect(wb1.every((m) => m.loserFeeds && m.loserFeeds.matchId.startsWith('lb-'))).toBe(true)
  })

  it('il vincitore del WB finale e del LB finale vanno alla finale', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    const wbFin = b.find((m) => m.tabelloneTipo === 'vincenti' && m.winnerFeeds?.matchId === 'gf')
    const lbFin = b.find((m) => m.tabelloneTipo === 'perdenti' && m.winnerFeeds?.matchId === 'gf')
    expect(wbFin).toBeTruthy()
    expect(lbFin).toBeTruthy()
    expect(wbFin!.winnerFeeds!.slot).toBe('A')
    expect(lbFin!.winnerFeeds!.slot).toBe('B')
  })

  it('2 squadre: WB 1 match, LB 0, finale 1; WB loser va diretto in finale slot B', () => {
    const b = generateDoubleElimination(['A', 'B'])
    expect(b.filter((m) => m.tabelloneTipo === 'vincenti')).toHaveLength(1)
    expect(b.filter((m) => m.tabelloneTipo === 'perdenti')).toHaveLength(0)
    expect(b.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
    const wbMatch = b.find((m) => m.tabelloneTipo === 'vincenti')!
    expect(wbMatch.winnerFeeds).toEqual({ matchId: 'gf', slot: 'A' })
    expect(wbMatch.loserFeeds).toEqual({ matchId: 'gf', slot: 'B' })
  })

  it('genera anche la partita golden', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    const golden = b.filter((m) => m.tabelloneTipo === 'golden')
    expect(golden).toHaveLength(1)
    expect(golden[0].id).toBe('golden')
  })
})
