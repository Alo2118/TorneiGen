import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { HomeScreen } from './HomeScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('HomeScreen', () => {
  beforeEach(async () => { await db.tournaments.clear() })

  it('mostra i tornei esistenti', async () => {
    await saveTournament(t)
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
  })

  it('mostra un invito quando non ci sono tornei', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText(/nuovo torneo/i)).toBeInTheDocument()
  })
})
