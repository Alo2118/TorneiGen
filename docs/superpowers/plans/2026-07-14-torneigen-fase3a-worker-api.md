# TorneiGen — Piano Fase 3a: Worker API + mock locale + client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il layer API delle iscrizioni: un Cloudflare Worker come **handler puro testabile** (con fake-KV), l'entry `wrangler` e un **mock locale** per sviluppare senza account Cloudflare, più il **client fetch** lato app. Tutto testato, nessuna UI.

**Architecture:** Il Worker è una funzione pura `handle(request, env)` dove `env.KV` è un'interfaccia key-value e `env.READ_TOKEN` il segreto per le rotte protette. Questo la rende testabile con Vitest + una fake-KV in memoria, senza Miniflare. L'entry `worker/src/index.ts` collega il binding KV reale; un `worker/mock-server.mjs` serve lo stesso `handle` su Node http con KV in memoria per lo sviluppo locale. Il client `src/services/registrations-api.ts` parla a un URL base configurabile.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers (runtime target), Node http (mock). Nessuna nuova dipendenza di runtime nell'app.

## Global Constraints

- TypeScript strict. Il Worker (`worker/`) è codice separato dall'app (`src/`); non importa da `src/engine`/`src/db`/UI. L'app non importa da `worker/` (a parte i **tipi** condivisi, vedi Task 1).
- Il Worker `handle` è **puro rispetto all'IO**: tutto l'accesso ai dati passa da `env.KV` (interfaccia iniettata) — niente global mutabili. Testabile con una fake-KV in memoria.
- Auth: rotte organizzatore richiedono `Authorization: Bearer <READ_TOKEN>`; confronto con `env.READ_TOKEN`. Il pubblico può SOLO `POST /api/iscrizioni/:codice` e `GET /api/torneo/:codice`.
- CORS abilitato (`access-control-allow-origin: *`) su tutte le risposte; gestire `OPTIONS` con 204.
- Nomi/dominio in italiano dove sono dati (es. `nomeSquadra`, `giocatori`, `codice`, `chiuso`).
- Le iscrizioni sono oggetti JSON in KV: chiave riepilogo `torneo:<codice>`, chiave iscrizione `iscr:<codice>:<id>`.
- Commit frequenti, uno per task.

## File Structure

```
worker/
  src/handler.ts        # handle(request, env) puro + tipi KV/Env
  src/handler.test.ts   # test con fake-KV
  src/fake-kv.ts        # KV in memoria per test e mock
  src/index.ts          # entry Cloudflare (default { fetch })
  mock-server.mjs       # server Node http locale che serve handle
  wrangler.toml         # config Worker (KV binding, secret)
  tsconfig.json         # tsconfig del worker
src/services/
  registrations-api.ts       # client fetch (app side)
  registrations-api.test.ts
src/types/registrations.ts    # tipi condivisi (Riepilogo, Iscrizione)
```

---

### Task 1: Tipi condivisi + fake-KV + handler (contratto base)

**Files:**
- Create: `src/types/registrations.ts`
- Create: `worker/src/fake-kv.ts`
- Create: `worker/src/handler.ts`
- Create: `worker/src/handler.test.ts`
- Create: `worker/tsconfig.json`
- Modify: `vitest.config.ts` (includere i test del worker)

**Interfaces:**
- Consumes: niente.
- Produces:
  - Tipi in `src/types/registrations.ts`: `Riepilogo`, `Iscrizione`, `GiocatoreIscrizione`.
  - `KV` (interfaccia), `Env`, `handle(req: Request, env: Env): Promise<Response>` in `worker/src/handler.ts`.
  - `fakeKV(): KV` in `worker/src/fake-kv.ts`.

- [ ] **Step 1: Definire i tipi condivisi**

