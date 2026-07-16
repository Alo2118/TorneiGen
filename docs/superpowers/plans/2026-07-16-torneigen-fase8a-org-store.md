# TorneiGen Fase 8a — Store cloud dell'organizzazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondamenta del multi-organizzatore: uno store D1 versionato (last-write-wins) per un documento di organizzazione opaco per torneo, con endpoint `/api/org/:codice` (GET/PUT/DELETE) dietro un nuovo `WRITE_TOKEN`, testabile senza D1 reale, più i metodi client.

**Architecture:** Il Worker (`handle(req, env)`) guadagna un'astrazione `OrgStore` (get/put/delete di un `OrgRecord`), usata dagli endpoint org; in produzione è collegata a **D1** da `index.ts`, nei test/mock a un `fakeOrgStore` in memoria (stesso pattern del KV). La versione è gestita nell'handler (concorrenza ottimistica: 409 su versione stale). L'app guadagna i metodi client `getOrg/putOrg/deleteOrg` col write token.

**Tech Stack:** Cloudflare Worker + D1 (SQLite), handler puro + fake per i test; Vite + React + TS strict, Vitest. Nessuna nuova dipendenza npm.

## Global Constraints

- TypeScript **strict**: nessun `any` non necessario, nessun errore `tsc --noEmit`.
- Copy/messaggi in **italiano**.
- Il documento org è **privato**: TUTTI gli endpoint `/api/org/:codice` dietro `Bearer <WRITE_TOKEN>` (401 senza). Il `READ_TOKEN` pubblico NON vi dà accesso.
- Il `doc` è un **blob JSON opaco** (stringa): il Worker non ne interpreta la struttura.
- Concorrenza ottimistica: nessuna riga + `version===0` → v1; riga + `version===corrente` → v+1; altrimenti **409** con la versione attuale nel body.
- **Verifica su WSL**: suite vitest flaky → run mirati (`npm test -- <file>`), `npx tsc --noEmit`. Worker: `npm test -- worker/src/handler.test.ts`.
- Handler resta **puro e testabile**: usa `env.ORG` (interfaccia `OrgStore`), mai D1 direttamente.
- **Nessuna modifica UI** in questa fase.

---

## File Structure

- **Create** `src/types/org.ts` — tipo condiviso `OrgRecord`.
- **Modify** `worker/src/handler.ts` — `OrgStore` interface, `WRITE_TOKEN` in `Env`, `autorizzatoScrittura`, endpoint `/api/org/:codice`, PUT in CORS.
- **Create** `worker/src/fake-org-store.ts` — `fakeOrgStore` in memoria (test + mock).
- **Create** `worker/src/d1-org-store.ts` — adattatore `OrgStore` su D1.
- **Modify** `worker/src/index.ts` — costruisce `env.ORG` da D1 (`env.DB`).
- **Create** `worker/schema.sql` — DDL tabella.
- **Modify** `worker/wrangler.toml` — binding D1.
- **Modify** `worker/mock-server.mjs` — passa `WRITE_TOKEN` + `fakeOrgStore`.
- **Modify** `worker/src/handler.test.ts` — helper `env()` aggiornato + test org.
- **Create** `worker/src/d1-org-store.test.ts` — test dell'adattatore.
- **Modify** `src/services/registrations-api.ts` — metodi `getOrg/putOrg/deleteOrg`.
- **Modify** `src/services/config.ts` — `getWriteToken/setWriteToken` + `getClient` passa il write token.
- **Modify** `src/services/registrations-api.test.ts` — test dei metodi org.

---

## Task 1: Worker — endpoint `/api/org/:codice` + `OrgStore`/`fakeOrgStore`

**Files:**
- Create: `src/types/org.ts`, `worker/src/fake-org-store.ts`
- Modify: `worker/src/handler.ts`, `worker/src/handler.test.ts`

**Interfaces:**
- Produces:
  - `OrgRecord { codice: string; doc: string; version: number; updatedAt: string }` (in `src/types/org.ts`)
  - `OrgStore { get(codice: string): Promise<OrgRecord|null>; put(row: OrgRecord): Promise<void>; delete(codice: string): Promise<void> }` (in handler.ts)
  - `Env` guadagna `WRITE_TOKEN: string; ORG: OrgStore`
  - `fakeOrgStore(seed?: OrgRecord[]): OrgStore`

- [ ] **Step 1: Crea il tipo condiviso `src/types/org.ts`**

```ts
// src/types/org.ts
export interface OrgRecord {
  codice: string
  doc: string
  version: number
  updatedAt: string
}
```

- [ ] **Step 2: Crea `worker/src/fake-org-store.ts`**

