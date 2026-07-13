import { describe, it, expect } from 'vitest'
import { splitIntoGroups, qualifiedTeams } from './groups'
import type { StandingRow } from './types'

function row(teamId: string): StandingRow {
  return { teamId, giocate: 0, vinte: 0, perse: 0, setVinti: 0, setPersi: 0, puntiFatti: 0, puntiSubiti: 0 }
}

describe('splitIntoGroups', () => {
  it('8 squadre in 2 gironi → 4 e 4, a serpentina', () => {
    const g = splitIntoGroups(['1', '2', '3', '4', '5', '6', '7', '8'], 2)
    expect(g).toHaveLength(2)
    expect(g[0]).toHaveLength(4)
    expect(g[1]).toHaveLength(4)
    // snake: girone A = 1,4,5,8 ; girone B = 2,3,6,7
    expect(g[0]).toEqual(['1', '4', '5', '8'])
    expect(g[1]).toEqual(['2', '3', '6', '7'])
  })

  it('lancia un errore se numeroGironi è 0', () => {
    expect(() => splitIntoGroups(['A'], 0)).toThrow()
  })
})

describe('qualifiedTeams', () => {
  it('prende i primi 2 di ogni girone ordinati per posizione', () => {
    const gA = [row('A1'), row('A2'), row('A3')]
    const gB = [row('B1'), row('B2'), row('B3')]
    const q = qualifiedTeams([gA, gB], 2)
    // 1° dei gironi, poi 2° dei gironi
    expect(q).toEqual(['A1', 'B1', 'A2', 'B2'])
  })
})
