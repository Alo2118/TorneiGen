import { describe, it, expect } from 'vitest'
import { iscrizioneATeam, nuoveIscrizioni } from './import'
import type { Iscrizione } from '../types/registrations'
import type { Team } from '../engine/types'

const iscr = (nomeSquadra: string): Iscrizione => ({
  id: 'i-' + nomeSquadra, codice: 'ABC', nomeSquadra, createdAt: '',
  giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }],
})

describe('import', () => {
  it('iscrizioneATeam crea una squadra online in attesa', () => {
    const t = iscrizioneATeam(iscr('Squali'), 't1')
    expect(t.tournamentId).toBe('t1')
    expect(t.nome).toBe('Squali')
    expect(t.origine).toBe('online')
    expect(t.stato).toBe('in_attesa')
    expect(t.players).toHaveLength(2)
    expect(t.players[0]).toEqual({ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' })
  })

  it('nuoveIscrizioni scarta i nomi già presenti (case-insensitive)', () => {
    const esistenti: Team[] = [{ id: 'x', tournamentId: 't1', nome: 'squali', players: [], stato: 'confermata', origine: 'manuale' }]
    const out = nuoveIscrizioni([iscr('Squali'), iscr('Delfini')], esistenti, '4x4')
    expect(out.map((i) => i.nomeSquadra)).toEqual(['Delfini'])
  })
})

function isc(id: string, nomeSquadra: string, cognomi: string[]): Iscrizione {
  return { id, codice: 'ABC', nomeSquadra, createdAt: '',
    giocatori: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })) }
}
function tm(id: string, nome: string, cognomi: string[]): Team {
  return { id, tournamentId: 't', nome, stato: 'confermata', origine: 'online',
    players: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })) }
}

describe('nuoveIscrizioni: deduplica per etichetta', () => {
  it('2x2: due coppie con nome vuoto ma cognomi diversi NON vengono fuse', () => {
    const nuove = nuoveIscrizioni(
      [isc('1', '', ['Rossi', 'Bianchi']), isc('2', '', ['Verdi', 'Neri'])],
      [],
      '2x2',
    )
    expect(nuove.map((i) => i.id)).toEqual(['1', '2'])
  })
  it('2x2: scarta l\'iscrizione la cui etichetta (cognomi) coincide con una squadra esistente', () => {
    const nuove = nuoveIscrizioni(
      [isc('1', '', ['Rossi', 'Bianchi']), isc('2', '', ['Verdi', 'Neri'])],
      [tm('t1', 'Qualcosa', ['Rossi', 'Bianchi'])],
      '2x2',
    )
    expect(nuove.map((i) => i.id)).toEqual(['2'])
  })
})
