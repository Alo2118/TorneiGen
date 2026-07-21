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
    expect(await screen.findByText('Bo / Ci')).toBeInTheDocument()
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

  it('4x4: "Aggiungi solo nome" crea una squadra senza giocatori', async () => {
    await db.tournaments.clear()
    await db.teams.clear()
    await saveTournament({ ...t, id: 't4', tipologia: '4x4', nome: '4x4 Misto' })
    render(
      <MemoryRouter initialEntries={['/tornei/t4/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.type(await screen.findByLabelText('Nome squadra'), 'ACE TEAM')
    await userEvent.click(screen.getByRole('button', { name: /solo nome/i }))
    expect(await screen.findByText('ACE TEAM')).toBeTruthy()
    const create = (await db.teams.where('tournamentId').equals('t4').toArray()).find((x) => x.nome === 'ACE TEAM')
    expect(create?.players).toEqual([])
    expect(create?.stato).toBe('confermata')
  })

  it('4x4: "Aggiungi solo nome" senza nome mostra errore e non salva', async () => {
    await db.tournaments.clear()
    await db.teams.clear()
    await saveTournament({ ...t, id: 't4', tipologia: '4x4', nome: '4x4 Misto' })
    render(
      <MemoryRouter initialEntries={['/tornei/t4/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /solo nome/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nome squadra/i)
    expect(await db.teams.where('tournamentId').equals('t4').count()).toBe(0)
  })

  it('2x2: salva una coppia senza nome squadra e la mostra coi cognomi', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    // compila i 2 giocatori (nome/cognome/email/telefono) lasciando vuoto "Nome squadra (facoltativo)"
    const cognomi = await screen.findAllByLabelText('Cognome')
    await userEvent.type(cognomi[0], 'Rossi')
    await userEvent.type(cognomi[1], 'Bianchi')
    const nomi = screen.getAllByLabelText('Nome')
    const email = screen.getAllByLabelText('Email')
    const tel = screen.getAllByLabelText('Telefono')
    for (let i = 0; i < 2; i++) {
      await userEvent.type(nomi[i], `G${i}`)
      await userEvent.type(email[i], `g${i}@x.it`)
      await userEvent.type(tel[i], '3330000000')
    }
    await userEvent.click(screen.getByRole('button', { name: /aggiungi squadra/i }))
    expect(await screen.findByText('Rossi / Bianchi')).toBeTruthy()
  })
})
