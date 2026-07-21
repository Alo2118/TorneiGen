import { describe, it, expect } from 'vitest'
import { handle, type Env, type UtenteRecord, type SocietaRecord } from './handler'
import { fakeKV } from './fake-kv'
import { fakeOrgStore } from './fake-org-store'
import { fakeUserStore } from './fake-user-store'
import { fakeSocietaStore } from './fake-societa-store'
import { hashPassword, creaJWT } from './auth'
import type { OrgRecord } from '../../src/types/org'

const WTOKEN = 'scrivi'
const AUTH_SECRET = 'seg-test'
const ADMIN_EMAIL = 'admin@x.it'
function env(
  seed?: Record<string, string>,
  orgSeed?: OrgRecord[],
  userSeed?: UtenteRecord[],
  societaSeed?: SocietaRecord[],
): Env {
  return {
    KV: fakeKV(seed),
    WRITE_TOKEN: WTOKEN,
    ORG: fakeOrgStore(orgSeed),
    USERS: fakeUserStore(userSeed),
    SOCIETA: fakeSocietaStore(societaSeed),
    AUTH_SECRET,
    ADMIN_EMAIL,
  }
}
const riepilogo = (over = {}) => JSON.stringify({ codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', chiuso: false, updatedAt: '', ...over })
const tokenSoc = (societaId: string) =>
  creaJWT({ sub: `u-${societaId}`, email: `${societaId}@x.it`, ruolo: 'utente', societaId }, AUTH_SECRET)
const authSoc = async (societaId = 's1') => ({ authorization: `Bearer ${await tokenSoc(societaId)}` })
const authAdminSess = async () => ({
  authorization: `Bearer ${await creaJWT({ sub: 'a', email: ADMIN_EMAIL, ruolo: 'admin', societaId: null }, AUTH_SECRET)}`,
})
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
    const r = await handle(req('POST', '/api/torneo', { headers: await authSoc(), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana' } }), e)
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
    const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo(), 'iscr:ABC:1': JSON.stringify({ id: '1', codice: 'ABC', nomeSquadra: 'S', giocatori: [], createdAt: '' }) })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s1') }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).iscrizioni).toHaveLength(1)
  })

  it('DELETE iscrizione con token la rimuove', async () => {
    const e = env({ 'owner:ABC': 's1', 'iscr:ABC:1': JSON.stringify({ id: '1' }) })
    const r = await handle(req('DELETE', '/api/iscrizioni/ABC/1', { headers: await authSoc('s1') }), e)
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

  it('GET /api/iscrizioni/:codice con Bearer non valido -> 401', async () => {
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: { authorization: 'Bearer non-valido' } }), env({ 'torneo:ABC': riepilogo() }))
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
    const r = await handle(req('POST', '/api/pubblico/ABC', { headers: await authSoc('s1'), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', regolePunteggio: {}, teams: [], groups: [], matches: [] } }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('pubblico:ABC')).toContain('Coppa')
  })

  it('POST /api/pubblico/:codice con dati incompleti -> 400', async () => {
    const r = await handle(req('POST', '/api/pubblico/ABC', { headers: await authSoc('s1'), body: { codice: 'ABC' } }), env())
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
    const e = env({ 'owner:ABC': 's1', 'pubblico:ABC': snapshot() })
    const r = await handle(req('DELETE', '/api/pubblico/ABC', { headers: await authSoc('s1') }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('pubblico:ABC')).toBeNull()
  })

  it('DELETE /api/pubblico/:codice senza token -> 401', async () => {
    const r = await handle(req('DELETE', '/api/pubblico/ABC'), env({ 'pubblico:ABC': snapshot() }))
    expect(r.status).toBe(401)
  })

  const orgRow = (over: Partial<OrgRecord> = {}): OrgRecord =>
    ({ codice: 'ABC', doc: '{"x":1}', version: 1, updatedAt: '', societaId: 's1', ...over })

  const tokenS1 = () => creaJWT({ sub: 'u-s1', email: 's1@x.it', ruolo: 'utente', societaId: 's1' }, AUTH_SECRET)
  const tokenS2 = () => creaJWT({ sub: 'u-s2', email: 's2@x.it', ruolo: 'utente', societaId: 's2' }, AUTH_SECRET)
  const tokenOrgAdmin = () => creaJWT({ sub: 'org-admin', email: ADMIN_EMAIL, ruolo: 'admin', societaId: null }, AUTH_SECRET)
  const authS1 = async () => ({ authorization: `Bearer ${await tokenS1()}` })
  const authS2 = async () => ({ authorization: `Bearer ${await tokenS2()}` })
  const authOrgAdmin = async () => ({ authorization: `Bearer ${await tokenOrgAdmin()}` })

  it('GET /api/org/:codice senza token -> 401', async () => {
    const r = await handle(req('GET', '/api/org/ABC'), env())
    expect(r.status).toBe(401)
  })
  it('GET /api/org/:codice inesistente (con token) -> 404', async () => {
    const r = await handle(req('GET', '/api/org/NOPE', { headers: await authS1() }), env())
    expect(r.status).toBe(404)
  })
  it('GET /api/org/:codice esistente -> 200 con doc e version (stessa società)', async () => {
    const r = await handle(req('GET', '/api/org/ABC', { headers: await authS1() }), env({}, [orgRow({ doc: '{"n":2}', version: 5 })]))
    expect(r.status).toBe(200)
    const b = await r.json()
    expect(b.version).toBe(5)
    expect(b.doc).toBe('{"n":2}')
  })
  it('GET /api/org/:codice di un\'altra società -> 403', async () => {
    const r = await handle(req('GET', '/api/org/ABC', { headers: await authS2() }), env({}, [orgRow()]))
    expect(r.status).toBe(403)
  })
  it('GET /api/org/:codice come admin -> 200 anche per società altrui', async () => {
    const r = await handle(req('GET', '/api/org/ABC', { headers: await authOrgAdmin() }), env({}, [orgRow()]))
    expect(r.status).toBe(200)
  })
  it('GET /api/org/:codice documento legacy senza società -> 200 per qualsiasi utente (grazia)', async () => {
    const r = await handle(req('GET', '/api/org/ABC', { headers: await authS2() }), env({}, [orgRow({ societaId: null })]))
    expect(r.status).toBe(200)
  })

  describe('GET /api/org (elenco tornei della società)', () => {
    const docConNome = (nome: string, tipologia = '2x2', data = '2026-07-20') =>
      JSON.stringify({ tournament: { nome, tipologia, data }, teams: [], groups: [], struttura: [] })
    const seed = (): OrgRecord[] => [
      orgRow({ codice: 'AAA', doc: docConNome('Coppa Estate'), societaId: 's1' }),
      orgRow({ codice: 'BBB', doc: docConNome('Torneo Misto', '4x4'), societaId: 's1' }),
      orgRow({ codice: 'CCC', doc: docConNome('Altra Società'), societaId: 's2' }),
    ]

    it('senza sessione -> 401', async () => {
      const r = await handle(req('GET', '/api/org'), env({}, seed()))
      expect(r.status).toBe(401)
    })

    it('utente di s1 -> solo i tornei di s1, con nome/tipologia estratti dal doc', async () => {
      const r = await handle(req('GET', '/api/org', { headers: await authS1() }), env({}, seed()))
      expect(r.status).toBe(200)
      const { tornei } = await r.json()
      expect(tornei.map((t: { codice: string }) => t.codice).sort()).toEqual(['AAA', 'BBB'])
      const aaa = tornei.find((t: { codice: string }) => t.codice === 'AAA')
      expect(aaa).toMatchObject({ nome: 'Coppa Estate', tipologia: '2x2' })
    })

    it('admin -> tutti i tornei di tutte le società', async () => {
      const r = await handle(req('GET', '/api/org', { headers: await authAdminSess() }), env({}, seed()))
      expect(r.status).toBe(200)
      const { tornei } = await r.json()
      expect(tornei.map((t: { codice: string }) => t.codice).sort()).toEqual(['AAA', 'BBB', 'CCC'])
    })

    it('utente senza società -> elenco vuoto (niente enumerazione dei documenti legacy)', async () => {
      const tokenSenzaSoc = await creaJWT({ sub: 'u-x', email: 'x@x.it', ruolo: 'utente', societaId: null }, AUTH_SECRET)
      const r = await handle(req('GET', '/api/org', { headers: { authorization: `Bearer ${tokenSenzaSoc}` } }), env({}, seed()))
      expect(r.status).toBe(200)
      expect((await r.json()).tornei).toEqual([])
    })

    it('doc illeggibile -> nome ripiega sul codice', async () => {
      const r = await handle(req('GET', '/api/org', { headers: await authS1() }), env({}, [orgRow({ codice: 'ZZZ', doc: 'non-json', societaId: 's1' })]))
      const { tornei } = await r.json()
      expect(tornei[0]).toMatchObject({ codice: 'ZZZ', nome: 'ZZZ' })
    })
  })
  it('PUT nuovo documento (version 0) -> 200 version 1, salva e reclama la società', async () => {
    const e = env()
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS1(), body: { doc: '{"a":1}', version: 0 } }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).version).toBe(1)
    const salvato = await e.ORG.get('ABC')
    expect(salvato?.doc).toBe('{"a":1}')
    expect(salvato?.societaId).toBe('s1')
  })
  it('PUT con versione combaciante (stessa società) -> version+1', async () => {
    const e = env({}, [orgRow({ version: 1 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS1(), body: { doc: '{"b":2}', version: 1 } }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).version).toBe(2)
  })
  it('PUT come utente di un\'altra società -> 403', async () => {
    const e = env({}, [orgRow({ version: 1 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS2(), body: { doc: '{}', version: 1 } }), e)
    expect(r.status).toBe(403)
  })
  it('PUT su documento legacy senza società -> lo reclama per l\'utente', async () => {
    const e = env({}, [orgRow({ societaId: null, version: 1 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS2(), body: { doc: '{}', version: 1 } }), e)
    expect(r.status).toBe(200)
    expect((await e.ORG.get('ABC'))?.societaId).toBe('s2')
  })
  it('PUT con versione stale -> 409 con la versione attuale', async () => {
    const e = env({}, [orgRow({ version: 3 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS1(), body: { doc: '{}', version: 1 } }), e)
    expect(r.status).toBe(409)
    expect((await r.json()).version).toBe(3)
  })
  it('PUT body non valido -> 400', async () => {
    const r = await handle(req('PUT', '/api/org/ABC', { headers: await authS1(), body: { doc: 123 } }), env())
    expect(r.status).toBe(400)
  })
  it('PUT senza token -> 401', async () => {
    const r = await handle(req('PUT', '/api/org/ABC', { body: { doc: '{}', version: 0 } }), env())
    expect(r.status).toBe(401)
  })
  it('DELETE /api/org/:codice con token della stessa società rimuove', async () => {
    const e = env({}, [orgRow()])
    const r = await handle(req('DELETE', '/api/org/ABC', { headers: await authS1() }), e)
    expect(r.status).toBe(200)
    expect(await e.ORG.get('ABC')).toBeNull()
  })
  it('DELETE /api/org/:codice come utente di un\'altra società -> 403', async () => {
    const e = env({}, [orgRow()])
    const r = await handle(req('DELETE', '/api/org/ABC', { headers: await authS2() }), e)
    expect(r.status).toBe(403)
    expect(await e.ORG.get('ABC')).not.toBeNull()
  })
  it('DELETE /api/org/:codice come admin rimuove anche società altrui', async () => {
    const e = env({}, [orgRow()])
    const r = await handle(req('DELETE', '/api/org/ABC', { headers: await authOrgAdmin() }), e)
    expect(r.status).toBe(200)
    expect(await e.ORG.get('ABC')).toBeNull()
  })
  it('DELETE /api/org/:codice senza token -> 401', async () => {
    const r = await handle(req('DELETE', '/api/org/ABC'), env({}, [orgRow()]))
    expect(r.status).toBe(401)
  })

  describe('pubblicazione via sessione (scoping società)', () => {
    it('POST /api/torneo senza sessione -> 401', async () => {
      const r = await handle(req('POST', '/api/torneo', { body: { codice: 'ABC', nome: 'C', tipologia: '2x2' } }), env())
      expect(r.status).toBe(401)
    })

    it('POST /api/torneo con sessione pubblica e reclama owner per la società', async () => {
      const e = env()
      const r = await handle(req('POST', '/api/torneo', { headers: await authSoc('s1'), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana' } }), e)
      expect(r.status).toBe(200)
      expect(await e.KV.get('owner:ABC')).toBe('s1')
    })

    it('GET iscrizioni della propria società -> 200', async () => {
      const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
      const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s1') }), e)
      expect(r.status).toBe(200)
    })

    it('GET iscrizioni di un torneo di un\'altra società -> 403', async () => {
      const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
      const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s2') }), e)
      expect(r.status).toBe(403)
    })

    it('GET iscrizioni come admin -> 200 anche per società altrui', async () => {
      const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
      const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authAdminSess() }), e)
      expect(r.status).toBe(200)
    })

    it('torneo legacy senza owner: prima operazione consentita (grazia)', async () => {
      const e = env({ 'torneo:ABC': riepilogo() })
      const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s2') }), e)
      expect(r.status).toBe(200)
    })

    it('POST /api/pubblico reclama owner; poi altra società -> 403', async () => {
      const e = env()
      const rPub = await handle(req('POST', '/api/pubblico/ABC', { headers: await authSoc('s1'), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', regolePunteggio: {}, teams: [], groups: [], matches: [] } }), e)
      expect(rPub.status).toBe(200)
      expect(await e.KV.get('owner:ABC')).toBe('s1')
      const rAltra = await handle(req('DELETE', '/api/pubblico/ABC', { headers: await authSoc('s2') }), e)
      expect(rAltra.status).toBe(403)
      expect(await e.KV.get('pubblico:ABC')).not.toBeNull()
    })

    it('DELETE iscrizione della propria società -> 200 e rimuove', async () => {
      const e = env({ 'owner:ABC': 's1', 'iscr:ABC:1': JSON.stringify({ id: '1' }) })
      const r = await handle(req('DELETE', '/api/iscrizioni/ABC/1', { headers: await authSoc('s1') }), e)
      expect(r.status).toBe(200)
      expect(await e.KV.get('iscr:ABC:1')).toBeNull()
    })
  })

  describe('auth', () => {
    it('POST /api/auth/registrazione crea utente disabilitato in attesa', async () => {
      const e = env()
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: 'a@x.it', password: 'password1', societa: 'Club' } }), e)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ stato: 'in_attesa' })
      const u = await e.USERS.perEmail('a@x.it')
      expect(u).not.toBeNull()
      expect(u?.abilitato).toBe(0)
      expect(u?.ruolo).toBe('utente')
      expect(u?.societa_richiesta).toBe('Club')
    })

    it('POST /api/auth/registrazione con ADMIN_EMAIL crea admin abilitato e ritorna token', async () => {
      const e = env()
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: ADMIN_EMAIL, password: 'password1' } }), e)
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(typeof b.token).toBe('string')
      expect(b.utente).toEqual({ email: ADMIN_EMAIL, ruolo: 'admin', societaId: null })
      const u = await e.USERS.perEmail(ADMIN_EMAIL)
      expect(u?.ruolo).toBe('admin')
      expect(u?.abilitato).toBe(1)
    })

    it('POST /api/auth/registrazione email duplicata -> 409', async () => {
      const e = env()
      await handle(req('POST', '/api/auth/registrazione', { body: { email: 'a@x.it', password: 'password1' } }), e)
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: 'a@x.it', password: 'password2' } }), e)
      expect(r.status).toBe(409)
    })

    it('POST /api/auth/registrazione password troppo corta -> 400', async () => {
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: 'a@x.it', password: 'corta' } }), env())
      expect(r.status).toBe(400)
    })

    it('POST /api/auth/registrazione email non valida -> 400', async () => {
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: 'non-una-email', password: 'password1' } }), env())
      expect(r.status).toBe(400)
    })

    it('POST /api/auth/accesso con utente disabilitato -> 403 in_attesa', async () => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      const utente: UtenteRecord = {
        id: '1', email: 'a@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'utente', abilitato: 0, societa_id: null, societa_richiesta: null, creato_il: '',
      }
      const e = env(undefined, undefined, [utente])
      const r = await handle(req('POST', '/api/auth/accesso', { body: { email: 'a@x.it', password: 'password1' } }), e)
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ error: 'in_attesa' })
    })

    it('POST /api/auth/accesso con credenziali giuste (abilitato) -> 200 token+utente', async () => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      const utente: UtenteRecord = {
        id: '1', email: 'admin@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'admin', abilitato: 1, societa_id: 'soc-1', societa_richiesta: null, creato_il: '',
      }
      const e = env(undefined, undefined, [utente])
      const r = await handle(req('POST', '/api/auth/accesso', { body: { email: 'admin@x.it', password: 'password1' } }), e)
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(typeof b.token).toBe('string')
      expect(b.utente).toEqual({ email: 'admin@x.it', ruolo: 'admin', societaId: 'soc-1' })
    })

    it('POST /api/auth/accesso con password errata -> 401', async () => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      const utente: UtenteRecord = {
        id: '1', email: 'a@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'utente', abilitato: 1, societa_id: null, societa_richiesta: null, creato_il: '',
      }
      const e = env(undefined, undefined, [utente])
      const r = await handle(req('POST', '/api/auth/accesso', { body: { email: 'a@x.it', password: 'sbagliata' } }), e)
      expect(r.status).toBe(401)
    })

    it('POST /api/auth/accesso con email inesistente -> 401 con lo stesso corpo della password errata (anti-enumerazione)', async () => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      const utente: UtenteRecord = {
        id: '1', email: 'a@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'utente', abilitato: 1, societa_id: null, societa_richiesta: null, creato_il: '',
      }
      const e = env(undefined, undefined, [utente])
      const rSconosciuta = await handle(req('POST', '/api/auth/accesso', { body: { email: 'sconosciuta@x.it', password: 'password1' } }), e)
      const rSbagliata = await handle(req('POST', '/api/auth/accesso', { body: { email: 'a@x.it', password: 'sbagliata' } }), e)
      expect(rSconosciuta.status).toBe(401)
      expect(rSbagliata.status).toBe(401)
      const bSconosciuta = await rSconosciuta.json()
      const bSbagliata = await rSbagliata.json()
      expect(bSconosciuta).toEqual({ error: 'credenziali non valide' })
      expect(bSconosciuta).toEqual(bSbagliata)
    })

    it('POST /api/auth/registrazione con ADMIN_EMAIL case-insensitive -> ruolo admin + token', async () => {
      const e = env()
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: 'Admin@X.IT', password: 'password1' } }), e)
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(typeof b.token).toBe('string')
      expect(b.utente).toEqual({ email: ADMIN_EMAIL, ruolo: 'admin', societaId: null })
    })

    it('GET /api/auth/io con Bearer valido -> dati sessione', async () => {
      const e = env()
      const rReg = await handle(req('POST', '/api/auth/registrazione', { body: { email: ADMIN_EMAIL, password: 'password1' } }), e)
      const { token } = await rReg.json()
      const r = await handle(req('GET', '/api/auth/io', { headers: { authorization: `Bearer ${token}` } }), e)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ email: ADMIN_EMAIL, ruolo: 'admin', societaId: null })
    })

    it('GET /api/auth/io senza Bearer -> 401', async () => {
      const r = await handle(req('GET', '/api/auth/io'), env())
      expect(r.status).toBe(401)
    })

    it('GET /api/auth/io con token invalido -> 401', async () => {
      const r = await handle(req('GET', '/api/auth/io', { headers: { authorization: 'Bearer invalido' } }), env())
      expect(r.status).toBe(401)
    })
  })

  describe('AUTH_SECRET mancante', () => {
    // Con AUTH_SECRET vuoto, creaJWT/verificaJWT lanciano una DataError opaca (error 1101 su
    // Cloudflare). Le rotte che usano le sessioni devono invece rispondere 503 con un messaggio chiaro.
    const utenteAbilitato = async (): Promise<UtenteRecord> => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      return {
        id: '1', email: 'a@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'admin', abilitato: 1, societa_id: null, societa_richiesta: null, creato_il: '',
      }
    }

    it('POST /api/auth/accesso con AUTH_SECRET vuoto -> 503 (non crash)', async () => {
      const e = { ...env(undefined, undefined, [await utenteAbilitato()]), AUTH_SECRET: '' }
      const r = await handle(req('POST', '/api/auth/accesso', { body: { email: 'a@x.it', password: 'password1' } }), e)
      expect(r.status).toBe(503)
      expect((await r.json()).error).toMatch(/AUTH_SECRET/)
      expect(r.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('POST /api/auth/registrazione (admin) con AUTH_SECRET vuoto -> 503', async () => {
      const e = { ...env(), AUTH_SECRET: '' }
      const r = await handle(req('POST', '/api/auth/registrazione', { body: { email: ADMIN_EMAIL, password: 'password1' } }), e)
      expect(r.status).toBe(503)
    })

    it('GET /api/auth/io con AUTH_SECRET vuoto -> 503', async () => {
      const e = { ...env(), AUTH_SECRET: '' }
      const r = await handle(req('GET', '/api/auth/io', { headers: { authorization: 'Bearer x.y.z' } }), e)
      expect(r.status).toBe(503)
    })

    it('GET /api/org/:codice con AUTH_SECRET vuoto -> 503', async () => {
      const e = { ...env({}, [orgRow()]), AUTH_SECRET: '' }
      const r = await handle(req('GET', '/api/org/ABC', { headers: { authorization: 'Bearer x.y.z' } }), e)
      expect(r.status).toBe(503)
    })

    it('rotta pubblica (GET /api/torneo/:codice) resta funzionante con AUTH_SECRET vuoto', async () => {
      const e = { ...env({ 'torneo:ABC': riepilogo() }), AUTH_SECRET: '' }
      const r = await handle(req('GET', '/api/torneo/ABC'), e)
      expect(r.status).toBe(200)
    })
  })

  describe('admin', () => {
    const tokenAdmin = () => creaJWT({ sub: 'admin-1', email: ADMIN_EMAIL, ruolo: 'admin', societaId: null }, AUTH_SECRET)
    const tokenUtente = () => creaJWT({ sub: 'u-1', email: 'u@x.it', ruolo: 'utente', societaId: null }, AUTH_SECRET)
    const authAdmin = async () => ({ authorization: `Bearer ${await tokenAdmin()}` })
    const authUtente = async () => ({ authorization: `Bearer ${await tokenUtente()}` })

    const utenteInAttesa = async (): Promise<UtenteRecord> => {
      const { hash, salt, iterazioni } = await hashPassword('password1')
      return {
        id: 'u-2', email: 'nuovo@x.it', password_hash: hash, salt, iterazioni,
        ruolo: 'utente', abilitato: 0, societa_id: null, societa_richiesta: 'Club X', creato_il: '',
      }
    }

    it('GET /api/admin/utenti admin -> elenco utenti', async () => {
      const u = await utenteInAttesa()
      const e = env(undefined, undefined, [u])
      const r = await handle(req('GET', '/api/admin/utenti', { headers: await authAdmin() }), e)
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(b.utenti).toEqual([
        { id: 'u-2', email: 'nuovo@x.it', ruolo: 'utente', abilitato: 0, societaId: null, societaRichiesta: 'Club X' },
      ])
    })

    it('GET /api/admin/utenti con token utente non admin -> 403', async () => {
      const r = await handle(req('GET', '/api/admin/utenti', { headers: await authUtente() }), env())
      expect(r.status).toBe(403)
    })

    it('GET /api/admin/utenti senza token -> 401', async () => {
      const r = await handle(req('GET', '/api/admin/utenti'), env())
      expect(r.status).toBe(401)
    })

    it('POST /api/admin/societa admin crea società, poi compare in GET', async () => {
      const e = env()
      const rCrea = await handle(req('POST', '/api/admin/societa', { headers: await authAdmin(), body: { nome: 'Beach Club' } }), e)
      expect(rCrea.status).toBe(200)
      const creata = await rCrea.json()
      expect(creata.nome).toBe('Beach Club')
      expect(typeof creata.id).toBe('string')
      const rElenco = await handle(req('GET', '/api/admin/societa', { headers: await authAdmin() }), e)
      expect(rElenco.status).toBe(200)
      const bElenco = await rElenco.json()
      expect(bElenco.societa).toHaveLength(1)
      expect(bElenco.societa[0].nome).toBe('Beach Club')
    })

    it('POST /api/admin/societa con token utente non admin -> 403', async () => {
      const r = await handle(req('POST', '/api/admin/societa', { headers: await authUtente(), body: { nome: 'X' } }), env())
      expect(r.status).toBe(403)
    })

    it('POST /api/admin/societa senza nome -> 400', async () => {
      const r = await handle(req('POST', '/api/admin/societa', { headers: await authAdmin(), body: {} }), env())
      expect(r.status).toBe(400)
    })

    it('POST /api/admin/utenti/:id/abilita abilita l\'utente con società, e poi l\'utente riesce ad accedere', async () => {
      const u = await utenteInAttesa()
      const e = env(undefined, undefined, [u], [{ id: 'soc-1', nome: 'Beach Club', creato_il: '' }])
      const r = await handle(req('POST', `/api/admin/utenti/${u.id}/abilita`, { headers: await authAdmin(), body: { societaId: 'soc-1' } }), e)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true })
      const aggiornato = await e.USERS.perId(u.id)
      expect(aggiornato?.abilitato).toBe(1)
      expect(aggiornato?.societa_id).toBe('soc-1')

      const rAccesso = await handle(req('POST', '/api/auth/accesso', { body: { email: u.email, password: 'password1' } }), e)
      expect(rAccesso.status).toBe(200)
    })

    it('POST /api/admin/utenti/:id/abilita con token utente non admin -> 403', async () => {
      const u = await utenteInAttesa()
      const e = env(undefined, undefined, [u])
      const r = await handle(req('POST', `/api/admin/utenti/${u.id}/abilita`, { headers: await authUtente(), body: { societaId: 'soc-1' } }), e)
      expect(r.status).toBe(403)
    })

    it('POST /api/admin/utenti/:id/abilita senza token -> 401', async () => {
      const r = await handle(req('POST', '/api/admin/utenti/u-2/abilita', { body: { societaId: 'soc-1' } }), env())
      expect(r.status).toBe(401)
    })

    it('POST /api/admin/utenti/:id/abilita senza societaId -> 400', async () => {
      const r = await handle(req('POST', '/api/admin/utenti/u-2/abilita', { headers: await authAdmin(), body: {} }), env())
      expect(r.status).toBe(400)
    })

    it('DELETE /api/admin/utenti/:id come admin elimina l\'utente', async () => {
      const u = await utenteInAttesa()
      const e = env(undefined, undefined, [u])
      const r = await handle(req('DELETE', `/api/admin/utenti/${u.id}`, { headers: await authAdmin() }), e)
      expect(r.status).toBe(200)
      expect(await e.USERS.perId(u.id)).toBeNull()
    })

    it('DELETE /api/admin/utenti/:id con token utente non admin -> 403', async () => {
      const u = await utenteInAttesa()
      const e = env(undefined, undefined, [u])
      const r = await handle(req('DELETE', `/api/admin/utenti/${u.id}`, { headers: await authUtente() }), e)
      expect(r.status).toBe(403)
      expect(await e.USERS.perId(u.id)).not.toBeNull()
    })

    it('DELETE /api/admin/utenti/:id senza token -> 401', async () => {
      const r = await handle(req('DELETE', '/api/admin/utenti/u-2'), env())
      expect(r.status).toBe(401)
    })

    it('DELETE /api/admin/utenti/:id di se stesso -> 400 (anti-lockout)', async () => {
      // tokenAdmin ha sub 'admin-1'
      const r = await handle(req('DELETE', '/api/admin/utenti/admin-1', { headers: await authAdmin() }), env())
      expect(r.status).toBe(400)
      expect((await r.json()).error).toMatch(/te stesso/i)
    })
  })
})
