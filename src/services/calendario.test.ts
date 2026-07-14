import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { programmaCalendario } from './calendario'
import type { Tournament, Match } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-04', stato: 'in_corso',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataPartitaMin: 30,
}
const m = (id: string): Match => ({ id, tournamentId: 't1', fase: 'girone', round: 1, teamAId: 'A'+id, teamBId: 'B'+id, set: [], stato: 'programmata' })

describe('programmaCalendario', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.matches.clear()]); await saveTournament(t); await db.matches.bulkPut([m('1'), m('2')]) })

  it('assegna orario e campo alle partite e li persiste', async () => {
    const n = await programmaCalendario('t1')
    expect(n).toBe(2)
    const partite = await db.matches.where('tournamentId').equals('t1').toArray()
    expect(partite.every((p) => p.orario && p.campo)).toBe(true)
  })
})
