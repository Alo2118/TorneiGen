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
      ['B', 'A', 'C', 'D'],
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

describe('computeStandings gironiPerSet', () => {
  const R: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, gironiPerSet: true }
  const m3 = (id: string, a: string, b: string, sets: [number, number][]): Match => ({
    id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b,
    set: sets.map(([puntiA, puntiB]) => ({ puntiA, puntiB })), stato: 'conclusa',
  })

  it('ordina per set vinti totali (ogni set = 1 punto)', () => {
    // A: 2-1 vs B, 2-1 vs C => 4 set; B: 2-1 vs C => 3 set; C => 2 set
    const matches = [
      m3('1', 'A', 'B', [[21, 10], [15, 21], [15, 8]]),
      m3('2', 'A', 'C', [[21, 12], [18, 21], [15, 9]]),
      m3('3', 'B', 'C', [[21, 5], [18, 21], [15, 7]]),
    ]
    const cl = computeStandings(['A', 'B', 'C'], matches, R)
    expect(cl.map((x) => x.teamId)).toEqual(['A', 'B', 'C'])
    expect(cl[0].setVinti).toBe(4)
    expect(cl[1].setVinti).toBe(3)
    expect(cl[2].setVinti).toBe(2)
  })

  it('a parità di set vinti conta il quoziente punti', () => {
    // A e B chiudono con 4 set ciascuna; A ha quoziente punti migliore
    const matches = [
      m3('1', 'A', 'C', [[21, 5], [21, 7], [15, 3]]), // A 3-0
      m3('2', 'A', 'B', [[10, 21], [21, 15], [13, 15]]), // B 2-1 (A 1 set)
      m3('3', 'B', 'C', [[21, 9], [18, 21], [15, 8]]), // B 2-1
    ]
    const cl = computeStandings(['A', 'B', 'C'], matches, R)
    const idxA = cl.findIndex((x) => x.teamId === 'A')
    const idxB = cl.findIndex((x) => x.teamId === 'B')
    expect(cl.find((x) => x.teamId === 'A')!.setVinti).toBe(4)
    expect(cl.find((x) => x.teamId === 'B')!.setVinti).toBe(4)
    expect(idxA).toBeLessThan(idxB)
  })
})
