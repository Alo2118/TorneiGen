import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament } from '../db/repositories'
import { buildSnapshot, pubblicaSeAttivo, interrompiPubblicazione } from './pubblicazione'
import type { Tournament, Team, Group, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
    players: [{ nome: 'Mario', cognome: `Cognome${id}`, email: 'mario@x.it', telefono: '3330000000' }] }
}
const group: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['a', 'b'] }
const match: Match = { id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }

describe('buildSnapshot', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(torneo)
    await db.teams.bulkPut([team('a'), team('b')])
    await db.groups.put(group)
    await db.matches.put(match)
  })

  it('usa il codice iscrizione come codice pubblico', async () => {
    const s = await buildSnapshot('t1')
    expect(s.codice).toBe('ABC123')
  })

  it('riduce le squadre a id+nome SENZA dati personali', async () => {
    const s = await buildSnapshot('t1')
    expect(s.teams).toEqual([
      { id: 'a', nome: 'Cognomea' },
      { id: 'b', nome: 'Cognomeb' },
    ])
    // nessun campo players/email/telefono nello snapshot serializzato
    expect(JSON.stringify(s)).not.toContain('mario@x.it')
    expect(JSON.stringify(s)).not.toContain('players')
  })

  it('include gironi, partite, regole e updatedAt', async () => {
    const s = await buildSnapshot('t1')
    expect(s.groups).toHaveLength(1)
    expect(s.matches).toHaveLength(1)
    expect(s.regolePunteggio.puntiSet).toBe(21)
    expect(s.updatedAt).not.toBe('')
  })
})

describe('pubblicaSeAttivo (guardie)', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })
  it('non fa nulla (e non lancia) se il torneo non è pubblicato', async () => {
    await saveTournament({ ...torneo, pubblicato: false })
    await expect(pubblicaSeAttivo('t1')).resolves.toBeUndefined()
  })
  it('non lancia se il torneo non esiste', async () => {
    await expect(pubblicaSeAttivo('inesistente')).resolves.toBeUndefined()
  })
})

describe('interrompiPubblicazione', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })
  // se la rimozione remota fallisce (rete non raggiungibile nei test), l'errore si propaga
  // e il flag `pubblicato` NON viene azzerato: niente falso "interrotta" con snapshot orfano.
  it('NON azzera il flag se la rimozione remota fallisce', async () => {
    await saveTournament({ ...torneo, pubblicato: true })
    await expect(interrompiPubblicazione('t1')).rejects.toBeTruthy()
    const t = await getTournament('t1')
    expect(t?.pubblicato).toBe(true)
  })
})
