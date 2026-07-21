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

  it('isolamento tra tornei: due tornei con tabellone non collidono nella tabella matches condivisa', async () => {
    // t1
    await saveTournament(torneo({ id: 't1', faseFinale: 'diretta' }))
    await db.teams.bulkPut(['A', 'B', 'C', 'D'].map((id) => ({ id, tournamentId: 't1', nome: id, players: [], stato: 'confermata' as const, origine: 'manuale' as const })))
    await db.groups.bulkPut([girone('g1', ['A', 'B']), girone('g2', ['C', 'D'])])
    await db.matches.bulkPut([
      { id: 't1-m1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' },
      { id: 't1-m2', tournamentId: 't1', fase: 'girone', groupId: 'g2', round: 1, teamAId: 'C', teamBId: 'D', set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' },
    ])
    await generaFaseFinale('t1')
    const tabT1Prima = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
    expect(tabT1Prima.length).toBeGreaterThan(0)

    // t2 (torneo diverso, stesso formato) - deve generare un proprio tabellone senza toccare quello di t1
    await saveTournament(torneo({ id: 't2', faseFinale: 'diretta' }))
    await db.teams.bulkPut(['E', 'F', 'G', 'H'].map((id) => ({ id, tournamentId: 't2', nome: id, players: [], stato: 'confermata' as const, origine: 'manuale' as const })))
    await db.groups.bulkPut([
      { id: 'g1t2', tournamentId: 't2', nome: 'g1t2', teamIds: ['E', 'F'] },
      { id: 'g2t2', tournamentId: 't2', nome: 'g2t2', teamIds: ['G', 'H'] },
    ])
    await db.matches.bulkPut([
      { id: 't2-m1', tournamentId: 't2', fase: 'girone', groupId: 'g1t2', round: 1, teamAId: 'E', teamBId: 'F', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'E', stato: 'conclusa' },
      { id: 't2-m2', tournamentId: 't2', fase: 'girone', groupId: 'g2t2', round: 1, teamAId: 'G', teamBId: 'H', set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'G', stato: 'conclusa' },
    ])
    await generaFaseFinale('t2')

    const tabT1Dopo = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
    const tabT2 = (await db.matches.where('tournamentId').equals('t2').toArray()).filter((m) => m.fase === 'tabellone')

    // t1 non e' stato toccato dalla generazione di t2
    expect(tabT1Dopo.length).toBe(tabT1Prima.length)
    expect(new Set(tabT1Dopo.map((m) => m.id))).toEqual(new Set(tabT1Prima.map((m) => m.id)))
    expect(tabT2.length).toBeGreaterThan(0)

    // nessuna sovrapposizione di id tra i due tabelloni
    const idsT1 = new Set(tabT1Dopo.map((m) => m.id))
    const idsT2 = new Set(tabT2.map((m) => m.id))
    expect([...idsT1].some((id) => idsT2.has(id))).toBe(false)
  })

  async function seed7(over: Partial<Tournament> = {}) {
    await saveTournament(torneo({ faseFinale: 'diretta', qualificatiPerGirone: 2, finaleTerzoPosto: true, gironeConsolazione: true, ...over }))
    await db.teams.bulkPut(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'].map(team))
    await db.groups.bulkPut([girone('g1', ['a1', 'a2', 'a3', 'a4']), girone('g2', ['b1', 'b2', 'b3'])])
    const w = (id: string, g: string, a: string, b: string) => matchGirone(id, g, a, b, 21, 10)
    await db.matches.bulkPut([
      // Girone A: a1 > a2 > a3 > a4
      w('a12', 'g1', 'a1', 'a2'), w('a13', 'g1', 'a1', 'a3'), w('a14', 'g1', 'a1', 'a4'),
      w('a23', 'g1', 'a2', 'a3'), w('a24', 'g1', 'a2', 'a4'), w('a34', 'g1', 'a3', 'a4'),
      // Girone B: b1 > b2 > b3
      w('b12', 'g2', 'b1', 'b2'), w('b13', 'g2', 'b1', 'b3'), w('b23', 'g2', 'b2', 'b3'),
    ])
  }

  it('genera finalina 3°/4° e girone di consolazione a 3 con 7 squadre (gironi 4+3)', async () => {
    await seed7()
    await generaFaseFinale('t1')
    const groups = await db.groups.where('tournamentId').equals('t1').toArray()
    const cons = groups.find((g) => g.tipo === 'consolazione')!
    expect(cons).toBeTruthy()
    expect(new Set(cons.teamIds)).toEqual(new Set(['a3', 'a4', 'b3'])) // i non qualificati
    const all = await db.matches.where('tournamentId').equals('t1').toArray()
    const consMatches = all.filter((m) => m.groupId === cons.id)
    expect(consMatches).toHaveLength(3) // round-robin sola andata di 3 squadre
    expect(all.some((m) => m.tabelloneTipo === 'terzo')).toBe(true)
  })

  it('la precondizione ignora i match del girone di consolazione (rigenerazione ok)', async () => {
    await seed7()
    await generaFaseFinale('t1') // crea la consolazione (match 'programmata')
    // rigenerare NON deve lanciare per via dei match consolazione non conclusi
    await expect(generaFaseFinale('t1')).resolves.toBeGreaterThan(0)
    const groups = await db.groups.where('tournamentId').equals('t1').toArray()
    // niente duplicati: un solo girone di consolazione
    expect(groups.filter((g) => g.tipo === 'consolazione')).toHaveLength(1)
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
