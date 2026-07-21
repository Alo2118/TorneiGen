import { describe, it, expect, vi, afterEach } from 'vitest'
import { creaClient } from './registrations-api'
import type { PublicSnapshot } from '../types/public'

const client = () => creaClient({ baseUrl: 'http://api.test', sessione: 'sess-xyz' })

const snapshot: PublicSnapshot = {
  codice: 'ABC',
  nome: 'Coppa',
  tipologia: '2x2',
  formato: null,
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  updatedAt: '',
  teams: [],
  groups: [],
  matches: [],
}

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

  it('pubblicaRiepilogo invia la sessione nell\'header', async () => {
    const f = mockFetch(200, { codice: 'ABC', nome: 'C', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' })
    vi.stubGlobal('fetch', f)
    await client().pubblicaRiepilogo({ codice: 'ABC', nome: 'C', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' })
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
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

  it('eliminaUtente chiama DELETE /api/admin/utenti/:id con la sessione', async () => {
    const f = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await client().eliminaUtente('u1')
    const call0 = f.mock.calls[0] as unknown[]
    expect(call0[0]).toBe('http://api.test/api/admin/utenti/u1')
    const opts = call0[1] as RequestInit
    expect(opts.method).toBe('DELETE')
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
  })

  it('elencoOrg chiama GET /api/org con la sessione e ritorna i tornei', async () => {
    const f = mockFetch(200, { tornei: [{ codice: 'AAA', nome: 'Coppa', tipologia: '2x2', data: '2026-07-20', updatedAt: 't' }] })
    vi.stubGlobal('fetch', f)
    const r = await client().elencoOrg()
    expect(r).toEqual([{ codice: 'AAA', nome: 'Coppa', tipologia: '2x2', data: '2026-07-20', updatedAt: 't' }])
    const call0 = f.mock.calls[0] as unknown[]
    expect(call0[0]).toBe('http://api.test/api/org')
    const opts = call0[1] as RequestInit
    expect(opts.method).toBe('GET')
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
  })

  it('elencaIscrizioni invia la sessione nell\'header', async () => {
    const f = mockFetch(200, { iscrizioni: [] })
    vi.stubGlobal('fetch', f)
    await client().elencaIscrizioni('ABC')
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
  })

  it('eliminaIscrizione invia la sessione nell\'header', async () => {
    const f = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await client().eliminaIscrizione('ABC', '1')
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
    expect(opts.method).toBe('DELETE')
  })

  it('pubblicaSnapshot invia la sessione nell\'header', async () => {
    const f = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await client().pubblicaSnapshot(snapshot)
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
    expect(opts.method).toBe('POST')
  })

  it('rimuoviSnapshot invia la sessione nell\'header', async () => {
    const f = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await client().rimuoviSnapshot('ABC')
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer sess-xyz')
    expect(opts.method).toBe('DELETE')
  })

  it('lancia un errore leggibile su risposta non ok', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'non autorizzato' }))
    await expect(client().elencaIscrizioni('ABC')).rejects.toThrow(/non autorizzato/i)
  })

  it('non invia authorization header quando manca la sessione', async () => {
    const f = mockFetch(200, { iscrizioni: [] })
    vi.stubGlobal('fetch', f)
    await creaClient({ baseUrl: 'http://api.test' }).elencaIscrizioni('ABC')
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBeUndefined()
  })
})

describe('client org', () => {
  it('getOrg usa GET /api/org/:codice col Bearer di sessione e ritorna il record', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' }), { status: 200 })
    })
    const client = creaClient({ baseUrl: 'http://x', sessione: 'W' })
    const r = await client.getOrg('ABC')
    expect(r).toEqual({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' })
    expect(calls[0].url).toBe('http://x/api/org/ABC')
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer W')
    vi.unstubAllGlobals()
  })
  it('getOrg ritorna null sul 404', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }))
    const client = creaClient({ baseUrl: 'http://x', sessione: 'W' })
    expect(await client.getOrg('NOPE')).toBeNull()
    vi.unstubAllGlobals()
  })
  it('putOrg segnala il conflitto sul 409 con la versione attuale', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'conflitto', version: 5 }), { status: 409 }))
    const client = creaClient({ baseUrl: 'http://x', sessione: 'W' })
    expect(await client.putOrg('ABC', '{}', 1)).toEqual({ conflitto: true, version: 5 })
    vi.unstubAllGlobals()
  })
  it('putOrg ritorna la nuova versione sul 200', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 3 }), { status: 200 }))
    const client = creaClient({ baseUrl: 'http://x', sessione: 'W' })
    expect(await client.putOrg('ABC', '{}', 2)).toEqual({ conflitto: false, version: 3 })
    vi.unstubAllGlobals()
  })
})

