import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { HomeScreen } from './HomeScreen'
import type { Tournament } from '../engine/types'

vi.mock('../services/orgSync', () => ({
  caricaDalCloud: vi.fn(),
}))

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('HomeScreen', () => {
  beforeEach(async () => {
    await db.tournaments.clear()
    localStorage.removeItem('sessione')
    vi.clearAllMocks()
  })

  it('mostra i tornei esistenti', async () => {
    await saveTournament(t)
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
  })

  it('mostra un invito quando non ci sono tornei', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText(/nessun torneo/i)).toBeInTheDocument()
  })

  it('senza sessione, "Carica dal cloud" chiede di accedere', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /carica dal cloud/i }))
    await user.type(screen.getByLabelText(/codice torneo/i), 'ABC123')
    await user.click(screen.getByRole('button', { name: /^carica$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/accedi prima/i)
    const { caricaDalCloud } = await import('../services/orgSync')
    expect(caricaDalCloud).not.toHaveBeenCalled()
  })

  it('con una sessione attiva, tenta il caricamento dal cloud', async () => {
    localStorage.setItem('sessione', 'x')
    const { caricaDalCloud } = await import('../services/orgSync')
    vi.mocked(caricaDalCloud).mockResolvedValue('t1')
    const user = userEvent.setup()
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /carica dal cloud/i }))
    await user.type(screen.getByLabelText(/codice torneo/i), 'ABC123')
    await user.click(screen.getByRole('button', { name: /^carica$/i }))
    expect(caricaDalCloud).toHaveBeenCalledWith('ABC123')
  })
})
