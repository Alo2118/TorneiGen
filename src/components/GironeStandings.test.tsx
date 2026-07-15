import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GironeStandings } from './GironeStandings'
import type { Group, Match, RegolePunteggio } from '../engine/types'

const regole: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const group: Group = { id: 'g', tournamentId: 't', nome: 'Girone A', teamIds: ['A', 'B', 'C'] }
function gm(id: string, a: string, b: string, pa: number, pb: number): Match {
  return { id, tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }], stato: 'conclusa', vincitoreId: pa > pb ? a : b }
}
const matches = [gm('m1', 'A', 'B', 21, 10), gm('m2', 'A', 'C', 21, 12), gm('m3', 'B', 'C', 21, 15)]
const names = { A: 'Rossi', B: 'Bianchi', C: 'Verdi' }

describe('GironeStandings', () => {
  it('mostra il nome del girone e una riga per squadra', () => {
    const { container, getByText } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati="tutti" />)
    expect(getByText('Girone A')).toBeTruthy()
    expect(container.querySelectorAll('tbody tr').length).toBe(3)
  })
  it('con qualificati=2, evidenzia le prime due righe', () => {
    const { container } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati={2} />)
    expect(container.querySelectorAll('.standings-row-qualificata').length).toBe(2)
  })
  it('con qualificati="tutti", evidenzia tutte le righe', () => {
    const { container } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati="tutti" />)
    expect(container.querySelectorAll('.standings-row-qualificata').length).toBe(3)
  })
})