```ts
// worker/src/fake-org-store.ts
import type { OrgStore } from './handler'
import type { OrgRecord } from '../../src/types/org'

export function fakeOrgStore(seed?: OrgRecord[]): OrgStore {
  const m = new Map<string, OrgRecord>((seed ?? []).map((r) => [r.codice, r]))
  return {
    async get(codice) {
      return m.get(codice) ?? null
    },
    async put(row) {
      m.set(row.codice, { ...row })
    },
    async delete(codice) {
      m.delete(codice)
    },
  }
}
```

- [ ] **Step 3: Scrivi i test del Worker (falliscono)**

In `worker/src/handler.test.ts`: aggiungi gli import e aggiorna l'helper `env`, poi aggiungi i test org.

In cima, accanto agli import esistenti:
```ts
import { fakeOrgStore } from './fake-org-store'
import type { OrgRecord } from '../../src/types/org'
```
Sostituisci la costante token e l'helper `env` esistenti:
```ts
const TOKEN = 'segreto'
function env(seed?: Record<string, string>): Env {
  return { KV: fakeKV(seed), READ_TOKEN: TOKEN }
}
```
con:
```ts
const TOKEN = 'segreto'
const WTOKEN = 'scrivi'
function env(seed?: Record<string, string>, orgSeed?: OrgRecord[]): Env {
  return { KV: fakeKV(seed), READ_TOKEN: TOKEN, WRITE_TOKEN: WTOKEN, ORG: fakeOrgStore(orgSeed) }
}
const authW = { authorization: `Bearer ${WTOKEN}` }
```
Aggiungi in fondo al `describe('handle', ...)`:
```ts
  const orgRow = (over: Partial<OrgRecord> = {}): OrgRecord =>
    ({ codice: 'ABC', doc: '{"x":1}', version: 1, updatedAt: '', ...over })

  it('GET /api/org/:codice senza WRITE_TOKEN -> 401', async () => {
    const r = await handle(req('GET', '/api/org/ABC'), env())
    expect(r.status).toBe(401)
  })
  it('GET /api/org/:codice inesistente (con token) -> 404', async () => {
    const r = await handle(req('GET', '/api/org/NOPE', { headers: authW }), env())
    expect(r.status).toBe(404)
  })
  it('GET /api/org/:codice esistente -> 200 con doc e version', async () => {
    const r = await handle(req('GET', '/api/org/ABC', { headers: authW }), env({}, [orgRow({ doc: '{"n":2}', version: 5 })]))
    expect(r.status).toBe(200)
    const b = await r.json()
    expect(b.version).toBe(5)
    expect(b.doc).toBe('{"n":2}')
  })
  it('PUT nuovo documento (version 0) -> 200 version 1 e salva', async () => {
    const e = env()
    const r = await handle(req('PUT', '/api/org/ABC', { headers: authW, body: { doc: '{"a":1}', version: 0 } }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).version).toBe(1)
    expect((await e.ORG.get('ABC'))?.doc).toBe('{"a":1}')
  })
  it('PUT con versione combaciante -> version+1', async () => {
    const e = env({}, [orgRow({ version: 1 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: authW, body: { doc: '{"b":2}', version: 1 } }), e)
    expect(r.status).toBe(200)
    expect((await r.json()).version).toBe(2)
  })
  it('PUT con versione stale -> 409 con la versione attuale', async () => {
    const e = env({}, [orgRow({ version: 3 })])
    const r = await handle(req('PUT', '/api/org/ABC', { headers: authW, body: { doc: '{}', version: 1 } }), e)
    expect(r.status).toBe(409)
    expect((await r.json()).version).toBe(3)
  })
  it('PUT body non valido -> 400', async () => {
    const r = await handle(req('PUT', '/api/org/ABC', { headers: authW, body: { doc: 123 } }), env())
    expect(r.status).toBe(400)
  })
  it('PUT senza WRITE_TOKEN -> 401', async () => {
    const r = await handle(req('PUT', '/api/org/ABC', { body: { doc: '{}', version: 0 } }), env())
    expect(r.status).toBe(401)
  })
  it('DELETE /api/org/:codice con token rimuove', async () => {
    const e = env({}, [orgRow()])
    const r = await handle(req('DELETE', '/api/org/ABC', { headers: authW }), e)
    expect(r.status).toBe(200)
    expect(await e.ORG.get('ABC')).toBeNull()
  })
  it('DELETE /api/org/:codice senza token -> 401', async () => {
    const r = await handle(req('DELETE', '/api/org/ABC'), env({}, [orgRow()]))
    expect(r.status).toBe(401)
  })
```

