import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RegistrationScreen } from './RegistrationScreen'

const riepilogo = { codice: 'ABC', nome: 'Coppa Estate', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' }

function fetchSeq(responses: Array<{ status: number; body: unknown }>) {
  let i = 0
  return vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]; i++
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  })
}

describe('RegistrationScreen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('mostra il nome torneo e invia l\'iscrizione', async () => {
    vi.stubGlobal('fetch', fetchSeq([{ status: 200, body: riepilogo }, { status: 201, body: { ok: true, id: 'x1' } }]))
    render(
      <MemoryRouter initialEntries={['/iscrizione/ABC']}>
        <Routes><Route path="/iscrizione/:codice" element={<RegistrationScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Coppa Estate/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/nome squadra/i), 'Squali')

    await userEvent.type(screen.getByLabelText(/^nome$/i, { selector: '#p0-nome' }), 'Anna')
    await userEvent.type(screen.getByLabelText(/^cognome$/i, { selector: '#p0-cognome' }), 'Rossi')
    await userEvent.type(screen.getByLabelText(/^email$/i, { selector: '#p0-email' }), 'anna@example.com')
    await userEvent.type(screen.getByLabelText(/^telefono$/i, { selector: '#p0-telefono' }), '3331112222')

    await userEvent.type(screen.getByLabelText(/^nome$/i, { selector: '#p1-nome' }), 'Bruno')
    await userEvent.type(screen.getByLabelText(/^cognome$/i, { selector: '#p1-cognome' }), 'Bianchi')
    await userEvent.type(screen.getByLabelText(/^email$/i, { selector: '#p1-email' }), 'bruno@example.com')
    await userEvent.type(screen.getByLabelText(/^telefono$/i, { selector: '#p1-telefono' }), '3334445555')

    await userEvent.click(screen.getByRole('button', { name: /invia iscrizione/i }))

    expect(await screen.findByText(/grazie|inviata|confermata/i)).toBeInTheDocument()
  })

  it('mostra "iscrizioni chiuse" se il torneo è chiuso', async () => {
    vi.stubGlobal('fetch', fetchSeq([{ status: 200, body: { ...riepilogo, chiuso: true } }]))
    render(
      <MemoryRouter initialEntries={['/iscrizione/ABC']}>
        <Routes><Route path="/iscrizione/:codice" element={<RegistrationScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/chiuse/i)).toBeInTheDocument()
  })
})
