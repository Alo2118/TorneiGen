import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { RegistrationsAdminScreen } from './RegistrationsAdminScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-14',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'ABC123',
}

describe('RegistrationsAdminScreen', () => {
  beforeEach(async () => { localStorage.clear(); await db.tournaments.clear(); await db.teams.clear(); await saveTournament(t); localStorage.setItem('sessione', 'jwt-finto') })
  afterEach(() => vi.restoreAllMocks())

  it('apre le iscrizioni pubblicando il riepilogo e mostra il link', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ codice: 'ABC123', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', chiuso: false, updatedAt: '' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', f)
    render(
      <MemoryRouter initialEntries={['/tornei/t1/iscrizioni']}>
        <Routes><Route path="/tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /apri iscrizioni/i }))
    expect(await screen.findByText(/iscrizione\/ABC123/i)).toBeInTheDocument()
    // ha chiamato POST /api/torneo con auth
    const call = (f.mock.calls as unknown[][]).find((c) => String(c[0]).endsWith('/api/torneo'))
    expect(call).toBeTruthy()
  })

  it('scarica le iscrizioni (2x2, nome squadra vuoto) e mostra i cognomi, poi importa le squadre selezionate', async () => {
    const risposte = [
      // prima chiamata: elencaIscrizioni — nomeSquadra vuoto (facoltativo nel 2x2), etichetta coi cognomi
      { status: 200, body: { iscrizioni: [{ id: '1', codice: 'ABC123', nomeSquadra: '', createdAt: '', giocatori: [{ nome: 'Anna', cognome: 'Rossi', email: 'a@x.it', telefono: '1' }, { nome: 'Bruno', cognome: 'Bianchi', email: 'c@x.it', telefono: '2' }] }] } },
    ]
    let i = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      const r = risposte[Math.min(i, risposte.length - 1)]; i++
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
    }))
    render(
      <MemoryRouter initialEntries={['/tornei/t1/iscrizioni']}>
        <Routes><Route path="/tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /scarica iscrizioni/i }))
    expect(await screen.findByText('Rossi / Bianchi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /importa/i }))
    const teams = await db.teams.where('tournamentId').equals('t1').toArray()
    expect(teams.some((t) => t.players.some((p) => p.cognome === 'Rossi') && t.players.some((p) => p.cognome === 'Bianchi') && t.origine === 'online' && t.stato === 'in_attesa')).toBe(true)
  })
})
