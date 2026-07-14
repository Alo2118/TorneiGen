import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { RiepilogoScreen } from './RiepilogoScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-01',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'ABC',
}

describe('RiepilogoScreen', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.teams.clear(), db.matches.clear()]); await saveTournament(t) })

  it('mostra il nome e un prossimo passo (aggiungi squadre)', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
    expect(await screen.findByText(/aggiungi le squadre/i)).toBeInTheDocument()
  })
})
