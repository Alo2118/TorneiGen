import { describe, it, expect } from 'vitest'
import { numeroGiocatori, validaSquadra } from './teams'
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
