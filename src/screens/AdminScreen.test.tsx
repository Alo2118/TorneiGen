import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AdminScreen } from './AdminScreen'
import { utenteCorrente } from '../services/auth'

vi.mock('../services/auth', () => ({
  utenteCorrente: vi.fn(),
}))

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

function stubFetch(extra: { abilitaChiamata?: (id: string, body: unknown) => void } = {}) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const u = String(url)
    const match = u.match(/\/api\/admin\/utenti\/([^/]+)\/abilita$/)
    if (match) {
      extra.abilitaChiamata?.(match[1], opts?.body ? JSON.parse(opts.body as string) : undefined)
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (u.includes('/api/admin/utenti')) {
      return new Response(
        JSON.stringify({
          utenti: [
            { id: 'u1', email: 'pippo@x.it', ruolo: 'utente', abilitato: 0, societaId: null, societaRichiesta: 'Beach Club' },
            { id: 'u2', email: 'admin@x.it', ruolo: 'admin', abilitato: 1, societaId: 's1', societaRichiesta: null },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (u.includes('/api/admin/societa')) {
      return new Response(JSON.stringify({ societa: [{ id: 's1', nome: 'Beach Club', creato_il: '' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

describe('AdminScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('mostra "Accesso riservato" per un utente non admin', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue({ email: 'a@b.it', ruolo: 'utente', societaId: 's1' })
    const f = stubFetch()
    vi.stubGlobal('fetch', f)
    renderScreen()
    expect(await screen.findByText(/accesso riservato/i)).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('mostra "Accesso riservato" se non autenticato', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue(null)
    renderScreen()
    expect(await screen.findByText(/accesso riservato/i)).toBeInTheDocument()
  })

  it('un admin vede l\'elenco utenti con stato e società', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue({ email: 'admin@x.it', ruolo: 'admin', societaId: null })
    vi.stubGlobal('fetch', stubFetch())
    renderScreen()
    const rigaPippo = (await screen.findByText('pippo@x.it')).closest('li') as HTMLElement
    const rigaAdmin = screen.getByText('admin@x.it').closest('li') as HTMLElement
    expect(within(rigaPippo).getByText(/in attesa/i)).toBeInTheDocument()
    expect(within(rigaAdmin).getByText(/attivo/i)).toBeInTheDocument()
    expect(screen.getAllByText('Beach Club').length).toBeGreaterThan(0)
  })

  it('click su "Abilita" con società scelta dal select chiama abilitaUtente', async () => {
    vi.mocked(utenteCorrente).mockResolvedValue({ email: 'admin@x.it', ruolo: 'admin', societaId: null })
    const abilitaChiamata = vi.fn()
    vi.stubGlobal('fetch', stubFetch({ abilitaChiamata }))
    renderScreen()

    const riga = (await screen.findByText('pippo@x.it')).closest('li') as HTMLElement
    await userEvent.selectOptions(within(riga).getByLabelText(/^Società per/i), 's1')
    await userEvent.click(within(riga).getByRole('button', { name: /abilita/i }))

    expect(abilitaChiamata).toHaveBeenCalledWith('u1', { societaId: 's1' })
  })
})
