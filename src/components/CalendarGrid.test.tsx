import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarGrid } from './CalendarGrid'
import type { Match } from '../engine/types'

function m(id: string, orario: string, campo: string, a: string, b: string): Match {
  return { id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata', orario, campo }
}
const names = { a: 'Rossi', b: 'Bianchi', c: 'Verdi', d: 'Neri' }
const matches = [m('1', '2026-07-20T09:00', '1', 'a', 'b'), m('2', '2026-07-20T09:30', '2', 'c', 'd')]

describe('CalendarGrid', () => {
  it('rende le intestazioni dei campi e la colonna degli orari', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    expect(screen.getByText('Campo 1')).toBeTruthy()
    expect(screen.getByText('Campo 2')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText('09:30')).toBeTruthy()
  })
  it('mostra "—" nelle celle senza partita', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    // 2 orari × 2 campi = 4 celle, 2 piene -> 2 vuote
    expect(screen.getAllByText('—').length).toBe(2)
  })
  it('senza onSeleziona le partite non sono cliccabili', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('con onSeleziona il click su una partita chiama il callback', () => {
    const onSeleziona = vi.fn()
    render(<CalendarGrid matches={matches} teamNames={names} onSeleziona={onSeleziona} />)
    fireEvent.click(screen.getByRole('button', { name: /Rossi/ }))
    expect(onSeleziona).toHaveBeenCalledWith(matches[0])
  })
  it('non rende nulla se non ci sono partite programmate', () => {
    const { container } = render(<CalendarGrid matches={[]} teamNames={names} />)
    expect(container.querySelector('.calendar-grid')).toBeNull()
  })
})