describe('client auth', () => {
  it('registrazione chiama POST /api/auth/registrazione con email/password/societa', async () => {
    const f = mockFetch(200, { stato: 'in_attesa' })
    vi.stubGlobal('fetch', f)
    const r = await client().registrazione('a@b.it', 'segreto1', 'Società X')
    expect(r).toEqual({ stato: 'in_attesa' })
    expect(f).toHaveBeenCalledWith(
      'http://api.test/api/auth/registrazione',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@b.it', password: 'segreto1', societa: 'Società X' }) }),
    )
  })

  it('accesso chiama POST /api/auth/accesso e ritorna token+utente', async () => {
    const utente = { email: 'a@b.it', ruolo: 'utente' as const, societaId: null }
    vi.stubGlobal('fetch', mockFetch(200, { token: 'tok123', utente }))
    const r = await client().accesso('a@b.it', 'segreto1')
    expect(r).toEqual({ token: 'tok123', utente })
  })

  it('io chiama GET /api/auth/io con Bearer di sessione', async () => {
    const utente = { email: 'a@b.it', ruolo: 'admin' as const, societaId: null }
    const f = mockFetch(200, utente)
    vi.stubGlobal('fetch', f)
    const r = await creaClient({ baseUrl: 'http://api.test', sessione: 'S' }).io()
    expect(r).toEqual(utente)
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer S')
    expect(f).toHaveBeenCalledWith('http://api.test/api/auth/io', expect.objectContaining({ method: 'GET' }))
  })
})

describe('client admin', () => {
  const adminClient = () => creaClient({ baseUrl: 'http://api.test', sessione: 'S' })

  it('elencoUtenti chiama GET /api/admin/utenti e ritorna l\'array', async () => {
    const utenti = [{ id: '1', email: 'a@b.it', ruolo: 'utente', abilitato: 0, societaId: null, societaRichiesta: 'X' }]
    vi.stubGlobal('fetch', mockFetch(200, { utenti }))
    const r = await adminClient().elencoUtenti()
    expect(r).toEqual(utenti)
  })

  it('elencoSocieta chiama GET /api/admin/societa e ritorna l\'array', async () => {
    const societa = [{ id: '1', nome: 'X', creato_il: 't' }]
    vi.stubGlobal('fetch', mockFetch(200, { societa }))
    const r = await adminClient().elencoSocieta()
    expect(r).toEqual(societa)
  })

  it('creaSocieta chiama POST /api/admin/societa con {nome} e Bearer sessione', async () => {
    const f = mockFetch(200, { id: '1', nome: 'X', creato_il: 't' })
    vi.stubGlobal('fetch', f)
    const r = await adminClient().creaSocieta('X')
    expect(r).toEqual({ id: '1', nome: 'X', creato_il: 't' })
    const opts = (f.mock.calls[0] as unknown[])?.[1] as RequestInit
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer S')
    expect(f).toHaveBeenCalledWith(
      'http://api.test/api/admin/societa',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ nome: 'X' }) }),
    )
  })

  it('abilitaUtente chiama POST /api/admin/utenti/:id/abilita con {societaId}', async () => {
    const f = mockFetch(200, { ok: true })
    vi.stubGlobal('fetch', f)
    await adminClient().abilitaUtente('u1', 'soc1')
    expect(f).toHaveBeenCalledWith(
      'http://api.test/api/admin/utenti/u1/abilita',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ societaId: 'soc1' }) }),
    )
  })
})
