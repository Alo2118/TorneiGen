import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Tournament } from '../engine/types'
import { ToastProvider } from './Toast'

const pubblica = vi.fn()
const interrompiPubblicazione = vi.fn()
vi.mock('../services/pubblicazione', () => ({
  pubblica: (...a: unknown[]) => pubblica(...a),
  interrompiPubblicazione: (...a: unknown[]) => interrompiPubblicazione(...a),
}))
const getSessione = vi.fn<() => string | undefined>(() => 'jwt-finto')
vi.mock('../services/config', () => ({ getSessione: () => getSessione() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }))

import { SharePanel } from './SharePanel'

const base: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

function renderPanel(tournament: Tournament) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<SharePanel tournament={tournament} />} />
          <Route path="/accesso" element={<p>Accesso</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  )
}

describe('SharePanel', () => {
  beforeEach(() => {
    pubblica.mockReset()
    interrompiPubblicazione.mockReset()
    getSessione.mockReset()
    getSessione.mockReturnValue('jwt-finto')
  })

  it('con torneo non pubblicato mostra il bottone Pubblica', () => {
    renderPanel(base)
    expect(screen.getByRole('button', { name: /pubblica/i })).toBeTruthy()
  })

  it('al click su Pubblica chiama il servizio', async () => {
    pubblica.mockResolvedValue(undefined)
    renderPanel(base)
    await userEvent.click(screen.getByRole('button', { name: /pubblica/i }))
    await waitFor(() => expect(pubblica).toHaveBeenCalledWith('t1'))
  })

  it('con torneo pubblicato mostra il link pubblico e il QR', async () => {
    renderPanel({ ...base, pubblicato: true })
    expect(screen.getByText(/\/pubblico\/ABC123/)).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
  })

  it('senza sessione mostra un invito Accedi e nasconde il bottone Pubblica', () => {
    getSessione.mockReturnValue(undefined)
    renderPanel(base)
    expect(screen.queryByRole('button', { name: /pubblica/i })).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /accedi/i })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/accesso')
  })

  it('con sessione mostra il bottone Pubblica e nessun invito Accedi', () => {
    getSessione.mockReturnValue('jwt-finto')
    renderPanel(base)
    expect(screen.getByRole('button', { name: /pubblica/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /accedi/i })).not.toBeInTheDocument()
  })

  it('torneo pubblicato senza sessione: nasconde Interrompi pubblicazione e mostra invito Accedi', () => {
    getSessione.mockReturnValue(undefined)
    renderPanel({ ...base, pubblicato: true })
    expect(screen.queryByRole('button', { name: /interrompi pubblicazione/i })).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /accedi/i })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/accesso')
  })

  it('torneo pubblicato con sessione: mostra il bottone Interrompi pubblicazione', () => {
    getSessione.mockReturnValue('jwt-finto')
    renderPanel({ ...base, pubblicato: true })
    expect(screen.getByRole('button', { name: /interrompi pubblicazione/i })).toBeTruthy()
  })
})
