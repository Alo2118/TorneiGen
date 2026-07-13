import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import { exportBackup, importBackup } from './backup'
import type { Tournament, Team, Group, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Test', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

const team: Team = {
  id: 'team1',
  tournamentId: 't1',
  nome: 'Squadra Uno',
  players: [
    { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com', telefono: '3331234567' },
    { nome: 'Luigi', cognome: 'Verdi', email: 'luigi@example.com', telefono: '3337654321' },
  ],
  stato: 'confermata',
  origine: 'manuale',
}

const teamAltroTorneo: Team = {
  id: 'team-foreign',
  tournamentId: 't2',
  nome: 'Squadra Estranea',
  players: [
    { nome: 'Foo', cognome: 'Bar', email: 'foo@example.com', telefono: '3330000000' },
    { nome: 'Baz', cognome: 'Qux', email: 'baz@example.com', telefono: '3339999999' },
  ],
  stato: 'confermata',
  origine: 'manuale',
}

const group: Group = {
  id: 'group1',
  tournamentId: 't1',
  nome: 'Girone A',
  teamIds: ['team1'],
}

const match: Match = {
  id: 'match1',
  tournamentId: 't1',
  fase: 'girone',
  groupId: 'group1',
  round: 1,
  teamAId: 'team1',
  teamBId: null,
  set: [],
  stato: 'programmata',
}

describe('backup', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })

  it('esporta e reimporta un torneo completo, isolando teams/groups/matches per tournamentId', async () => {
    await db.tournaments.put(torneo)
    await db.teams.put(team)
    await db.teams.put(teamAltroTorneo)
    await db.groups.put(group)
    await db.matches.put(match)

    const data = await exportBackup('t1')

    // il filtro tournamentId isola correttamente le righe figlie
    expect(data.teams).toHaveLength(1)
    expect(data.teams[0].id).toBe('team1')
    expect(data.teams.some((t) => t.id === 'team-foreign')).toBe(false)
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].id).toBe('group1')
    expect(data.matches).toHaveLength(1)
    expect(data.matches[0].id).toBe('match1')

    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await importBackup(data)

    const letto = await db.tournaments.get('t1')
    expect(letto?.nome).toBe('Test')

    const teamLetto = await db.teams.get('team1')
    expect(teamLetto?.nome).toBe('Squadra Uno')
    expect(teamLetto?.players).toHaveLength(2)

    const groupLetto = await db.groups.get('group1')
    expect(groupLetto?.teamIds).toEqual(['team1'])

    const matchLetto = await db.matches.get('match1')
    expect(matchLetto?.teamAId).toBe('team1')
  })
})
