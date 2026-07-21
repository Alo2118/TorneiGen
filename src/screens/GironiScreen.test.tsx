import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament, groupsOf } from '../db/repositories'
import { GironiScreen } from './GironiScreen'
import type { Tournament, Team, Group, Match } from '../engine/types'

vi.mock('../services/orgSync', () => ({ notificaModificaOrg: vi.fn(), sincronizzabile: () => false }))

if (!document.elementFromPoint) document.elementFromPoint = () => null

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '4x4', formato: 'gironi_eliminazione', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
const team = (id: string): Team => ({ id, tournamentId: 't1', nome: id, stato: 'confermata', origine: 'manuale', players: [] })
const groups: Group[] = [
  { id: 'A', tournamentId: 't1', nome: 'Girone A', teamIds: ['t1', 't2', 't3'] },
  { id: 'B', tournamentId: 't1', nome: 'Girone B', teamIds: ['t4', 't5', 't6'] },
]
const matchGir = (id: string, g: string, a: string, b: string): Match =>
  ({ id, tournamentId: 't1', fase: 'girone', groupId: g, round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata' })

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/tornei/t1/gironi']}>
      <Routes><Route path="/tornei/:id/gironi" element={<GironiScreen />} /></Routes>
    </MemoryRouter>,
  )
}

describe('GironiScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut(['t1', 't2', 't3', 't4', 't5', 't6'].map(team))
    await db.groups.bulkPut(groups)
    await db.matches.bulkPut([matchGir('m1', 'A', 't1', 't2'), matchGir('m2', 'B', 't4', 't5')])
  })

  it('mostra i gironi con le loro squadre', async () => {
    renderAt()
    expect(await screen.findByText('Girone A')).toBeInTheDocument()
    expect(screen.getByText('Girone B')).toBeInTheDocument()
    expect(screen.getByText('t3')).toBeInTheDocument()
  })

  it('trascinare una squadra in un altro girone aggiorna la composizione', async () => {
    const { container } = renderAt()
    const chip = await screen.findByText('t3')
    const colB = container.querySelector('[data-girone="B"]') as HTMLElement
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(colB)
    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 0 })
    spy.mockRestore()

    await waitFor(async () => {
      const gs = await groupsOf('t1')
      expect(gs.find((g) => g.id === 'B')!.teamIds).toContain('t3')
      expect(gs.find((g) => g.id === 'A')!.teamIds).not.toContain('t3')
    })
  })

  it('"Aggiungi girone" crea un nuovo girone vuoto', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /aggiungi girone/i }))
    expect(await screen.findByText('Girone C')).toBeInTheDocument()
  })

  it('per un formato senza gironi mostra un avviso', async () => {
    await saveTournament({ ...t, formato: 'eliminazione_diretta' })
    renderAt()
    expect(await screen.findByText(/non usa i gironi/i)).toBeInTheDocument()
  })
})
