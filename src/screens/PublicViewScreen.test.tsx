import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { PublicSnapshot } from '../types/public'

const snap: PublicSnapshot = {
  codice: 'ABC123', nome: 'Beach Cup', tipologia: '2x2', formato: 'gironi_eliminazione',
  qualificatiPerGirone: 'tutti', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  updatedAt: '2026-07-20T12:00:00.000Z',
  teams: [{ id: 'a', nome: 'Rossi' }, { id: 'b', nome: 'Bianchi' }],
  groups: [{ id: 'g1', nome: 'Girone A', teamIds: ['a', 'b'] }],
  matches: [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }],
}

const getSnapshot = vi.fn()
vi.mock('../services/config', () => ({
  getClient: () => ({ getSnapshot }),
}))

import { PublicViewScreen } from './PublicViewScreen'

describe('PublicViewScreen', () => {
  beforeEach(() => { getSnapshot.mockReset() })

  it('mostra nome torneo, gironi e tabellone dallo snapshot', async () => {
    getSnapshot.mockResolvedValue(snap)
    render(
      <MemoryRouter initialEntries={['/pubblico/ABC123']}>
        <Routes><Route path="/pubblico/:codice" element={<PublicViewScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Beach Cup')).toBeTruthy()
    expect(await screen.findByText('Girone A')).toBeTruthy()
    // i nomi squadra compaiono nella classifica
    expect((await screen.findAllByText('Rossi')).length).toBeGreaterThan(0)
  })

  it('mostra un messaggio se il torneo non è pubblicato', async () => {
    getSnapshot.mockRejectedValue(new Error('torneo non trovato'))
    render(
      <MemoryRouter initialEntries={['/pubblico/NOPE']}>
        <Routes><Route path="/pubblico/:codice" element={<PublicViewScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/non trovato|non ancora pubblicato/i)).toBeTruthy()
  })
})