- [ ] **Step 4: Esegui i test (devono fallire)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: FAIL — `Env` non ha `WRITE_TOKEN`/`ORG`; gli endpoint org non esistono (404/errori di tipo).

- [ ] **Step 5: Implementa in `worker/src/handler.ts`**

Aggiungi in cima l'import del tipo:
```ts
import type { OrgRecord } from '../../src/types/org'
```
Aggiungi le interfacce (accanto a `KV`):
```ts
export interface OrgStore {
  get(codice: string): Promise<OrgRecord | null>
  put(row: OrgRecord): Promise<void>
  delete(codice: string): Promise<void>
}
```
Estendi `Env`:
```ts
export interface Env {
  KV: KV
  READ_TOKEN: string
  WRITE_TOKEN: string
  ORG: OrgStore
}
```
Aggiungi `PUT` ai metodi CORS. Trova:
```ts
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
```
Sostituisci con:
```ts
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
```
Aggiungi l'helper accanto a `autorizzato`:
```ts
function autorizzatoScrittura(req: Request, env: Env): boolean {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return !!m && m[1] === env.WRITE_TOKEN
}
```
Aggiungi i tre blocchi PRIMA del `return json({ error: 'not found' }, 404)` finale:
```ts
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
```

- [ ] **Step 6: Esegui i test (devono passare)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: PASS (tutti, inclusi i preesistenti).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add src/types/org.ts worker/src/fake-org-store.ts worker/src/handler.ts worker/src/handler.test.ts
git commit -m "feat(worker): endpoint /api/org/:codice versionato + OrgStore/fakeOrgStore"
```

---

## Task 2: D1 — adattatore, wiring, schema, mock

**Files:**
- Create: `worker/src/d1-org-store.ts`, `worker/src/d1-org-store.test.ts`, `worker/schema.sql`
- Modify: `worker/src/index.ts`, `worker/wrangler.toml`, `worker/mock-server.mjs`

**Interfaces:**
- Consumes: `OrgStore`, `OrgRecord` (Task 1).
- Produces: `d1OrgStore(db: D1Like): OrgStore`.

- [ ] **Step 1: Scrivi il test dell'adattatore (fallisce)**

```ts
// worker/src/d1-org-store.test.ts
import { describe, it, expect } from 'vitest'
import { d1OrgStore } from './d1-org-store'
import type { OrgRecord } from '../../src/types/org'

// Fake D1 minimale: registra le query e restituisce righe pilotate
function fakeD1(rowByCodice: Record<string, OrgRecord> = {}) {
  const calls: { sql: string; binds: unknown[] }[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds })
          return {
            async first<T>() {
              const codice = binds[0] as string
              return (rowByCodice[codice] as unknown as T) ?? null
            },
            async run() {
              return {}
            },
          }
        },
      }
    },
  }
}

describe('d1OrgStore', () => {
  it('get restituisce la riga da D1', async () => {
    const db = fakeD1({ ABC: { codice: 'ABC', doc: '{"n":1}', version: 4, updatedAt: 't' } })
    const store = d1OrgStore(db)
    expect(await store.get('ABC')).toEqual({ codice: 'ABC', doc: '{"n":1}', version: 4, updatedAt: 't' })
  })
  it('get restituisce null se assente', async () => {
    const store = d1OrgStore(fakeD1())
    expect(await store.get('NOPE')).toBeNull()
  })
  it('put esegue un upsert con i valori giusti', async () => {
    const db = fakeD1()
    await d1OrgStore(db).put({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' })
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/insert into organizzazioni/i)
    expect(c.binds).toEqual(['ABC', '{}', 2, 't'])
  })
  it('delete cancella per codice', async () => {
    const db = fakeD1()
    await d1OrgStore(db).delete('ABC')
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/delete from organizzazioni/i)
    expect(c.binds).toEqual(['ABC'])
  })
})
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `npm test -- worker/src/d1-org-store.test.ts`
Expected: FAIL — "Failed to resolve import './d1-org-store'".

- [ ] **Step 3: Implementa `worker/src/d1-org-store.ts`**

