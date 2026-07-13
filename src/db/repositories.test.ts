import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import { saveTournament, listTournaments, replaceGenerated, matchesOf, groupsOf } from './repositories'
import type { Tournament, Match, Group } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('repositories', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })

  it('salva ed elenca i tornei', async () => {
    await saveTournament(t)
    const all = await listTournaments()
    expect(all.map((x) => x.id)).toEqual(['t1'])
  })

  it('replaceGenerated sostituisce gironi e match del torneo', async () => {
    const g: Group = { id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['x', 'y'] }
    const m: Match = { id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'x', teamBId: 'y', set: [], stato: 'programmata' }
    await replaceGenerated('t1', [g], [m])
    expect((await matchesOf('t1')).map((x) => x.id)).toEqual(['m1'])
    // rigenerando con liste vuote, si svuota
    await replaceGenerated('t1', [], [])
    expect(await matchesOf('t1')).toHaveLength(0)

    // seed foreign tournament to prove delete is scoped to t1 only
    const g2: Group = { id: 'g2', tournamentId: 't2', nome: 'B', teamIds: ['a', 'b'] }
    const m2: Match = { id: 'm2', tournamentId: 't2', fase: 'girone', groupId: 'g2', round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata' }
    await db.groups.put(g2)
    await db.matches.put(m2)

    // regenerate t1 again, verify t2 data survives
    await replaceGenerated('t1', [g], [m])
    await replaceGenerated('t1', [], [])
    expect((await groupsOf('t2')).map((x) => x.id)).toEqual(['g2'])
    expect((await matchesOf('t2')).map((x) => x.id)).toEqual(['m2'])
  })
})
