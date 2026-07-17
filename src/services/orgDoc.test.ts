import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale } from './orgDoc'
import type { Tournament, Team, Group, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti', pubblicato: true, orgVersion: 3, orgPending: true,
}
const team = (id: string): Team => ({
  id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
  players: [{ nome: 'Mario', cognome: `C${id}`, email: 'm@x.it', telefono: '3330000000' }],
})
const group: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['a', 'b'] }
const match = (id: string, over: Partial<Match> = {}): Match => ({
  id, tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b',
  set: [], stato: 'programmata', ...over,
})

describe('buildOrgDoc', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(torneo)
    await db.teams.bulkPut([team('a'), team('b')])
    await db.groups.put(group)
    await db.matches.put(match('m1', { set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }))
  })

  it('esclude i punteggi dalla struttura', async () => {
    const doc = await buildOrgDoc('t1')
    const s = doc.struttura[0]
    expect(s.id).toBe('m1')
    expect('set' in s).toBe(false)
    expect('vincitoreId' in s).toBe(false)
    expect('stato' in s).toBe(false)
    expect(JSON.stringify(doc)).not.toContain('conclusa')
  })

  it('esclude i campi locali dal torneo nel documento', async () => {
    const doc = await buildOrgDoc('t1')
    expect(doc.tournament.pubblicato).toBeUndefined()
    expect(doc.tournament.orgVersion).toBeUndefined()
    expect(doc.tournament.orgPending).toBeUndefined()
    expect(doc.teams).toHaveLength(2)
    expect(doc.groups).toHaveLength(1)
  })
})

describe('applyOrgDoc', () => {
  it('fonde i punteggi locali per matchId e preserva i campi locali', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: { ...torneo, pubblicato: undefined, orgVersion: undefined, orgPending: undefined },
      teams: [team('a')], groups: [group],
      struttura: [{ id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
    }
    const locali: Match[] = [match('m1', { set: [{ puntiA: 21, puntiB: 10 }], stato: 'conclusa', vincitoreId: 'a' })]
    const localT: Tournament = { ...torneo, pubblicato: true, orgVersion: 5, orgPending: false }
    const res = applyOrgDoc(doc, localT, locali)
    expect(res.matches[0].set).toEqual([{ puntiA: 21, puntiB: 10 }])
    expect(res.matches[0].vincitoreId).toBe('a')
    expect(res.tournament.pubblicato).toBe(true)
    expect(res.tournament.orgVersion).toBe(5)
  })

  it('inizializza punteggi vuoti per match nuovi e rimuove quelli assenti dal cloud', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: torneo, teams: [], groups: [],
      struttura: [{ id: 'nuovo', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
    }
    const locali: Match[] = [match('vecchio', { set: [{ puntiA: 21, puntiB: 9 }], stato: 'conclusa' })]
    const res = applyOrgDoc(doc, torneo, locali)
    expect(res.matches).toHaveLength(1)
    expect(res.matches[0].id).toBe('nuovo')
    expect(res.matches[0].set).toEqual([])
    expect(res.matches[0].stato).toBe('programmata')
  })
})

describe('scriviOrgLocale', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })
  it('sostituisce teams/groups/matches del torneo', async () => {
    await db.teams.bulkPut([team('vecchia')])
    await scriviOrgLocale({
      tournament: torneo, teams: [team('a'), team('b')], groups: [group],
      matches: [match('m1')],
    })
    const teams = await db.teams.where('tournamentId').equals('t1').toArray()
    expect(teams.map((x) => x.id).sort()).toEqual(['a', 'b'])
    const matches = await db.matches.where('tournamentId').equals('t1').toArray()
    expect(matches).toHaveLength(1)
  })
})