```ts
// worker/src/d1-org-store.ts
import type { OrgStore } from './handler'
import type { OrgRecord } from '../../src/types/org'

// Interfaccia minima di D1 (evita la dipendenza da @cloudflare/workers-types)
interface D1Bound {
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}
interface D1Prepared {
  bind(...vals: unknown[]): D1Bound
}
export interface D1Like {
  prepare(sql: string): D1Prepared
}

export function d1OrgStore(db: D1Like): OrgStore {
  return {
    async get(codice) {
      const row = await db
        .prepare('SELECT codice, doc, version, updatedAt FROM organizzazioni WHERE codice = ?')
        .bind(codice)
        .first<OrgRecord>()
      return row ?? null
    },
    async put(row) {
      await db
        .prepare(
          'INSERT INTO organizzazioni (codice, doc, version, updatedAt) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(codice) DO UPDATE SET doc = excluded.doc, version = excluded.version, updatedAt = excluded.updatedAt',
        )
        .bind(row.codice, row.doc, row.version, row.updatedAt)
        .run()
    },
    async delete(codice) {
      await db.prepare('DELETE FROM organizzazioni WHERE codice = ?').bind(codice).run()
    },
  }
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `npm test -- worker/src/d1-org-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Crea `worker/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS organizzazioni (
  codice    TEXT PRIMARY KEY,
  doc       TEXT NOT NULL,
  version   INTEGER NOT NULL,
  updatedAt TEXT NOT NULL
);
```

- [ ] **Step 6: Collega D1 in `worker/src/index.ts`**

```ts
// worker/src/index.ts
import { handle, type Env } from './handler'
import { d1OrgStore, type D1Like } from './d1-org-store'

interface CfEnv {
  KV: Env['KV']
  READ_TOKEN: string
  WRITE_TOKEN: string
  DB: D1Like
}

export default {
  fetch(request: Request, cfEnv: CfEnv): Promise<Response> {
    const env: Env = {
      KV: cfEnv.KV,
      READ_TOKEN: cfEnv.READ_TOKEN,
      WRITE_TOKEN: cfEnv.WRITE_TOKEN,
      ORG: d1OrgStore(cfEnv.DB),
    }
    return handle(request, env)
  },
}
```

- [ ] **Step 7: Binding D1 in `worker/wrangler.toml`**

