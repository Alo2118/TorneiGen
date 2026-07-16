import { describe, it, expect } from 'vitest'
import { numeroGiocatori, validaSquadra, etichettaSquadra, mappaEtichette } from './teams'
import type { Team } from '../engine/types'

function squadra(n: number): Team {
  return {
    id: 't', tournamentId: 't1', nome: 'S', stato: 'confermata', origine: 'manuale',
    players: Array.from({ length: n }, (_, i) => ({ nome: `N${i}`, cognome: `C${i}`, email: `a${i}@x.it`, telefono: '123' })),
  }
}

describe('teams', () => {
  it('2x2 richiede 2 giocatori', () => {
    expect(numeroGiocatori('2x2')).toEqual({ min: 2, max: 2 })
    expect(validaSquadra(squadra(2), '2x2')).toBeNull()
    expect(validaSquadra(squadra(1), '2x2')).toMatch(/2/)
  })
  it('4x4 accetta da 4 a 8 giocatori', () => {
    expect(numeroGiocatori('4x4')).toEqual({ min: 4, max: 8 })
    expect(validaSquadra(squadra(4), '4x4')).toBeNull()
    expect(validaSquadra(squadra(8), '4x4')).toBeNull()
    expect(validaSquadra(squadra(3), '4x4')).toMatch(/4/)
    expect(validaSquadra(squadra(9), '4x4')).toMatch(/8/)
  })
})

function sq(id: string, nome: string, cognomi: string[]): Team {
  return {
    id, tournamentId: 't', nome, stato: 'confermata', origine: 'manuale',
    players: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })),
  }
}

describe('etichettaSquadra', () => {
  it('2x2: unisce i due cognomi con " / "', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', 'Bianchi']), '2x2')).toBe('Rossi / Bianchi')
  })
  it('2x2: usa solo i cognomi presenti', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', '']), '2x2')).toBe('Rossi')
  })
  it('2x2: senza cognomi ripiega sul nome squadra', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['', '']), '2x2')).toBe('Squali')
  })
  it('2x2: senza cognomi e senza nome ripiega sull\'id', () => {
    expect(etichettaSquadra(sq('a', '', []), '2x2')).toBe('a')
  })
  it('4x4: usa il nome squadra', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', 'Bianchi', 'Verdi', 'Neri']), '4x4')).toBe('Squali')
  })
})

describe('mappaEtichette', () => {
  it('costruisce la mappa id -> etichetta', () => {
    const teams = [sq('a', 'Squali', ['Rossi', 'Bianchi']), sq('b', 'Onde', ['Verdi', 'Neri'])]
    expect(mappaEtichette(teams, '2x2')).toEqual({ a: 'Rossi / Bianchi', b: 'Verdi / Neri' })
  })
})

describe('validaSquadra: nome opzionale nel 2x2', () => {
  it('2x2 senza nome è valida (se i giocatori sono completi)', () => {
    expect(validaSquadra(sq('a', '', ['Rossi', 'Bianchi']), '2x2')).toBeNull()
  })
  it('4x4 senza nome NON è valida', () => {
    expect(validaSquadra(sq('a', '', ['Rossi', 'Bianchi', 'Verdi', 'Neri']), '4x4')).toBe('Il nome squadra è obbligatorio')
  })
})
