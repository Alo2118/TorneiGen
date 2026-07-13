import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
