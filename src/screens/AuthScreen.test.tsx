import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthScreen } from './AuthScreen'
import { accedi, registra } from '../services/auth'

vi.mock('../services/auth', () => ({
  accedi: vi.fn(),
  registra: vi.fn(),
}))

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/accesso']}>
      <Routes>
        <Route path="/accesso" element={<AuthScreen />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rende i campi email e password in modalità accesso', () => {
    renderScreen()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/organizzazione/i)).not.toBeInTheDocument()
  })

  it('mostra il campo organizzazione in modalità registrazione', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('tab', { name: /registrati/i }))
    expect(screen.getByLabelText(/organizzazione/i)).toBeInTheDocument()
  })

  it('submit in modalità accesso chiama accedi e naviga a /', async () => {
    vi.mocked(accedi).mockResolvedValue({ email: 'a@b.it', ruolo: 'utente', societaId: null })
    renderScreen()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.it')
    await userEvent.type(screen.getByLabelText(/password/i), 'segreto')
    await userEvent.click(screen.getByRole('button', { name: /^accedi$/i }))
    expect(accedi).toHaveBeenCalledWith('a@b.it', 'segreto')
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('submit in modalità registrazione con inAttesa mostra il messaggio di attesa', async () => {
    vi.mocked(registra).mockResolvedValue({ inAttesa: true })
    renderScreen()
    await userEvent.click(screen.getByRole('tab', { name: /registrati/i }))
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.it')
    await userEvent.type(screen.getByLabelText(/password/i), 'segreto')
    await userEvent.type(screen.getByLabelText(/organizzazione/i), 'La Mia Società')
    await userEvent.click(screen.getByRole('button', { name: /crea account/i }))
    expect(registra).toHaveBeenCalledWith('a@b.it', 'segreto', 'La Mia Società')
    expect(await screen.findByText(/in attesa di abilitazione/i)).toBeInTheDocument()
  })

  it('submit in modalità registrazione senza inAttesa (admin) naviga a /', async () => {
    vi.mocked(registra).mockResolvedValue({ inAttesa: false })
    renderScreen()
    await userEvent.click(screen.getByRole('tab', { name: /registrati/i }))
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.it')
    await userEvent.type(screen.getByLabelText(/password/i), 'segreto')
    await userEvent.type(screen.getByLabelText(/organizzazione/i), 'La Mia Società')
    await userEvent.click(screen.getByRole('button', { name: /crea account/i }))
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('mostra l\'errore restituito dal servizio in caso di credenziali errate', async () => {
    vi.mocked(accedi).mockRejectedValue(new Error('credenziali non valide'))
    renderScreen()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.it')
    await userEvent.type(screen.getByLabelText(/password/i), 'sbagliata')
    await userEvent.click(screen.getByRole('button', { name: /^accedi$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('credenziali non valide')
  })
})
