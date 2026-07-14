import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { salvaEProppaga } from './saveResult'
import type { Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
function tab(id: string, round: number, index: number, a: string | null, b: string | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}

describe('salvaEProppaga', () => {
  beforeEach(async () => { await db.matches.clear() })
  it('salva il risultato e fa avanzare il vincitore', async () => {
    await db.matches.bulkPut([tab('s1', 1, 0, 'A', 'B'), tab('s2', 1, 1, 'C', 'D'), tab('f', 2, 0, null, null)])
    await salvaEProppaga('t1', 's1', [{ puntiA: 21, puntiB: 10 }], r)
    const f = await db.matches.get('f')
    expect(f?.teamAId).toBe('A')
  })

  it('lancia un errore se la partita non esiste', async () => {
    await db.matches.bulkPut([tab('s1', 1, 0, 'A', 'B')])
    await expect(salvaEProppaga('t1', 'inesistente', [{ puntiA: 21, puntiB: 10 }], r)).rejects.toThrow()
  })

  it('doppia: salvare un risultato WB fa scendere il perdente nel LB', async () => {
    await db.matches.bulkPut([
      { id: 'wb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata', vincitoreVerso: { matchId: 'wb-r2-i0', slot: 'A' }, perdenteVerso: { matchId: 'lb-r1-i0', slot: 'A' } },
      { id: 'lb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata', vincitoreVerso: null, perdenteVerso: null },
      { id: 'wb-r2-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 2, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata', vincitoreVerso: null, perdenteVerso: null },
    ])
    await salvaEProppaga('t1', 'wb-r1-i0', [{ puntiA: 21, puntiB: 10 }], r)
    expect((await db.matches.get('lb-r1-i0'))?.teamAId).toBe('B')
    expect((await db.matches.get('wb-r2-i0'))?.teamAId).toBe('A')
  })
})