Aggiungi in fondo (l'`database_id` va incollato dopo `wrangler d1 create torneigen-org`; il secret con `wrangler secret put WRITE_TOKEN`):
```toml

# D1 per lo store dell'organizzazione (multi-organizzatore).
# Crea il DB una volta: `wrangler d1 create torneigen-org` e incolla il database_id qui sotto.
# Applica lo schema: `wrangler d1 execute torneigen-org --file=schema.sql --remote`
# Imposta il token di scrittura: `wrangler secret put WRITE_TOKEN`
[[d1_databases]]
binding = "DB"
database_name = "torneigen-org"
database_id = "DA_INCOLLARE_DOPO_wrangler_d1_create"
```

- [ ] **Step 8: Mock locale con `fakeOrgStore` in `worker/mock-server.mjs`**

Aggiungi l'import in cima:
```js
import { fakeOrgStore } from './src/fake-org-store.ts'
```
Sostituisci la riga `const env = { ... }` con:
```js
const env = { KV: fakeKV(), READ_TOKEN: process.env.READ_TOKEN || 'dev-token', WRITE_TOKEN: process.env.WRITE_TOKEN || 'dev-write', ORG: fakeOrgStore() }
```

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npm test -- worker/src/handler.test.ts worker/src/d1-org-store.test.ts`
Expected: PASS.

```bash
git add worker/src/d1-org-store.ts worker/src/d1-org-store.test.ts worker/schema.sql worker/src/index.ts worker/wrangler.toml worker/mock-server.mjs
git commit -m "feat(worker): adattatore D1 per OrgStore + schema + wiring + mock"
```

---

## Task 3: App — client `getOrg/putOrg/deleteOrg` + write token

**Files:**
- Modify: `src/services/registrations-api.ts`, `src/services/config.ts`
- Test: `src/services/registrations-api.test.ts`

**Interfaces:**
- Consumes: `OrgRecord` (Task 1).
- Produces (sul `RegistrationsClient`):
  - `getOrg(codice: string): Promise<OrgRecord | null>` (null se 404)
  - `putOrg(codice: string, doc: string, version: number): Promise<{ conflitto: boolean; version: number }>` (`conflitto:true` sul 409)
  - `deleteOrg(codice: string): Promise<void>`
  - `config.ts`: `getWriteToken(): string | undefined`, `setWriteToken(v: string): void`.

- [ ] **Step 1: Scrivi i test del client (falliscono)**

In `src/services/registrations-api.test.ts` aggiungi (adatta al pattern del file; se usa `vi.stubGlobal('fetch', ...)` o un mock di `fetch`, riusalo):
```ts
import type { OrgRecord } from '../types/org'

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
```
(Se il file di test non importa già `creaClient`/`vi`, aggiungili agli import.)

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/services/registrations-api.test.ts`
Expected: FAIL — `getOrg`/`putOrg` non esistono; `creaClient` non accetta `writeToken`.

- [ ] **Step 3: Implementa in `src/services/registrations-api.ts`**

Aggiungi l'import del tipo in cima:
```ts
import type { OrgRecord } from '../types/org'
```
Estendi l'interfaccia `RegistrationsClient`:
```ts
  getOrg(codice: string): Promise<OrgRecord | null>
  putOrg(codice: string, doc: string, version: number): Promise<{ conflitto: boolean; version: number }>
  deleteOrg(codice: string): Promise<void>
```
Cambia la firma di `creaClient` per accettare il write token:
```ts
export function creaClient(config: { baseUrl: string; token?: string; writeToken?: string }): RegistrationsClient {
```
Dentro `creaClient`, aggiungi un helper per l'header di scrittura (dopo `const base = ...`):
```ts
  const headerW = (): Record<string, string> => (config.writeToken ? { authorization: `Bearer ${config.writeToken}` } : {})
```
Aggiungi i tre metodi all'oggetto ritornato (dopo `rimuoviSnapshot`):
```ts
    async getOrg(codice) {
      const res = await fetch(`${base}/api/org/${codice}`, { headers: headerW() })
      if (res.status === 404) return null
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Errore ${res.status}`)
      return data as OrgRecord
    },
    async putOrg(codice, doc, version) {
      const res = await fetch(`${base}/api/org/${codice}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headerW() },
        body: JSON.stringify({ doc, version }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; version?: number }
      if (res.status === 409) return { conflitto: true, version: data.version ?? version }
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`)
      return { conflitto: false, version: data.version ?? version }
    },
    async deleteOrg(codice) {
      const res = await fetch(`${base}/api/org/${codice}`, { method: 'DELETE', headers: headerW() })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Errore ${res.status}`)
      }
    },
```

- [ ] **Step 4: Aggiungi il write token in `src/services/config.ts`**

Aggiungi le funzioni (accanto a `getReadToken`/`setReadToken`):
```ts
export function getWriteToken(): string | undefined {
  return localStorage.getItem('writeToken') ?? undefined
}
export function setWriteToken(v: string): void {
  localStorage.setItem('writeToken', v.trim())
}
```
E fai passare il write token in `getClient`. Sostituisci:
```ts
export function getClient(): RegistrationsClient {
  return creaClient({ baseUrl: getApiBaseUrl(), token: getReadToken() })
}
```
con:
```ts
export function getClient(): RegistrationsClient {
  return creaClient({ baseUrl: getApiBaseUrl(), token: getReadToken(), writeToken: getWriteToken() })
}
```

- [ ] **Step 5: Esegui i test (devono passare) + typecheck**

Run: `npm test -- src/services/registrations-api.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/services/registrations-api.ts src/services/config.ts src/services/registrations-api.test.ts
git commit -m "feat(services): client getOrg/putOrg/deleteOrg + write token"
```

---

## Task 4: Verifica finale + note di setup

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati dei file toccati**

Run: `npm test -- worker/src/handler.test.ts worker/src/d1-org-store.test.ts src/services/registrations-api.test.ts`
Expected: tutti verdi. (NON la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione (l'app non cambia, ma verifichiamo)**

Run: `npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: (Manuale, account Cloudflare dell'utente) — NON eseguire in automatico**

Questi passi vanno lanciati dall'utente/con la sua autorizzazione (toccano il suo account Cloudflare). Documentali nel report, non eseguirli:
```
cd worker
wrangler d1 create torneigen-org        # copia il database_id nel binding in wrangler.toml
wrangler d1 execute torneigen-org --file=schema.sql --remote
wrangler secret put WRITE_TOKEN         # imposta il token di scrittura
wrangler deploy
```
Verifica post-deploy (endpoint privato → 401 senza token):
```
curl -s -o /dev/null -w "%{http_code}\n" https://torneigen-api.nicola-hdr.workers.dev/api/org/TEST
# atteso: 401
```

- [ ] **Step 5: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore(fase8a): verifica finale org store"
```

---

## Note di esecuzione

- **Ordine:** Task 1 → 2 → 3 → 4 (dipendenza lineare).
- **Modelli (subagent-driven):** tutti i task hanno codice completo → transcription (modello economico); Task 3 tocca client+config con un test da adattare (standard se serve).
- **Setup D1/`WRITE_TOKEN`:** manuale, sull'account dell'utente (Task 4 Step 4). Test e mock usano `fakeOrgStore`, quindi CI/sviluppo non richiedono D1.
- **Fuori scope (8b+):** contenuto del `doc`, sync col locale, UI per il write token, carica-dal-cloud, secondo organizzatore, migrazione.
