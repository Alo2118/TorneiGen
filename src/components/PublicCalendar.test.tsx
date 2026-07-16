import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicCalendar } from './PublicCalendar'
import type { Match } from '../engine/types'

function m(id: string, orario: string | undefined, campo: string | undefined, a: string, b: string): Match {
  return { id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata', orario, campo }
}
const names = { a: 'Rossi', b: 'Bianchi', c: 'Verdi', d: 'Neri' }

describe('PublicCalendar', () => {
  it('mostra le partite programmate raggruppate per data con orario e campo', () => {
    const matches = [
      m('1', '2026-07-20T09:00', '1', 'a', 'b'),
      m('2', '2026-07-20T10:00', '2', 'c', 'd'),
    ]
    render(<PublicCalendar matches={matches} teamNames={names} />)
    expect(screen.getByText('2026-07-20')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText(/Campo 1/)).toBeTruthy()
  })
  it('non renderizza nulla se nessuna partita è programmata', () => {
    const { container } = render(<PublicCalendar matches={[m('1', undefined, undefined, 'a', 'b')]} teamNames={names} />)
    expect(container.querySelector('.public-calendar')).toBeNull()
  })
})