Create `src/types/registrations.ts`:
```ts
export interface GiocatoreIscrizione {
  nome: string
  cognome: string
  email: string
  telefono: string
}

export interface Iscrizione {
  id: string
  codice: string
  nomeSquadra: string
  giocatori: GiocatoreIscrizione[]
  createdAt: string
}

export interface Riepilogo {
  codice: string
  nome: string
  tipologia: '2x2' | '4x4'
  formato: string | null
  chiuso: boolean
  updatedAt: string
}
```

- [ ] **Step 2: Fake-KV in memoria**

Create `worker/src/fake-kv.ts`:
```ts
import type { KV } from './handler'

export function fakeKV(seed?: Record<string, string>): KV {
  const m = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    async get(key) {
      return m.has(key) ? (m.get(key) as string) : null
    },
    async put(key, value) {
      m.set(key, value)
    },
    async delete(key) {
      m.delete(key)
    },
    async list({ prefix }) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }
    },
  }
}
```

- [ ] **Step 3: Scrivere i test dell'handler**

Create `worker/src/handler.test.ts`:
```ts
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
```

- [ ] **Step 4: Verificare fallimento**

Modify `vitest.config.ts` — estendere `include` per i test del worker:
```ts
include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
```
Run: `npm test -- handler`
Expected: FAIL — `./handler` non trovato.

- [ ] **Step 5: Implementare l'handler**

Create `worker/src/handler.ts`:
```ts
import type { Riepilogo, Iscrizione } from '../../src/types/registrations'

export interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>
}

export interface Env {
  KV: KV
  READ_TOKEN: string
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } })
}

function autorizzato(req: Request, env: Env): boolean {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return !!m && m[1] === env.READ_TOKEN
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const parts = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').split('/')
  const [p0, p1, p2, p3] = parts

  if (p0 !== 'api') return json({ error: 'not found' }, 404)

  // POST /api/torneo  (organizzatore)
  if (req.method === 'POST' && p1 === 'torneo' && !p2) {
    if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)
    const b = (await req.json()) as Partial<Riepilogo>
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
    if ((JSON.parse(raw) as Riepilogo).chiuso) return json({ error: 'iscrizioni chiuse' }, 403)
    const b = (await req.json()) as Partial<Iscrizione>
    if (!b.nomeSquadra || !Array.isArray(b.giocatori) || b.giocatori.length === 0) return json({ error: 'iscrizione incompleta' }, 400)
    for (const g of b.giocatori) {
      if (!g.nome || !g.cognome || !g.email || !g.telefono) return json({ error: 'giocatore incompleto' }, 400)
    }
    const id = crypto.randomUUID()
    const iscr: Iscrizione = { id, codice: p2, nomeSquadra: b.nomeSquadra, giocatori: b.giocatori, createdAt: new Date().toISOString() }
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

  return json({ error: 'not found' }, 404)
}
```

Create `worker/tsconfig.json` (isolato, con lib WebWorker/DOM per `Request`/`crypto`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": [],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "../src/types/registrations.ts"]
}
```

- [ ] **Step 6: Verificare passaggio**

Run: `npm test -- handler`
Expected: PASS (tutti i casi).
Run: `npm test` — intera suite verde (i test app+worker).

- [ ] **Step 7: Commit**

```bash
git add src/types/registrations.ts worker/src/handler.ts worker/src/handler.test.ts worker/src/fake-kv.ts worker/tsconfig.json vitest.config.ts
git commit -m "feat(worker): handler API iscrizioni puro con fake-KV e test"
```

---

### Task 2: Entry Cloudflare + wrangler + mock server locale

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.toml`
- Create: `worker/mock-server.mjs`
- Modify: `package.json` (script `mock:api`)

**Interfaces:**
- Consumes: `handle` (Task 1), `fakeKV` (Task 1).
- Produces: entry Worker deployabile; comando `npm run mock:api` che serve l'API in locale su `http://localhost:8787` con KV in memoria.

- [ ] **Step 1: Entry Cloudflare**

