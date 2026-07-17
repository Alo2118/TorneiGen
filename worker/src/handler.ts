import type { Riepilogo, Iscrizione } from '../../src/types/registrations'
import type { PublicSnapshot } from '../../src/types/public'
import type { OrgRecord } from '../../src/types/org'
import { hashPassword, verificaPassword, verificaFittizia, creaJWT, verificaJWT, estraiBearer, type SessioneUtente } from './auth'

export interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>
}

export interface OrgStore {
  get(codice: string): Promise<OrgRecord | null>
  put(row: OrgRecord): Promise<void>
  delete(codice: string): Promise<void>
}

export interface UtenteRecord {
  id: string
  email: string
  password_hash: string
  salt: string
  iterazioni: number
  ruolo: 'utente' | 'admin'
  abilitato: number
  societa_id: string | null
  societa_richiesta: string | null
  creato_il: string
}

export interface SocietaRecord {
  id: string
  nome: string
  creato_il: string
}

export interface UserStore {
  perEmail(email: string): Promise<UtenteRecord | null>
  perId(id: string): Promise<UtenteRecord | null>
  crea(u: UtenteRecord): Promise<void>
  abilita(id: string, societaId: string, abilitato: boolean): Promise<void>
  elenco(): Promise<UtenteRecord[]>
}

export interface SocietaStore {
  elenco(): Promise<SocietaRecord[]>
  crea(s: SocietaRecord): Promise<void>
  perId(id: string): Promise<SocietaRecord | null>
}

export interface Env {
  KV: KV
  READ_TOKEN: string
  WRITE_TOKEN: string
  ORG: OrgStore
  USERS: UserStore
  SOCIETA: SocietaStore
  AUTH_SECRET: string
  ADMIN_EMAIL: string
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } })
}

function autorizzato(req: Request, env: Env): boolean {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return !!m && m[1] === env.READ_TOKEN
}

async function sessione(req: Request, env: Env): Promise<SessioneUtente | null> {
  const t = estraiBearer(req)
  return t ? verificaJWT(t, env.AUTH_SECRET) : null
}

