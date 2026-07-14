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
})
