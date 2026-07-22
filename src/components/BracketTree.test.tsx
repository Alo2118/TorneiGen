import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BracketTree } from './BracketTree'
import type { Match } from '../engine/types'

function md(p: Partial<Match> & { id: string }): Match {
  return { tournamentId: 't', fase: 'tabellone', round: 1, teamAId: null, teamBId: null, set: [], stato: 'programmata', ...p }
}
const m: Match[] = [
  md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreId: 'A', stato: 'conclusa', set: [{ puntiA: 21, puntiB: 10 }] }),
  md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreId: 'C', stato: 'conclusa', set: [{ puntiA: 21, puntiB: 12 }] }),
  md({ id: 'f', round: 2, posizioneTabellone: 0, teamAId: 'A', teamBId: 'C' }),
]
const names = { A: 'Rossi', B: 'Bianchi', C: 'Verdi', D: 'Neri' }

describe('BracketTree', () => {
  it('disegna un box per partita e le linee di collegamento', () => {
    const { container } = render(<BracketTree matches={m} teamNames={names} variant="statico" />)
    expect(container.querySelectorAll('.match-box').length).toBe(3)
    expect(container.querySelectorAll('.bracket-segment').length).toBeGreaterThan(0)
  })
  it('nella variante interattiva il click su una partita chiama onMatchClick', () => {
    const onMatchClick = vi.fn()
    render(<BracketTree matches={m} teamNames={names} variant="interattivo" onMatchClick={onMatchClick} />)
    // "Rossi" (team A) appare in due box (match 'a' e match 'f' di avanzamento): prendiamo il primo.
    fireEvent.click(screen.getAllByRole('button', { name: /Rossi/ })[0])
    expect(onMatchClick).toHaveBeenCalled()
  })
  it('mostra i controlli zoom (Adatta)', () => {
    render(<BracketTree matches={m} teamNames={names} variant="statico" />)
    expect(screen.getByRole('button', { name: /adatta/i })).toBeTruthy()
  })
  it('mostra un hint per esplorare il tabellone (trascina/zoom)', () => {
    render(<BracketTree matches={m} teamNames={names} variant="statico" />)
    expect(screen.getByText(/trascina/i)).toBeInTheDocument()
  })
})
