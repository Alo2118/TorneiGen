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

  it('non invia authorization header quando manca il token', async () => {
    const f = mockFetch(200, { iscrizioni: [] })
    vi.stubGlobal('fetch', f)
    await creaClient({ baseUrl: 'http://api.test' }).elencaIscrizioni('ABC')
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBeUndefined()
  })
})

describe('client org', () => {
  it('getOrg usa GET /api/org/:codice col write token e ritorna il record', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' }), { status: 200 })
    })
    const client = creaClient({ baseUrl: 'http://x', writeToken: 'W' })
    const r = await client.getOrg('ABC')
    expect(r).toEqual({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' })
    expect(calls[0].url).toBe('http://x/api/org/ABC')
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer W')
    vi.unstubAllGlobals()
  })
  it('getOrg ritorna null sul 404', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }))
    const client = creaClient({ baseUrl: 'http://x', writeToken: 'W' })
    expect(await client.getOrg('NOPE')).toBeNull()
    vi.unstubAllGlobals()
  })
  it('putOrg segnala il conflitto sul 409 con la versione attuale', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'conflitto', version: 5 }), { status: 409 }))
    const client = creaClient({ baseUrl: 'http://x', writeToken: 'W' })
    expect(await client.putOrg('ABC', '{}', 1)).toEqual({ conflitto: true, version: 5 })
    vi.unstubAllGlobals()
  })
  it('putOrg ritorna la nuova versione sul 200', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 3 }), { status: 200 }))
    const client = creaClient({ baseUrl: 'http://x', writeToken: 'W' })
    expect(await client.putOrg('ABC', '{}', 2)).toEqual({ conflitto: false, version: 3 })
    vi.unstubAllGlobals()
  })
})
