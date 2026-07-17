import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CalendarGrid } from './CalendarGrid'
import type { Match } from '../engine/types'

function m(id: string, orario: string, campo: string, a: string, b: string): Match {
  return { id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata', orario, campo }
}
const names = { a: 'Rossi', b: 'Bianchi', c: 'Verdi', d: 'Neri' }
const matches = [m('1', '2026-07-20T09:00', '1', 'a', 'b'), m('2', '2026-07-20T09:30', '2', 'c', 'd')]

// jsdom non implementa elementFromPoint: stub minimo per poterlo spiare (vi.spyOn) nei test di drag
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null
}

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
  it('senza callback le partite non hanno pulsanti', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('con onSposta il click sul pulsante Sposta chiama il callback', () => {
    const onSposta = vi.fn()
    render(<CalendarGrid matches={matches} teamNames={names} onSposta={onSposta} />)
    const riga = screen.getByText(/Rossi/).closest('.calendar-grid-match') as HTMLElement
    fireEvent.click(within(riga).getByRole('button', { name: 'Sposta' }))
    expect(onSposta).toHaveBeenCalledWith(matches[0])
  })
  it('non rende nulla se non ci sono partite programmate', () => {
    const { container } = render(<CalendarGrid matches={[]} teamNames={names} />)
    expect(container.querySelector('.calendar-grid')).toBeNull()
  })

  it('mostra il risultato compatto quando ci sono set', () => {
    const matches = [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: 'a', teamBId: 'b', orario: '2026-07-20T19:00', campo: '1', set: [{ puntiA: 21, puntiB: 18 }, { puntiA: 15, puntiB: 12 }], stato: 'conclusa', vincitoreId: 'a' }] as Match[]
    render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} />)
    expect(screen.getByText('21–18 15–12')).toBeInTheDocument()
  })

  it('mostra i pulsanti Punteggio/Sposta solo con le callback', () => {
    const matches = [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: 'a', teamBId: 'b', orario: '2026-07-20T19:00', campo: '1', set: [], stato: 'programmata' }] as Match[]
    const { rerender } = render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} />)
    expect(screen.queryByRole('button', { name: 'Punteggio' })).not.toBeInTheDocument()
    rerender(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} onPunteggio={() => {}} onSposta={() => {}} />)
    expect(screen.getByRole('button', { name: 'Punteggio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sposta' })).toBeInTheDocument()
  })

  it('nasconde Punteggio se una squadra non è definita', () => {
    const matches = [{ id: 'm1', tournamentId: 't', fase: 'tabellone', round: 1, teamAId: 'a', teamBId: null, orario: '2026-07-20T19:00', campo: '1', set: [], stato: 'programmata' }] as Match[]
    render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa' }} onPunteggio={() => {}} onSposta={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Punteggio' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sposta' })).toBeInTheDocument()
  })

  it('il drop su una cella diversa chiama onSpostaSuCella con la cella di destinazione', () => {
    const onSpostaSuCella = vi.fn()
    const { container } = render(<CalendarGrid matches={matches} teamNames={names} onSpostaSuCella={onSpostaSuCella} />)
    const nomi = screen.getByText('Rossi — Bianchi')
    const cellaDestinazione = container.querySelector('[data-orario="09:30"][data-campo="2"]') as HTMLElement
    expect(cellaDestinazione).not.toBeNull()
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(cellaDestinazione)
    fireEvent.pointerDown(nomi, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 0 })
    spy.mockRestore()
    expect(onSpostaSuCella).toHaveBeenCalledTimes(1)
    expect(onSpostaSuCella).toHaveBeenCalledWith(matches[0], { data: '2026-07-20', orario: '09:30', campo: '2' })
  })

  it('il drop sulla stessa cella di origine non chiama onSpostaSuCella (no-op)', () => {
    const onSpostaSuCella = vi.fn()
    const { container } = render(<CalendarGrid matches={matches} teamNames={names} onSpostaSuCella={onSpostaSuCella} />)
    const nomi = screen.getByText('Rossi — Bianchi')
    const cellaOrigine = container.querySelector('[data-orario="09:00"][data-campo="1"]') as HTMLElement
    expect(cellaOrigine).not.toBeNull()
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(cellaOrigine)
    fireEvent.pointerDown(nomi, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 0 })
    spy.mockRestore()
    expect(onSpostaSuCella).not.toHaveBeenCalled()
  })
})
