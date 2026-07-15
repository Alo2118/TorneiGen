import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Tournament } from '../engine/types'
import { ToastProvider } from './Toast'

const pubblica = vi.fn()
const interrompiPubblicazione = vi.fn()
vi.mock('../services/pubblicazione', () => ({
  pubblica: (...a: unknown[]) => pubblica(...a),
  interrompiPubblicazione: (...a: unknown[]) => interrompiPubblicazione(...a),
}))
vi.mock('../services/config', () => ({ getReadToken: () => 'token' }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }))

import { SharePanel } from './SharePanel'

const base: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('SharePanel', () => {
  beforeEach(() => { pubblica.mockReset(); interrompiPubblicazione.mockReset() })

  it('con torneo non pubblicato mostra il bottone Pubblica', () => {
    render(<ToastProvider><SharePanel tournament={base} /></ToastProvider>)
    expect(screen.getByRole('button', { name: /pubblica/i })).toBeTruthy()
  })

  it('al click su Pubblica chiama il servizio', async () => {
    pubblica.mockResolvedValue(undefined)
    render(<ToastProvider><SharePanel tournament={base} /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: /pubblica/i }))
    await waitFor(() => expect(pubblica).toHaveBeenCalledWith('t1'))
  })

  it('con torneo pubblicato mostra il link pubblico e il QR', async () => {
    render(<ToastProvider><SharePanel tournament={{ ...base, pubblicato: true }} /></ToastProvider>)
    expect(screen.getByText(/\/pubblico\/ABC123/)).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
  })
})
