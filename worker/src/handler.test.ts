import { describe, it, expect } from 'vitest'
import { handle, type Env } from './handler'
import { fakeKV } from './fake-kv'

const TOKEN = 'segreto'
function env(seed?: Record<string, string>): Env {
  return { KV: fakeKV(seed), READ_TOKEN: TOKEN }
}
const riepilogo = (over = {}) => JSON.stringify({ codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', chiuso: false, updatedAt: '', ...over })
const auth = { authorization: `Bearer ${TOKEN}` }
const req = (method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request('http://x' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

describe('handle', () => {
  it('OPTIONS -> 204 con CORS', async () => {
    const r = await handle(req('OPTIONS', '/api/torneo'), env())
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('POST /api/torneo senza token -> 401', async () => {
    const r = await handle(req('POST', '/api/torneo', { body: { codice: 'ABC', nome: 'C', tipologia: '2x2' } }), env())
    expect(r.status).toBe(401)
  })

  it('POST /api/torneo con token pubblica il riepilogo', async () => {
    const e = env()
    const r = await handle(req('POST', '/api/torneo', { headers: auth, body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana' } }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('torneo:ABC')).toContain('Coppa')
  })

  it('GET /api/torneo/:codice pubblico ritorna il riepilogo', async () => {
    const r = await handle(req('GET', '/api/torneo/ABC'), env({ 'torneo:ABC': riepilogo() }))
    expect(r.status).toBe(200)
    expect((await r.json()).nome).toBe('Coppa')
  })

  it('GET /api/torneo/:codice inesistente -> 404', async () => {
    const r = await handle(req('GET', '/api/torneo/NOPE'), env())
    expect(r.status).toBe(404)
  })

  it('POST iscrizione a torneo aperto -> 201 e salva in KV', async () => {
    const e = env({ 'torneo:ABC': riepilogo() })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { nomeSquadra: 'Squali', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] } }), e)
    expect(r.status).toBe(201)
    const list = await e.KV.list({ prefix: 'iscr:ABC:' })
    expect(list.keys).toHaveLength(1)
  })

  it('POST iscrizione a torneo chiuso -> 403', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ chiuso: true }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { nomeSquadra: 'S', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }] } }), e)
    expect(r.status).toBe(403)
  })

  it('POST iscrizione a codice inesistente -> 404', async () => {
    const r = await handle(req('POST', '/api/iscrizioni/NOPE', { body: { nomeSquadra: 'S', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }] } }), env())
    expect(r.status).toBe(404)
  })

  it('POST iscrizione incompleta -> 400', async () => {
    const e = env({ 'torneo:ABC': riepilogo() })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { nomeSquadra: '', giocatori: [] } }), e)
    expect(r.status).toBe(400)
  })

  it('POST iscrizione 4x4 con nomeSquadra di soli spazi -> 400', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '4x4' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { nomeSquadra: '   ', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }] } }), e)
    expect(r.status).toBe(400)
  })

  const giocatori2 = [
    { nome: 'A', cognome: 'Rossi', email: 'a@x.it', telefono: '1' },
    { nome: 'B', cognome: 'Bianchi', email: 'b@x.it', telefono: '2' },
  ]

  it('POST iscrizione 2x2 SENZA nomeSquadra -> 201 e salva', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '2x2' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { giocatori: giocatori2 } }), e)
    expect(r.status).toBe(201)
    const { keys } = await e.KV.list({ prefix: 'iscr:ABC:' })
    expect(keys.length).toBe(1)
  })

  it('POST iscrizione 2x2 con nomeSquadra VUOTO ("") e giocatori validi -> 201', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '2x2' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { nomeSquadra: '', giocatori: giocatori2 } }), e)
    expect(r.status).toBe(201)
  })

  it('POST iscrizione 4x4 SENZA nomeSquadra -> 400', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '4x4' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { giocatori: giocatori2 } }), e)
    expect(r.status).toBe(400)
  })

  it('GET iscrizioni senza token -> 401', async () => {
    const r = await handle(req('GET', '/api/iscrizioni/ABC'), env({ 'torneo:ABC': riepilogo() }))
    expect(r.status).toBe(401)
  })

  it('GET iscrizioni con token elenca le iscrizioni', async () => {
    const e = env({ 'torneo:ABC': riepilogo(), 'iscr:ABC:1': JSON.stringify({ id: '1', codice: 'ABC', nomeSquadra: 'S', giocatori: [], createdAt: '' }) })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: auth }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).iscrizioni).toHaveLength(1)
  })

  it('DELETE iscrizione con token la rimuove', async () => {
    const e = env({ 'iscr:ABC:1': JSON.stringify({ id: '1' }) })
    const r = await handle(req('DELETE', '/api/iscrizioni/ABC/1', { headers: auth }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('iscr:ABC:1')).toBeNull()
  })

  it('POST /api/iscrizioni/:codice con body malformato -> 400', async () => {
    const e = env({ 'torneo:ABC': riepilogo() })
    const malformedReq = new Request('http://x/api/iscrizioni/ABC', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    const r = await handle(malformedReq, e)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('JSON non valido')
  })

  it('GET /api/iscrizioni/:codice con token sbagliato -> 401', async () => {
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: { authorization: 'Bearer sbagliato' } }), env({ 'torneo:ABC': riepilogo() }))
    expect(r.status).toBe(401)
    expect((await r.json()).error).toBe('non autorizzato')
  })

  const snapshot = (over = {}) =>
    JSON.stringify({ codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', regolePunteggio: {}, updatedAt: '', teams: [], groups: [], matches: [], ...over })

  it('POST /api/pubblico/:codice senza token -> 401', async () => {
    const r = await handle(req('POST', '/api/pubblico/ABC', { body: { codice: 'ABC', nome: 'C', tipologia: '2x2' } }), env())
    expect(r.status).toBe(401)
  })

  it('POST /api/pubblico/:codice con token salva lo snapshot in KV', async () => {
    const e = env()
    const r = await handle(req('POST', '/api/pubblico/ABC', { headers: auth, body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', regolePunteggio: {}, teams: [], groups: [], matches: [] } }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('pubblico:ABC')).toContain('Coppa')
  })

  it('POST /api/pubblico/:codice con dati incompleti -> 400', async () => {
    const r = await handle(req('POST', '/api/pubblico/ABC', { headers: auth, body: { codice: 'ABC' } }), env())
    expect(r.status).toBe(400)
  })

  it('GET /api/pubblico/:codice pubblico ritorna lo snapshot', async () => {
    const r = await handle(req('GET', '/api/pubblico/ABC'), env({ 'pubblico:ABC': snapshot() }))
    expect(r.status).toBe(200)
    expect((await r.json()).nome).toBe('Coppa')
  })

  it('GET /api/pubblico/:codice inesistente -> 404', async () => {
    const r = await handle(req('GET', '/api/pubblico/NOPE'), env())
    expect(r.status).toBe(404)
  })

  it('DELETE /api/pubblico/:codice con token rimuove lo snapshot', async () => {
    const e = env({ 'pubblico:ABC': snapshot() })
    const r = await handle(req('DELETE', '/api/pubblico/ABC', { headers: auth }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('pubblico:ABC')).toBeNull()
  })

  it('DELETE /api/pubblico/:codice senza token -> 401', async () => {
    const r = await handle(req('DELETE', '/api/pubblico/ABC'), env({ 'pubblico:ABC': snapshot() }))
    expect(r.status).toBe(401)
  })
})
