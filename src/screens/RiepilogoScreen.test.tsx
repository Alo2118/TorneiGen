import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { RiepilogoScreen } from './RiepilogoScreen'
import { ToastProvider, Toaster } from '../components/Toast'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-01',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'ABC',
}

describe('RiepilogoScreen', () => {
  beforeEach(async () => { localStorage.clear(); await Promise.all([db.tournaments.clear(), db.teams.clear(), db.matches.clear()]); await saveTournament(t) })
  afterEach(() => vi.restoreAllMocks())

  it('mostra il nome e un prossimo passo (aggiungi squadre)', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
    expect(await screen.findByText(/aggiungi le squadre/i)).toBeInTheDocument()
  })

  it('auto-importa le nuove iscrizioni come squadre in attesa', async () => {
    localStorage.setItem('readToken', 'tok')
    const f = vi.fn(async () => new Response(JSON.stringify({ iscrizioni: [{ id: '1', codice: 'ABC', nomeSquadra: 'Squali', createdAt: '', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', f)
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Coppa Estate')
    await vi.waitFor(async () => {
      const teams = await db.teams.where('tournamentId').equals('t1').toArray()
      expect(teams.some((t) => t.nome === 'Squali' && t.stato === 'in_attesa')).toBe(true)
    })
  })

  it('mostra un toast di errore quando il token non è valido (401)', async () => {
    localStorage.setItem('readToken', 'sbagliato')
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'non autorizzato' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', f)
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Coppa Estate')
    expect(await screen.findByText(/token non valido/i)).toBeInTheDocument()
  })

  it('conferma tutte le squadre in attesa', async () => {
    await db.teams.bulkPut([
      { id: 's1', tournamentId: 't1', nome: 'Squali', players: [], stato: 'in_attesa', origine: 'manuale' },
      { id: 's2', tournamentId: 't1', nome: 'Delfini', players: [], stato: 'confermata', origine: 'manuale' },
    ])
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Coppa Estate')
    await userEvent.click(await screen.findByRole('button', { name: /conferma tutte/i }))
    await vi.waitFor(async () => {
      const teams = await db.teams.where('tournamentId').equals('t1').toArray()
      expect(teams.every((t) => t.stato === 'confermata')).toBe(true)
    })
  })
})