Create `worker/src/index.ts`:
```ts
import { handle, type Env } from './handler'

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env)
  },
}
```

- [ ] **Step 2: Config wrangler**

Create `worker/wrangler.toml`:
```toml
name = "torneigen-api"
main = "src/index.ts"
compatibility_date = "2026-01-01"

# Il namespace KV va creato al deploy: `wrangler kv namespace create KV`
# e incollato l'id qui sotto. Il secret READ_TOKEN si imposta con:
# `wrangler secret put READ_TOKEN`
[[kv_namespaces]]
binding = "KV"
id = "DA_IMPOSTARE_AL_DEPLOY"
```

- [ ] **Step 3: Mock server locale**

Create `worker/mock-server.mjs` (Node 18+, usa i global `Request`/`Response`):
```js
import { createServer } from 'node:http'
import { handle } from './src/handler.ts'
import { fakeKV } from './src/fake-kv.ts'

// Nota: eseguire con un runner che supporta TS (es. `node --experimental-strip-types`
// su Node 22+, oppure `npx tsx worker/mock-server.mjs`). Vedi lo script npm.
const env = { KV: fakeKV(), READ_TOKEN: process.env.READ_TOKEN || 'dev-token' }

const server = createServer(async (nreq, nres) => {
  const chunks = []
  for await (const c of nreq) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const url = 'http://localhost:8787' + nreq.url
  const request = new Request(url, {
    method: nreq.method,
    headers: nreq.headers,
    body: ['GET', 'HEAD'].includes(nreq.method) ? undefined : body,
  })
  const res = await handle(request, env)
  nres.statusCode = res.status
  res.headers.forEach((v, k) => nres.setHeader(k, v))
  const buf = Buffer.from(await res.arrayBuffer())
  nres.end(buf)
})

server.listen(8787, () => console.log('Mock API iscrizioni su http://localhost:8787 (token: dev-token)'))
```

In `package.json` aggiungere agli `scripts`:
```json
"mock:api": "npx tsx worker/mock-server.mjs"
```
(Installare tsx come dev-dep se non presente: `npm install -D tsx`.)

- [ ] **Step 4: Verifica manuale del mock (smoke)**

Run in un terminale: `npm run mock:api`
In un altro:
```bash
curl -s -X POST http://localhost:8787/api/torneo -H "authorization: Bearer dev-token" -H "content-type: application/json" -d '{"codice":"ABC","nome":"Coppa","tipologia":"2x2"}'
curl -s http://localhost:8787/api/torneo/ABC
```
Expected: la prima ritorna il riepilogo, la seconda lo rilegge. Fermare il mock con Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/wrangler.toml worker/mock-server.mjs package.json package-lock.json
git commit -m "feat(worker): entry Cloudflare, wrangler config e mock server locale"
```

---

### Task 3: Client API lato app

**Files:**
- Create: `src/services/registrations-api.ts`
- Create: `src/services/registrations-api.test.ts`

**Interfaces:**
- Consumes: tipi da `../types/registrations`.
- Produces: `creaClient(config: { baseUrl: string; token?: string }): RegistrationsClient` con metodi:
  - `getRiepilogo(codice): Promise<Riepilogo>`
  - `pubblicaRiepilogo(r: Riepilogo): Promise<Riepilogo>` (usa token)
  - `inviaIscrizione(codice, dati: { nomeSquadra; giocatori }): Promise<{ id: string }>`
  - `elencaIscrizioni(codice): Promise<Iscrizione[]>` (usa token)
  - `eliminaIscrizione(codice, id): Promise<void>` (usa token)
  Ogni metodo lancia `Error` con messaggio leggibile su risposta non ok.

- [ ] **Step 1: Scrivere i test (fetch mockato)**

Create `src/services/registrations-api.test.ts`:
```ts
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
    const opts = f.mock.calls[0][1]
    expect(opts.headers.authorization).toBe('Bearer tok')
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
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- registrations-api`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare il client**

Create `src/services/registrations-api.ts`:
```ts
import type { Riepilogo, Iscrizione, GiocatoreIscrizione } from '../types/registrations'