async function guardiaAdmin(req: Request, env: Env): Promise<SessioneUtente | Response> {
  const s = await sessione(req, env)
  if (!s) return json({ error: 'non autorizzato' }, 401)
  if (s.ruolo !== 'admin') return json({ error: 'vietato' }, 403)
  return s
}
function emailValida(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const parts = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').split('/')
  const [p0, p1, p2, p3] = parts

  if (p0 !== 'api') return json({ error: 'not found' }, 404)

  // POST /api/auth/registrazione
  if (req.method === 'POST' && p1 === 'auth' && p2 === 'registrazione' && !p3) {
    let b: { email?: unknown; password?: unknown; societa?: unknown }
    try { b = (await req.json()) as typeof b } catch { return json({ error: 'JSON non valido' }, 400) }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    if (!emailValida(email) || password.length < 8) return json({ error: 'dati non validi' }, 400)
    if (await env.USERS.perEmail(email)) return json({ error: 'email già registrata' }, 409)
    const isAdmin = email === env.ADMIN_EMAIL.trim().toLowerCase()
    const { hash, salt, iterazioni } = await hashPassword(password)
    const utente = {
      id: crypto.randomUUID(), email, password_hash: hash, salt, iterazioni,
      ruolo: (isAdmin ? 'admin' : 'utente') as 'utente' | 'admin',
      abilitato: isAdmin ? 1 : 0, societa_id: null,
      societa_richiesta: typeof b.societa === 'string' ? b.societa.trim() : null,
      creato_il: new Date().toISOString(),
    }
    await env.USERS.crea(utente)
    if (isAdmin) {
      const token = await creaJWT({ sub: utente.id, email, ruolo: 'admin', societaId: null }, env.AUTH_SECRET)
      return json({ token, utente: { email, ruolo: 'admin', societaId: null } })
    }
    return json({ stato: 'in_attesa' })
  }

  // POST /api/auth/accesso
  if (req.method === 'POST' && p1 === 'auth' && p2 === 'accesso' && !p3) {
    let b: { email?: unknown; password?: unknown }
    try { b = (await req.json()) as typeof b } catch { return json({ error: 'JSON non valido' }, 400) }
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    const u = await env.USERS.perEmail(email)
    if (!u) {
      // Email sconosciuta: esegue comunque il PBKDF2 su valori fittizi per non rivelare,
      // tramite il tempo di risposta, quali email sono registrate (anti-enumerazione).
      await verificaFittizia(password)
      return json({ error: 'credenziali non valide' }, 401)
    }
    if (!(await verificaPassword(password, u.password_hash, u.salt, u.iterazioni))) {
      return json({ error: 'credenziali non valide' }, 401)
    }
    if (!u.abilitato) return json({ error: 'in_attesa' }, 403)
    const token = await creaJWT({ sub: u.id, email: u.email, ruolo: u.ruolo, societaId: u.societa_id }, env.AUTH_SECRET)
    return json({ token, utente: { email: u.email, ruolo: u.ruolo, societaId: u.societa_id } })
  }

  // GET /api/auth/io
  if (req.method === 'GET' && p1 === 'auth' && p2 === 'io' && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    return json({ email: s.email, ruolo: s.ruolo, societaId: s.societaId })
  }

  // GET /api/admin/utenti
  if (req.method === 'GET' && p1 === 'admin' && p2 === 'utenti' && !p3) {
    const g = await guardiaAdmin(req, env)
    if (g instanceof Response) return g
    const utenti = (await env.USERS.elenco()).map((u) => ({
      id: u.id, email: u.email, ruolo: u.ruolo, abilitato: u.abilitato,
      societaId: u.societa_id, societaRichiesta: u.societa_richiesta,
    }))
    return json({ utenti })
  }

  // GET/POST /api/admin/societa
  if (p1 === 'admin' && p2 === 'societa' && !p3 && (req.method === 'GET' || req.method === 'POST')) {
    const g = await guardiaAdmin(req, env)
    if (g instanceof Response) return g
    if (req.method === 'GET') return json({ societa: await env.SOCIETA.elenco() })
    let b: { nome?: unknown }
    try { b = (await req.json()) as typeof b } catch { return json({ error: 'JSON non valido' }, 400) }
    const nome = typeof b.nome === 'string' ? b.nome.trim() : ''
    if (!nome) return json({ error: 'nome mancante' }, 400)
    const rec = { id: crypto.randomUUID(), nome, creato_il: new Date().toISOString() }
    await env.SOCIETA.crea(rec)
    return json(rec)
  }

  // POST /api/admin/utenti/:id/abilita
  if (req.method === 'POST' && p1 === 'admin' && p2 === 'utenti' && p3 && parts[4] === 'abilita') {
    const g = await guardiaAdmin(req, env)
    if (g instanceof Response) return g
    let b: { societaId?: unknown; abilitato?: unknown }
    try { b = (await req.json()) as typeof b } catch { return json({ error: 'JSON non valido' }, 400) }
    const societaId = typeof b.societaId === 'string' ? b.societaId : ''
    if (!societaId) return json({ error: 'società mancante' }, 400)
    const abilitato = b.abilitato === undefined ? true : Boolean(b.abilitato)
    await env.USERS.abilita(p3, societaId, abilitato)
    return json({ ok: true })
  }

  // POST /api/torneo  (organizzatore)
  if (req.method === 'POST' && p1 === 'torneo' && !p2) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    let b: Partial<Riepilogo>
    try {
      b = (await req.json()) as Partial<Riepilogo>
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (!b.codice || !b.nome || !b.tipologia) return json({ error: 'dati incompleti' }, 400)
    const riepilogo: Riepilogo = {
      codice: b.codice, nome: b.nome, tipologia: b.tipologia,
      formato: b.formato ?? null, chiuso: !!b.chiuso, updatedAt: b.updatedAt ?? new Date().toISOString(),
    }
    await env.KV.put(`torneo:${b.codice}`, JSON.stringify(riepilogo))
    return json(riepilogo)
  }

  // GET /api/torneo/:codice  (pubblico)
  if (req.method === 'GET' && p1 === 'torneo' && p2) {
    const raw = await env.KV.get(`torneo:${p2}`)
    if (!raw) return json({ error: 'torneo non trovato' }, 404)
    return json(JSON.parse(raw))
  }

  // POST /api/iscrizioni/:codice  (pubblico)
  if (req.method === 'POST' && p1 === 'iscrizioni' && p2) {
    const raw = await env.KV.get(`torneo:${p2}`)
    if (!raw) return json({ error: 'torneo non trovato' }, 404)
    const rip = JSON.parse(raw) as Riepilogo
    if (rip.chiuso) return json({ error: 'iscrizioni chiuse' }, 403)
    let b: Partial<Iscrizione>
    try {
      b = (await req.json()) as Partial<Iscrizione>
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (!Array.isArray(b.giocatori) || b.giocatori.length === 0) return json({ error: 'iscrizione incompleta' }, 400)
    // nel 2x2 il nome squadra è facoltativo (identità = cognomi dei giocatori)
    if (rip.tipologia !== '2x2' && !b.nomeSquadra?.trim()) return json({ error: 'iscrizione incompleta' }, 400)
    for (const g of b.giocatori) {
      if (!g.nome?.trim() || !g.cognome?.trim() || !g.email?.trim() || !g.telefono?.trim()) return json({ error: 'giocatore incompleto' }, 400)
    }
    const id = crypto.randomUUID()
    const iscr: Iscrizione = { id, codice: p2, nomeSquadra: b.nomeSquadra ?? '', giocatori: b.giocatori, createdAt: new Date().toISOString() }
    await env.KV.put(`iscr:${p2}:${id}`, JSON.stringify(iscr))
    return json({ ok: true, id }, 201)
  }

  // GET /api/iscrizioni/:codice  (organizzatore)
  if (req.method === 'GET' && p1 === 'iscrizioni' && p2 && !p3) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    const { keys } = await env.KV.list({ prefix: `iscr:${p2}:` })
    const iscrizioni: Iscrizione[] = []
    for (const k of keys) {
      const raw = await env.KV.get(k.name)
      if (raw) iscrizioni.push(JSON.parse(raw))
    }
    return json({ iscrizioni })
  }

  // DELETE /api/iscrizioni/:codice/:id  (organizzatore)
  if (req.method === 'DELETE' && p1 === 'iscrizioni' && p2 && p3) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    await env.KV.delete(`iscr:${p2}:${p3}`)
    return json({ ok: true })
  }

  // POST /api/pubblico/:codice  (organizzatore)
  if (req.method === 'POST' && p1 === 'pubblico' && p2 && !p3) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    let b: Partial<PublicSnapshot>
    try {
      b = (await req.json()) as Partial<PublicSnapshot>
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (!b.codice || !b.nome || !b.tipologia) return json({ error: 'dati incompleti' }, 400)
    const snap = { ...b, updatedAt: b.updatedAt || new Date().toISOString() }
    await env.KV.put(`pubblico:${p2}`, JSON.stringify(snap))
    return json({ ok: true })
  }

  // GET /api/pubblico/:codice  (pubblico)
  if (req.method === 'GET' && p1 === 'pubblico' && p2) {
    const raw = await env.KV.get(`pubblico:${p2}`)
    if (!raw) return json({ error: 'torneo non trovato' }, 404)
    return json(JSON.parse(raw))
  }

  // DELETE /api/pubblico/:codice  (organizzatore)
  if (req.method === 'DELETE' && p1 === 'pubblico' && p2 && !p3) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    await env.KV.delete(`pubblico:${p2}`)
    return json({ ok: true })
  }

  // GET /api/org/:codice  (organizzatore, privato)
  if (req.method === 'GET' && p1 === 'org' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    const row = await env.ORG.get(p2)
    if (!row) return json({ error: 'non trovato' }, 404)
    if (!(s.ruolo === 'admin' || !row.societaId || row.societaId === s.societaId)) return json({ error: 'vietato' }, 403)
    return json(row)
  }

  // PUT /api/org/:codice  (organizzatore, concorrenza ottimistica)
  if (req.method === 'PUT' && p1 === 'org' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    if (!s.societaId && s.ruolo !== 'admin') return json({ error: 'nessuna società' }, 403)
    let b: { doc?: unknown; version?: unknown }
    try { b = (await req.json()) as typeof b } catch { return json({ error: 'JSON non valido' }, 400) }
    if (typeof b.doc !== 'string' || typeof b.version !== 'number') return json({ error: 'dati incompleti' }, 400)
    const esistente = await env.ORG.get(p2)
    if (esistente && !(s.ruolo === 'admin' || !esistente.societaId || esistente.societaId === s.societaId)) {
      return json({ error: 'vietato' }, 403)
    }
    const corrente = esistente?.version ?? 0
    if (b.version !== corrente) return json({ error: 'conflitto', version: corrente }, 409)
    const nuovaVersione = corrente + 1
    // claim: mantieni la società esistente, altrimenti assegna quella dell'utente
    const societaId = esistente?.societaId ?? s.societaId ?? null
    await env.ORG.put({ codice: p2, doc: b.doc, version: nuovaVersione, updatedAt: new Date().toISOString(), societaId })
    return json({ version: nuovaVersione })
  }

  // DELETE /api/org/:codice  (organizzatore)
  if (req.method === 'DELETE' && p1 === 'org' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    const row = await env.ORG.get(p2)
    if (row && !(s.ruolo === 'admin' || !row.societaId || row.societaId === s.societaId)) return json({ error: 'vietato' }, 403)
    await env.ORG.delete(p2)
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
}
