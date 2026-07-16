import type { Riepilogo, Iscrizione } from '../../src/types/registrations'
import type { PublicSnapshot } from '../../src/types/public'
import type { OrgRecord } from '../../src/types/org'

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

export interface Env {
  KV: KV
  READ_TOKEN: string
  WRITE_TOKEN: string
  ORG: OrgStore
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

function autorizzatoScrittura(req: Request, env: Env): boolean {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return !!m && m[1] === env.WRITE_TOKEN
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const parts = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').split('/')
  const [p0, p1, p2, p3] = parts

  if (p0 !== 'api') return json({ error: 'not found' }, 404)

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
  if (req.method === 'GET' && p1 === 'org' && p2) {
    if (!autorizzatoScrittura(req, env)) return json({ error: 'non autorizzato' }, 401)
    const row = await env.ORG.get(p2)
    if (!row) return json({ error: 'non trovato' }, 404)
    return json(row)
  }

  // PUT /api/org/:codice  (organizzatore, concorrenza ottimistica)
  if (req.method === 'PUT' && p1 === 'org' && p2 && !p3) {
    if (!autorizzatoScrittura(req, env)) return json({ error: 'non autorizzato' }, 401)
    let b: { doc?: unknown; version?: unknown }
    try {
      b = (await req.json()) as { doc?: unknown; version?: unknown }
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (typeof b.doc !== 'string' || typeof b.version !== 'number') return json({ error: 'dati incompleti' }, 400)
    const esistente = await env.ORG.get(p2)
    const corrente = esistente?.version ?? 0
    if (b.version !== corrente) return json({ error: 'conflitto', version: corrente }, 409)
    const nuovaVersione = corrente + 1
    await env.ORG.put({ codice: p2, doc: b.doc, version: nuovaVersione, updatedAt: new Date().toISOString() })
    return json({ version: nuovaVersione })
  }

  // DELETE /api/org/:codice  (organizzatore)
  if (req.method === 'DELETE' && p1 === 'org' && p2 && !p3) {
    if (!autorizzatoScrittura(req, env)) return json({ error: 'non autorizzato' }, 401)
    await env.ORG.delete(p2)
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
}
