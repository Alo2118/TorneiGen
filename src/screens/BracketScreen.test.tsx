import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { BracketScreen } from './BracketScreen'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: id, stato: 'confermata', origine: 'manuale', players: [] }
}

describe('BracketScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut([team('A'), team('B'), team('C')])
  })

  it('genera le partite del girone al click su Genera', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
    // 3 squadre round robin = 3 partite: A gioca 2 volte, quindi il suo nome compare più volte
    expect((await screen.findAllByText('A')).length).toBeGreaterThan(0)
    expect((await db.matches.where('tournamentId').equals('t1').toArray()).length).toBe(3)
  })

  it('apre il controllo punteggio, salva il risultato e aggiorna la vista', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))

    const [primoBottone] = await screen.findAllByRole('button', { name: /inserisci risultato/i })
    await userEvent.click(primoBottone)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const piuA = screen.getByRole('button', { name: /aumenta punteggio squadra a, set 1/i })
    for (let i = 0; i < 21; i++) fireEvent.click(piuA)
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    // Race-tolerant: il dialog può già essersi chiuso prima che l'assert inizi ad
    // osservare (waitForElementToBeRemoved lancerebbe in quel caso). waitFor con
    // queryByRole invece passa sia se il dialog è già assente sia se sparisce dopo.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Verifica deterministica dell'esito reale: il salvataggio è avvenuto in db,
    // indipendentemente dai tempi di chiusura del dialog.
    await waitFor(async () => {
      const salvate = await db.matches.where('tournamentId').equals('t1').toArray()
      expect(salvate.some((m) => m.stato === 'conclusa')).toBe(true)
    })
  })

  it('sposta il focus dentro il dialog all\'apertura e lo ripristina sul trigger alla chiusura', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))

    const [trigger] = await screen.findAllByRole('button', { name: /inserisci risultato/i })
    await userEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})
