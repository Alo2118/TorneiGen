import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale, strutturaDiverge } from './orgDoc'
import type { OrgDoc } from '../types/org'
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
    expect(JSON.stringify(doc.struttura)).not.toContain('conclusa')
  })

  it('include i risultati (set/vincitore/stato) nella sezione risultati', async () => {
    const doc = await buildOrgDoc('t1')
    expect(doc.risultati).toEqual([
      { id: 'm1', set: [{ puntiA: 21, puntiB: 15 }], vincitoreId: 'a', stato: 'conclusa' },
    ])
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

  it('prende il risultato dal cloud quando la sezione risultati lo contiene', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: torneo, teams: [], groups: [],
      struttura: [{ id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
      risultati: [{ id: 'm1', set: [{ puntiA: 15, puntiB: 21 }], vincitoreId: 'b', stato: 'conclusa' }],
    }
    // il locale aveva un risultato diverso: vince il cloud
    const locali: Match[] = [match('m1', { set: [{ puntiA: 21, puntiB: 10 }], stato: 'conclusa', vincitoreId: 'a' })]
    const res = applyOrgDoc(doc, torneo, locali)
    expect(res.matches[0].set).toEqual([{ puntiA: 15, puntiB: 21 }])
    expect(res.matches[0].vincitoreId).toBe('b')
    expect(res.matches[0].stato).toBe('conclusa')
  })

  it('unione: tiene il risultato locale per le partite che il cloud non ha ancora', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: torneo, teams: [], groups: [],
      struttura: [
        { id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' },
        { id: 'm2', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'c', teamBId: 'd' },
      ],
      risultati: [{ id: 'm1', set: [{ puntiA: 21, puntiB: 9 }], vincitoreId: 'a', stato: 'conclusa' }],
    }
    // m2 segnata solo in locale: non deve andare persa
    const locali: Match[] = [match('m2', { set: [{ puntiA: 21, puntiB: 12 }], stato: 'conclusa', vincitoreId: 'c' })]
    const res = applyOrgDoc(doc, torneo, locali)
    const m1 = res.matches.find((m) => m.id === 'm1')!
    const m2 = res.matches.find((m) => m.id === 'm2')!
    expect(m1.set).toEqual([{ puntiA: 21, puntiB: 9 }]) // dal cloud
    expect(m2.set).toEqual([{ puntiA: 21, puntiB: 12 }]) // dal locale, preservato
    expect(m2.vincitoreId).toBe('c')
  })

  it('ricalcola l\'avanzamento del tabellone dopo il merge (coerenza struttura/risultati)', () => {
    const doc: OrgDoc = {
      tournament: torneo, teams: [], groups: [],
      struttura: [
        { id: 's1', tournamentId: 't1', fase: 'tabellone', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B' },
        { id: 'f', tournamentId: 't1', fase: 'tabellone', round: 2, posizioneTabellone: 0, teamAId: null, teamBId: null },
      ],
      risultati: [], // il cloud non ha ancora il risultato di s1
    }
    // s1 è concluso solo in locale: dopo il merge il vincitore deve avanzare in finale
    const locali: Match[] = [
      match('s1', { fase: 'tabellone', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], stato: 'conclusa', vincitoreId: 'A' }),
    ]
    const res = applyOrgDoc(doc, torneo, locali)
    const f = res.matches.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('A')
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

describe('strutturaDiverge', () => {
  const base: OrgDoc = {
    tournament: torneo, teams: [team('a'), team('b')], groups: [group],
    struttura: [{ id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
  }
  it('è falsa se cambiano solo i risultati (stessa struttura)', () => {
    const conRisultati: OrgDoc = { ...base, risultati: [{ id: 'm1', set: [{ puntiA: 21, puntiB: 9 }], vincitoreId: 'a', stato: 'conclusa' }] }
    expect(strutturaDiverge(base, conRisultati)).toBe(false)
  })
  it('non dipende dall\'ordine di squadre/gironi/struttura', () => {
    const riordinato: OrgDoc = { ...base, teams: [team('b'), team('a')] }
    expect(strutturaDiverge(base, riordinato)).toBe(false)
  })
  it('è vera se cambia la struttura (nome torneo, squadre, tabellone)', () => {
    expect(strutturaDiverge(base, { ...base, tournament: { ...torneo, nome: 'Altro' } })).toBe(true)
    expect(strutturaDiverge(base, { ...base, teams: [team('a')] })).toBe(true)
    expect(strutturaDiverge(base, { ...base, struttura: [] })).toBe(true)
  })
  it('gestisce documenti incompleti senza lanciare', () => {
    expect(strutturaDiverge(base, {} as OrgDoc)).toBe(true)
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
