import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { CalendarScreen } from './CalendarScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-04', stato: 'in_corso',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataPartitaMin: 30,
}

describe('CalendarScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut([
      { id: 'A1', tournamentId: 't1', nome: 'Alfa', stato: 'confermata', origine: 'manuale', players: [] },
      { id: 'B1', tournamentId: 't1', nome: 'Beta', stato: 'confermata', origine: 'manuale', players: [] },
    ])
    await db.matches.put({ id: 'm1', tournamentId: 't1', fase: 'girone', round: 1, teamAId: 'A1', teamBId: 'B1', set: [], stato: 'programmata' })
  })

  it('programma il calendario e mostra le partite per giornata', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/calendario']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/calendario" element={<CalendarScreen />} /></Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /programma calendario/i }))
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
    const m1 = await db.matches.get('m1')
    expect(m1?.orario).toBeTruthy()
  })
})
