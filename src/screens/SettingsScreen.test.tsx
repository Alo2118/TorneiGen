import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsScreen } from './SettingsScreen'
import { getApiBaseUrl } from '../services/config'
import { utenteCorrente, esci } from '../services/auth'

vi.mock('../services/auth', () => ({
  utenteCorrente: vi.fn(),
  esci: vi.fn(),
}))

describe('SettingsScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('salva URL API', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue(null)
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/url api/i), 'https://api.esempio.dev')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
  })

  it('mostra il link per accedere quando non loggato', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue(null)
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /accedi o registrati/i })).toBeInTheDocument()
  })

  it('mostra lo stato sessione ed Esci quando loggato', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue({ email: 'a@b.it', ruolo: 'utente', societaId: null })
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    expect(await screen.findByText(/accesso come a@b\.it \(utente\)/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /esci/i }))
    expect(esci).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /accedi o registrati/i })).toBeInTheDocument()
  })
})
