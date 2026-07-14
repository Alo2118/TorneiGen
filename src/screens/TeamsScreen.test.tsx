import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { TeamsScreen } from './TeamsScreen'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
const team: Team = {
  id: 'x', tournamentId: 't1', nome: 'Squali', stato: 'confermata', origine: 'manuale',
  players: [{ nome: 'Anna', cognome: 'Bo', email: 'a@x.it', telefono: '1' }, { nome: 'Bea', cognome: 'Ci', email: 'b@x.it', telefono: '2' }],
}

describe('TeamsScreen', () => {
  beforeEach(async () => { await db.tournaments.clear(); await db.teams.clear(); await saveTournament(t); await db.teams.put(team) })

  it('elenca le squadre del torneo', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Squali')).toBeInTheDocument()
  })

  it('conferma una squadra in attesa', async () => {
    await db.teams.put({ id: 'w', tournamentId: 't1', nome: 'Online', stato: 'in_attesa', origine: 'online', players: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] })
    render(
      <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /conferma/i }))
    const t = await db.teams.get('w')
    expect(t?.stato).toBe('confermata')
  })
})