export interface RegistrationsClient {
  getRiepilogo(codice: string): Promise<Riepilogo>
  pubblicaRiepilogo(r: Riepilogo): Promise<Riepilogo>
  inviaIscrizione(codice: string, dati: { nomeSquadra: string; giocatori: GiocatoreIscrizione[] }): Promise<{ id: string }>
  elencaIscrizioni(codice: string): Promise<Iscrizione[]>
  eliminaIscrizione(codice: string, id: string): Promise<void>
}

export function creaClient(config: { baseUrl: string; token?: string }): RegistrationsClient {
  const base = config.baseUrl.replace(/\/+$/, '')

  async function call(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.auth) headers.authorization = `Bearer ${config.token ?? ''}`
    const res = await fetch(base + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `Errore ${res.status}`
      throw new Error(msg)
    }
    return data
  }

  return {
    getRiepilogo: (codice) => call('GET', `/api/torneo/${codice}`) as Promise<Riepilogo>,
    pubblicaRiepilogo: (r) => call('POST', '/api/torneo', { body: r, auth: true }) as Promise<Riepilogo>,
    inviaIscrizione: (codice, dati) => call('POST', `/api/iscrizioni/${codice}`, { body: dati }) as Promise<{ id: string }>,
    async elencaIscrizioni(codice) {
      const d = (await call('GET', `/api/iscrizioni/${codice}`, { auth: true })) as { iscrizioni: Iscrizione[] }
      return d.iscrizioni
    },
    async eliminaIscrizione(codice, id) {
      await call('DELETE', `/api/iscrizioni/${codice}/${id}`, { auth: true })
    },
  }
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- registrations-api`
Expected: PASS.
Run: `npm test` — intera suite verde. `npx tsc --noEmit -p tsconfig.app.json` pulito.

- [ ] **Step 5: Commit**

```bash
git add src/services/registrations-api.ts src/services/registrations-api.test.ts
git commit -m "feat(services): client API iscrizioni verso URL base configurabile"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (3a):** contratto API (4 rotte + DELETE) → Task 1; auth Bearer + CORS + validazione → Task 1; storage JSON in KV → Task 1; entry Cloudflare + wrangler + mock locale → Task 2; client agnostico su URL base → Task 3. UI (form pubblico, import, impostazioni), conferma squadre e filtro generazione → Piani 3b/3c.
- **Placeholder:** nessuno; codice completo e test reali in ogni task.
- **Consistenza tipi:** `Riepilogo`/`Iscrizione`/`GiocatoreIscrizione` definiti in `src/types/registrations.ts` e usati da handler e client; `handle(req, env)` con `Env{KV, READ_TOKEN}`; il client rispecchia esattamente le rotte dell'handler.

## Note per l'esecuzione

- I test del worker girano nella stessa Vitest dell'app (ambiente jsdom, innocuo: usano `Request`/`Response`/`crypto` globali di Node 18+).
- Il mock server usa `tsx` per eseguire TypeScript; è solo per lo sviluppo locale, non entra nel bundle dell'app.
- Il deploy reale (namespace KV, secret `READ_TOKEN`, `wrangler deploy`, PWA su GitHub Pages) è un passo finale separato — non in questo piano.

## Prossimi piani

- **Piano 3b — Iscrizione pubblica:** impostazioni (URL API + token in localStorage), azioni Apri/Chiudi iscrizioni (pubblica riepilogo) + link pubblico, `RegistrationScreen` autoconfigurato.
- **Piano 3c — Import:** `ImportScreen` (scarica → dedup → importa come squadre `in_attesa`), conferma squadre in `TeamsScreen`, filtro `generaTorneo` alle sole squadre `confermata`.
