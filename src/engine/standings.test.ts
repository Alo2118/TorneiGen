import { describe, it, expect } from 'vitest'
import { computeStandings } from './standings'
import type { Match, RegolePunteggio } from './types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

function match(a: string, b: string, pa: number, pb: number): Match {
  return {
    id: `${a}${b}`, tournamentId: 't', fase: 'girone', round: 1,
    teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }],
    stato: 'conclusa', vincitoreId: pa > pb ? a : b,
  }
}

describe('computeStandings', () => {
  it('conta vittorie, set e punti', () => {
    const rows = computeStandings(['A', 'B'], [match('A', 'B', 21, 15)], r)
    const A = rows.find((x) => x.teamId === 'A')!
    expect(A.vinte).toBe(1)
    expect(A.setVinti).toBe(1)
    expect(A.puntiFatti).toBe(21)
    expect(A.puntiSubiti).toBe(15)
  })

  it('ordina per numero di vittorie', () => {
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [match('A', 'B', 21, 10), match('A', 'C', 21, 12), match('B', 'C', 21, 19)],
      r,
    )
    expect(rows[0].teamId).toBe('A') // 2 vittorie
  })

  it('a parità di vittorie, quoziente set e quoziente punti usa lo scontro diretto', () => {
    // A e C: 1 vittoria/1 sconfitta ciascuna, stesso quoziente set (1) e
    // stesso quoziente punti (1), pareggio risolto solo dallo scontro diretto
    // (A ha battuto B).
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [match('A', 'B', 21, 15), match('C', 'A', 21, 15), match('B', 'D', 21, 15)],
      r,
    )
    const idxA = rows.findIndex((x) => x.teamId === 'A')
    const idxB = rows.findIndex((x) => x.teamId === 'B')
    expect(idxA).toBeLessThan(idxB)
  })

  it('ignora le partite non concluse', () => {
    const incompleta: Match = {
      id: 'x', tournamentId: 't', fase: 'girone', round: 1,
      teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata',
    }
    const rows = computeStandings(['A', 'B'], [incompleta], r)
    expect(rows.every((row) => row.giocate === 0)).toBe(true)
  })
})
