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
  beforeEach(async () => { localStorage.clear(); await db.tournaments.clear(); await saveTournament(t); localStorage.setItem('readToken', 'tok') })
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
})
