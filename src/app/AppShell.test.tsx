import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider, Toaster } from '../components/Toast'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { AppShell } from './AppShell'
import type { Tournament } from '../engine/types'

vi.mock('../services/auth', () => ({ utenteCorrente: async () => null }))
vi.mock('../db/backup', () => ({ exportBackup: vi.fn() }))
import { exportBackup } from '../db/backup'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/tornei/t1']}>
      <ToastProvider>
        <Routes>
          <Route path="/tornei/:id" element={<AppShell />} />
        </Routes>
        <Toaster />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('AppShell handleExport', () => {
  beforeEach(async () => {
    await db.tournaments.clear()
    await saveTournament(torneo)
    vi.clearAllMocks()
  })

  it('se l\'export fallisce mostra un toast d\'errore e non lascia un <a> orfano nel DOM', async () => {
    vi.mocked(exportBackup).mockRejectedValue(new Error('boom'))
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: /export json/i }))
    expect(await screen.findByText(/export non riuscito/i)).toBeInTheDocument()
    // nessun anchor di download rimasto appeso
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('export riuscito: nessun toast d\'errore e link ripulito', async () => {
    vi.mocked(exportBackup).mockResolvedValue({ tournament: torneo, teams: [], groups: [], matches: [] } as never)
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: /export json/i }))
    await waitFor(() => expect(exportBackup).toHaveBeenCalled())
    expect(screen.queryByText(/export non riuscito/i)).toBeNull()
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
