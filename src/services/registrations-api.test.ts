import { describe, it, expect, vi, afterEach } from 'vitest'
import { creaClient } from './registrations-api'

const client = () => creaClient({ baseUrl: 'http://api.test', token: 'tok' })

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

afterEach(() => vi.restoreAllMocks())

describe('registrations-api', () => {
  it('getRiepilogo chiama GET /api/torneo/:codice', async () => {
    const f = mockFetch(200, { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' })
    vi.stubGlobal('fetch', f)
    const r = await client().getRiepilogo('ABC')
    expect(r.nome).toBe('Coppa')
    expect(f).toHaveBeenCalledWith('http://api.test/api/torneo/ABC', expect.objectContaining({ method: 'GET' }))
  })

  it('pubblicaRiepilogo invia il token nell\'header', async () => {
    const f = mockFetch(200, { codice: 'ABC', nome: 'C', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' })
    vi.stubGlobal('fetch', f)
    await client().pubblicaRiepilogo({ codice: 'ABC', nome: 'C', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' })
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(opts.method).toBe('POST')
  })

  it('inviaIscrizione ritorna l\'id', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { ok: true, id: 'x1' }))
    const r = await client().inviaIscrizione('ABC', { nomeSquadra: 'S', giocatori: [] })
    expect(r.id).toBe('x1')
  })

  it('elencaIscrizioni ritorna l\'array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { iscrizioni: [{ id: '1', codice: 'ABC', nomeSquadra: 'S', giocatori: [], createdAt: '' }] }))
    const r = await client().elencaIscrizioni('ABC')
    expect(r).toHaveLength(1)
  })

  it('lancia un errore leggibile su risposta non ok', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'non autorizzato' }))
    await expect(client().elencaIscrizioni('ABC')).rejects.toThrow(/non autorizzato/i)
  })
})
