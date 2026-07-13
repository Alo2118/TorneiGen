import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { StandingsScreen } from './StandingsScreen'
import type { Tournament, Team, Group, Match } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
const teams: Team[] = [
  { id: 'A', tournamentId: 't1', nome: 'Alfa', stato: 'confermata', origine: 'manuale', players: [] },
  { id: 'B', tournamentId: 't1', nome: 'Beta', stato: 'confermata', origine: 'manuale', players: [] },
]
const g: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['A', 'B'] }
const m: Match = { id: 'm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' }

describe('StandingsScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t); await db.teams.bulkPut(teams); await db.groups.put(g); await db.matches.put(m)
  })

  it('mostra la classifica con la squadra in testa', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/classifiche']}>
        <Routes><Route path="/tornei/:id/classifiche" element={<StandingsScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
  })
})
