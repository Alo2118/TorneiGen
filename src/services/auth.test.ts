import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RegistrationsClient } from './registrations-api'

const clientMock = {
  registrazione: vi.fn(),
  accesso: vi.fn(),
  io: vi.fn(),
} as unknown as RegistrationsClient

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config')
  return { ...actual, getClient: () => clientMock }
})

import { registra, accedi, esci, utenteCorrente } from './auth'
import { getSessione } from './config'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(() => vi.restoreAllMocks())

describe('registra', () => {
  it('con approvazione immediata (admin) salva la sessione e ritorna inAttesa:false', async () => {
    ;(clientMock.registrazione as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'tok-admin', utente: { email: 'a@b.it', ruolo: 'admin', societaId: null } })
    const r = await registra('a@b.it', 'segreto1', 'Società X')
    expect(r).toEqual({ inAttesa: false })
    expect(getSessione()).toBe('tok-admin')
  })

  it('senza token (utente normale) non salva sessione e ritorna inAttesa:true', async () => {
    ;(clientMock.registrazione as ReturnType<typeof vi.fn>).mockResolvedValue({ stato: 'in_attesa' })
    const r = await registra('a@b.it', 'segreto1', 'Società X')
    expect(r).toEqual({ inAttesa: true })
    expect(getSessione()).toBeUndefined()
  })
})

describe('accedi', () => {
  it('salva la sessione e ritorna l\'utente', async () => {
    const utente = { email: 'a@b.it', ruolo: 'utente' as const, societaId: 'soc1' }
    ;(clientMock.accesso as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'tok123', utente })
    const r = await accedi('a@b.it', 'segreto1')
    expect(r).toEqual(utente)
    expect(getSessione()).toBe('tok123')
  })
})

describe('esci', () => {
  it('rimuove la sessione', async () => {
    ;(clientMock.accesso as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'tok123', utente: { email: 'a@b.it', ruolo: 'utente', societaId: null } })
    await accedi('a@b.it', 'segreto1')
    expect(getSessione()).toBe('tok123')
    esci()
    expect(getSessione()).toBeUndefined()
  })
})

describe('utenteCorrente', () => {
  it('ritorna l\'utente se io() ha successo', async () => {
    const utente = { email: 'a@b.it', ruolo: 'utente' as const, societaId: null }
    ;(clientMock.io as ReturnType<typeof vi.fn>).mockResolvedValue(utente)
    expect(await utenteCorrente()).toEqual(utente)
  })

  it('ritorna null se io() lancia', async () => {
    ;(clientMock.io as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('non autorizzato'))
    expect(await utenteCorrente()).toBeNull()
  })
})
