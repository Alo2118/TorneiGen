import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { generaFaseFinale } from './faseFinale'
import type { Tournament, Team, Group, Match } from '../engine/types'

function torneo(over: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1', nome: 'C', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-09-01', stato: 'in_corso',
    regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
    faseFinale: 'diretta', qualificatiPerGirone: 'tutti', ...over,
  }
}
function team(id: string): Team { return { id, tournamentId: 't1', nome: id, players: [], stato: 'confermata', origine: 'manuale' } }
function girone(id: string, teamIds: string[]): Group { return { id, tournamentId: 't1', nome: id, teamIds } }
function matchGirone(id: string, groupId: string, a: string, b: string, pa: number, pb: number): Match {
  return { id, tournamentId: 't1', fase: 'girone', groupId, round: 1, teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }], vincitoreId: pa > pb ? a : b, stato: 'conclusa' }
}

describe('generaFaseFinale', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()]) })

  async function seed(over: Partial<Tournament> = {}) {
    await saveTournament(torneo(over))
    await db.teams.bulkPut(['A', 'B', 'C', 'D'].map(team))
    await db.groups.bulkPut([girone('g1', ['A', 'B']), girone('g2', ['C', 'D'])])
    await db.matches.bulkPut([matchGirone('m1', 'g1', 'A', 'B', 21, 10), matchGirone('m2', 'g2', 'C', 'D', 21, 12)])
  }

  it('diretta: genera un tabellone dai qualificati dei gironi', async () => {
    await seed({ faseFinale: 'diretta' })
    const n = await generaFaseFinale('t1')
    expect(n).toBeGreaterThan(0)
    const tab = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
    expect(tab.length).toBeGreaterThan(0)
  })

  it('doppia con 4 qualificati (potenza di 2): genera vincenti/perdenti/finale', async () => {
    await seed({ faseFinale: 'doppia', qualificatiPerGirone: 'tutti' })
    await generaFaseFinale('t1')
    const tab = (await db.matches.where('tournamentId').equals('t1').toArray())
    expect(tab.some((m) => m.tabelloneTipo === 'vincenti')).toBe(true)
    expect(tab.some((m) => m.tabelloneTipo === 'perdenti')).toBe(true)
  })

  it('errore se i gironi non sono conclusi', async () => {
    await seed()
    await db.matches.put({ id: 'm3', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' })
    await expect(generaFaseFinale('t1')).rejects.toThrow(/concludi|gironi/i)
  })

  it('doppia con qualificati non potenza di 2 → errore', async () => {
    // 3 gironi con 1 qualificato ciascuno = 3 (non potenza di 2). Qui: 1 qualificato per girone su 2 gironi = 2 (pow2), quindi forziamo 1 girone con dispari.
    await saveTournament(torneo({ faseFinale: 'doppia', qualificatiPerGirone: 1 }))
    await db.teams.bulkPut(['A', 'B', 'C'].map(team))
    await db.groups.bulkPut([girone('g1', ['A', 'B', 'C'])])
    await db.matches.bulkPut([
      matchGirone('m1', 'g1', 'A', 'B', 21, 10), matchGirone('m2', 'g1', 'A', 'C', 21, 11), matchGirone('m3', 'g1', 'B', 'C', 21, 12),
    ])
    // 1 girone × 1 qualificato = 1 qualificato → non potenza di 2 valida per la doppia
    await expect(generaFaseFinale('t1')).rejects.toThrow(/potenza di 2/i)
  })
})
