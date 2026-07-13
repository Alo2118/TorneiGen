import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
