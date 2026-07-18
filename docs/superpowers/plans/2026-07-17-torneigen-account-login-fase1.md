# Account & Login (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Account veri (email+password), sessioni JWT, società multi-tenant come proprietaria dei tornei, ruolo admin, pannello admin di abilitazione — mantenendo il local-first.

**Architecture:** Worker: helper auth puri (`auth.ts`: PBKDF2 + JWT), store astratti (`UserStore`/`SocietaStore`) con adattatori D1 + fake, endpoint auth/admin/org protetti da sessione. Client: sessione al posto del write token, servizio auth, UI login + pannello admin. D1 gains `societa`, `utenti`, e `organizzazioni.societa_id`.

**Tech Stack:** Cloudflare Worker (TS, Web Crypto), D1, Vitest; React 18 + TS strict, Dexie, react-router.

## Global Constraints

- TypeScript strict; copy italiano.
- **Sicurezza:** password sempre hashate (PBKDF2 salato, ~150k iter), confronto a tempo costante, mai in chiaro/log; JWT HS256 firmato con `AUTH_SECRET`, verifica firma+scadenza; endpoint admin dietro guardia ruolo; account disabilitati non accedono.
- **Local-first intatto:** senza login l'app resta locale; `sincronizzabile()` = online + sessione presente.
- **NB ambiente:** root `npx tsc --noEmit` è NO-OP → per l'app usa `npx tsc -b`; niente `npm test` (WSL flaky). Worker test: `npm test -- worker/src/handler.test.ts` (o file mirato). App: run mirati + `tsc -b` + `npm run build`.
- Ogni commit termina con: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

Riferimenti (stato attuale): `worker/src/handler.ts` ha `Env {KV, READ_TOKEN, WRITE_TOKEN, ORG}`, helper `autorizzato`(READ_TOKEN)/`autorizzatoScrittura`(WRITE_TOKEN), endpoint `/api/org/:codice` dietro `autorizzatoScrittura`. `OrgRecord` = `{codice, doc, version, updatedAt}` in `src/types/org.ts`. `d1-org-store.ts`/`fake-org-store.ts` implementano `OrgStore`. `index.ts` costruisce `env` da `cfEnv`. Client in `src/services/registrations-api.ts` (`creaClient({baseUrl, token?, writeToken?})`), `src/services/config.ts` (`getWriteToken/getClient`), `src/services/orgSync.ts` (`sincronizzabile` usa `getWriteToken`).

---

### Task 1: Worker auth core (`auth.ts`) — PBKDF2 + JWT

**Files:** Create `worker/src/auth.ts`, `worker/src/auth.test.ts`.

**Interfaces — Produces:**
- `interface SessioneUtente { sub: string; email: string; ruolo: 'utente'|'admin'; societaId: string|null; exp: number }`
- `hashPassword(password): Promise<{hash, salt, iterazioni}>`
- `verificaPassword(password, hash, salt, iterazioni): Promise<boolean>` (tempo costante)
- `creaJWT(payload: Omit<SessioneUtente,'exp'>, segreto, durataSec?, adesso?): Promise<string>`
- `verificaJWT(token, segreto, adesso?): Promise<SessioneUtente|null>`
- `estraiBearer(req: Request): string|null`

- [ ] **Step 1: Test (RED)** — Create `worker/src/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verificaPassword, creaJWT, verificaJWT, estraiBearer } from './auth'

describe('password', () => {
  it('verifica corretta e rifiuta sbagliata', async () => {
    const { hash, salt, iterazioni } = await hashPassword('segreta123')
    expect(await verificaPassword('segreta123', hash, salt, iterazioni)).toBe(true)
    expect(await verificaPassword('altra', hash, salt, iterazioni)).toBe(false)
  })
  it('salt diverso a ogni hash', async () => {
    const a = await hashPassword('x'); const b = await hashPassword('x')
    expect(a.salt).not.toEqual(b.salt)
  })
})

describe('jwt', () => {
  const seg = 'segreto-test'
  const base = { sub: 'u1', email: 'a@x.it', ruolo: 'utente' as const, societaId: 's1' }
  it('round-trip valido', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    const p = await verificaJWT(t, seg, 1_000_000)
    expect(p?.sub).toBe('u1'); expect(p?.societaId).toBe('s1'); expect(p?.ruolo).toBe('utente')
  })
  it('firma errata → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    expect(await verificaJWT(t, 'altro-segreto', 1_000_000)).toBeNull()
  })
  it('scaduto → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000) // exp = 1000 + 3600 s
    expect(await verificaJWT(t, seg, 1_000_000 + 3_601_000)).toBeNull()
  })
  it('manomesso → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    const rotto = t.slice(0, -2) + (t.slice(-2) === 'aa' ? 'bb' : 'aa')
    expect(await verificaJWT(rotto, seg, 1_000_000)).toBeNull()
  })
})

describe('estraiBearer', () => {
  it('estrae il token', () => {
    expect(estraiBearer(new Request('https://x/', { headers: { authorization: 'Bearer abc' } }))).toBe('abc')
    expect(estraiBearer(new Request('https://x/'))).toBeNull()
  })
})
```

Run: `npm test -- worker/src/auth.test.ts` → FAIL (modulo assente).

- [ ] **Step 2: Implementa** — Create `worker/src/auth.ts`:

```ts
export interface SessioneUtente {
  sub: string
  email: string
  ruolo: 'utente' | 'admin'
  societaId: string | null
  exp: number
}

const ITERAZIONI = 150000
const enc = new TextEncoder()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function deb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlStr(s: string): string {
  return b64url(enc.encode(s))
}
function deb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return deb64(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}
function confrontoCostante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function derivaBits(password: string, salt: Uint8Array, iterazioni: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iterazioni, hash: 'SHA-256' }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterazioni: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derivaBits(password, salt, ITERAZIONI)
  return { hash: b64(derived), salt: b64(salt), iterazioni: ITERAZIONI }
}

export async function verificaPassword(password: string, hash: string, salt: string, iterazioni: number): Promise<boolean> {
  const derived = await derivaBits(password, deb64(salt), iterazioni)
  return confrontoCostante(derived, deb64(hash))
}

async function hmac(segreto: string, dati: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(segreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dati))
  return new Uint8Array(sig)
}

export async function creaJWT(
  payload: Omit<SessioneUtente, 'exp'>,
  segreto: string,
  durataSec = 60 * 60 * 24 * 30,
  adesso = Date.now(),
): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(adesso / 1000) + durataSec
  const body = b64urlStr(JSON.stringify({ ...payload, exp }))
  const firma = b64url(await hmac(segreto, `${header}.${body}`))
  return `${header}.${body}.${firma}`
}

export async function verificaJWT(token: string, segreto: string, adesso = Date.now()): Promise<SessioneUtente | null> {
  const parti = token.split('.')
  if (parti.length !== 3) return null
  const [header, body, firma] = parti
  const attesa = b64url(await hmac(segreto, `${header}.${body}`))
  if (!confrontoCostante(enc.encode(firma), enc.encode(attesa))) return null
  let payload: SessioneUtente
  try {
    payload = JSON.parse(new TextDecoder().decode(deb64url(body))) as SessioneUtente
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < adesso) return null
  return payload
}

export function estraiBearer(req: Request): string | null {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}
```

Run: `npm test -- worker/src/auth.test.ts` → PASS.

- [ ] **Step 3: Commit** — `git add worker/src/auth.ts worker/src/auth.test.ts && git commit -m "feat(worker): auth core PBKDF2 + JWT (Fase 1 account)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2: Worker `UserStore` + `SocietaStore` (interfacce + fake)

**Files:** Modify `worker/src/handler.ts` (aggiunge le interfacce + i tipi record); Create `worker/src/fake-user-store.ts`, `worker/src/fake-societa-store.ts`, `worker/src/stores.test.ts`.

**Interfaces — Produces (in `handler.ts`, esportate):**
```ts
export interface UtenteRecord {
  id: string; email: string; password_hash: string; salt: string; iterazioni: number
  ruolo: 'utente' | 'admin'; abilitato: number; societa_id: string | null; societa_richiesta: string | null; creato_il: string
}
export interface SocietaRecord { id: string; nome: string; creato_il: string }
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
```

- [ ] **Step 1: Aggiungi le interfacce** in `worker/src/handler.ts` (accanto a `OrgStore`). Non ancora usate dagli endpoint (Task 3+).

- [ ] **Step 2: Test (RED)** — Create `worker/src/stores.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fakeUserStore } from './fake-user-store'
import { fakeSocietaStore } from './fake-societa-store'
import type { UtenteRecord } from './handler'

const u = (over: Partial<UtenteRecord> = {}): UtenteRecord => ({
  id: 'u1', email: 'a@x.it', password_hash: 'h', salt: 's', iterazioni: 1, ruolo: 'utente',
  abilitato: 0, societa_id: null, societa_richiesta: 'Club', creato_il: 'now', ...over,
})

describe('fakeUserStore', () => {
  it('crea, perEmail (case-insensitive), perId, elenco, abilita', async () => {
    const s = fakeUserStore()
    await s.crea(u({ email: 'A@X.it' }))
    expect((await s.perEmail('a@x.it'))?.id).toBe('u1')
    expect((await s.perId('u1'))?.email).toBe('a@x.it')
    expect(await s.elenco()).toHaveLength(1)
    await s.abilita('u1', 'soc1', true)
    const dopo = await s.perId('u1')
    expect(dopo?.abilitato).toBe(1); expect(dopo?.societa_id).toBe('soc1')
  })
})

describe('fakeSocietaStore', () => {
  it('crea, elenco, perId', async () => {
    const s = fakeSocietaStore()
    await s.crea({ id: 'soc1', nome: 'Beach Club', creato_il: 'now' })
    expect(await s.elenco()).toHaveLength(1)
    expect((await s.perId('soc1'))?.nome).toBe('Beach Club')
  })
})
```

Run: `npm test -- worker/src/stores.test.ts` → FAIL.

- [ ] **Step 3: Implementa i fake** — Create `worker/src/fake-user-store.ts`:

```ts
import type { UserStore, UtenteRecord } from './handler'

export function fakeUserStore(seed?: UtenteRecord[]): UserStore {
  const m = new Map<string, UtenteRecord>((seed ?? []).map((r) => [r.id, { ...r }]))
  const norm = (e: string) => e.trim().toLowerCase()
  return {
    async perEmail(email) {
      for (const r of m.values()) if (norm(r.email) === norm(email)) return { ...r }
      return null
    },
    async perId(id) {
      const r = m.get(id); return r ? { ...r } : null
    },
    async crea(u) {
      m.set(u.id, { ...u, email: norm(u.email) })
    },
    async abilita(id, societaId, abilitato) {
      const r = m.get(id)
      if (r) m.set(id, { ...r, societa_id: societaId, abilitato: abilitato ? 1 : 0 })
    },
    async elenco() {
      return [...m.values()].map((r) => ({ ...r }))
    },
  }
}
```

Create `worker/src/fake-societa-store.ts`:

```ts
import type { SocietaStore, SocietaRecord } from './handler'

export function fakeSocietaStore(seed?: SocietaRecord[]): SocietaStore {
  const m = new Map<string, SocietaRecord>((seed ?? []).map((r) => [r.id, { ...r }]))
  return {
    async elenco() { return [...m.values()].map((r) => ({ ...r })) },
    async crea(s) { m.set(s.id, { ...s }) },
    async perId(id) { const r = m.get(id); return r ? { ...r } : null },
  }
}
```

Run: `npm test -- worker/src/stores.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git add worker/src/handler.ts worker/src/fake-user-store.ts worker/src/fake-societa-store.ts worker/src/stores.test.ts && git commit -m "feat(worker): UserStore/SocietaStore + fake in memoria\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 3: Worker endpoint auth (registrazione / accesso / io)

**Files:** Modify `worker/src/handler.ts`; Test in `worker/src/handler.test.ts` (leggi il file per riusare il pattern di costruzione `Env` con i fake).

**Interfaces — Consumes:** `auth.ts` (Task 1), `UserStore`/`SocietaStore` (Task 2). **Env** guadagna: `AUTH_SECRET: string`, `ADMIN_EMAIL: string`, `USERS: UserStore`, `SOCIETA: SocietaStore`.

- [ ] **Step 1: Estendi `Env`** in `handler.ts`:
```ts
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
```

- [ ] **Step 2: Helper sessione** in `handler.ts` (dopo gli import aggiungi `import { hashPassword, verificaPassword, creaJWT, verificaJWT, estraiBearer, type SessioneUtente } from './auth'`):
```ts
async function sessione(req: Request, env: Env): Promise<SessioneUtente | null> {
  const t = estraiBearer(req)
  return t ? verificaJWT(t, env.AUTH_SECRET) : null
}
function emailValida(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
```

- [ ] **Step 3: Test (RED)** in `worker/src/handler.test.ts` — aggiungi un blocco che costruisce `Env` con `fakeUserStore()`, `fakeSocietaStore()`, `AUTH_SECRET:'seg'`, `ADMIN_EMAIL:'admin@x.it'` (oltre a KV/ORG fake già usati nel file). Casi:
  - `POST /api/auth/registrazione {email:'a@x.it', password:'password1', societa:'Club'}` → 200 `{stato:'in_attesa'}`; l'utente esiste, `abilitato===0`, `ruolo==='utente'`, `societa_richiesta==='Club'`.
  - registrazione con la ADMIN_EMAIL → utente `ruolo:'admin'`, `abilitato:1`, risposta con `token`.
  - registrazione email duplicata → 409.
  - registrazione password < 8 o email non valida → 400.
  - `POST /api/auth/accesso` con credenziali giuste ma `abilitato:0` → 403 `{errore:'in_attesa'}`.
  - accesso admin (abilitato) giusto → 200 `{token, utente:{email, ruolo:'admin', societaId}}`.
  - accesso password errata → 401.
  - `GET /api/auth/io` con Bearer valido → `{email, ruolo, societaId}`; senza/invalid → 401.

Usa `hashPassword` per pre-seedare un utente abilitato nel fake dove serve (o registra+abilita via store). Scrivi asserzioni concrete.

Run: `npm test -- worker/src/handler.test.ts` → FAIL sui nuovi casi.

- [ ] **Step 4: Implementa gli endpoint** in `handle()` (prima del blocco `/api/torneo`, dopo il check `p0 !== 'api'`):

```ts
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
    if (!u || !(await verificaPassword(password, u.password_hash, u.salt, u.iterazioni))) {
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
```

Run: `npm test -- worker/src/handler.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add worker/src/handler.ts worker/src/handler.test.ts && git commit -m "feat(worker): endpoint auth registrazione/accesso/io + gate abilitato\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 4: Worker endpoint admin (utenti / società / abilita)

**Files:** Modify `worker/src/handler.ts`; Test in `worker/src/handler.test.ts`.

**Interfaces — Consumes:** `sessione()` (Task 3), `USERS`/`SOCIETA`.

- [ ] **Step 1: Guardia admin** in `handler.ts` (ritorna la sessione admin, oppure una `Response` 401/403 già pronta — così il chiamante distingue "manca sessione" da "non admin"):
```ts
async function guardiaAdmin(req: Request, env: Env): Promise<SessioneUtente | Response> {
  const s = await sessione(req, env)
  if (!s) return json({ error: 'non autorizzato' }, 401)
  if (s.ruolo !== 'admin') return json({ error: 'vietato' }, 403)
  return s
}
```

- [ ] **Step 2: Test (RED)** in `handler.test.ts` — con un token admin (crea via registrazione admin o `creaJWT({ruolo:'admin',...})`) e un token utente:
  - `GET /api/admin/utenti` admin → elenco (array di `{id,email,ruolo,abilitato,societaId,societaRichiesta}`); con token utente → 403; senza token → 401.
  - `POST /api/admin/societa {nome:'Beach Club'}` admin → `{id, nome}` e compare in `GET /api/admin/societa`.
  - `POST /api/admin/utenti/:id/abilita {societaId}` admin → l'utente diventa `abilitato:1` con quella società (verifica via `USERS.perId`); poi quell'utente riesce a fare `accesso` (non più 403).

Run: `npm test -- worker/src/handler.test.ts` → FAIL nuovi casi.

- [ ] **Step 3: Implementa** in `handle()` (dopo gli endpoint auth):

```ts
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
```

Run: `npm test -- worker/src/handler.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git add -A worker/src && git commit -m "feat(worker): endpoint admin utenti/società/abilita (guardia ruolo)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 5: Worker org endpoint → sessione + società + claim

**Files:** Modify `worker/src/handler.ts`, `src/types/org.ts` (aggiunge `societaId` a `OrgRecord`), `worker/src/fake-org-store.ts` (già copia il record, ok); Test in `worker/src/handler.test.ts`.

**Interfaces:** `OrgRecord` guadagna `societaId?: string | null`. Endpoint `/api/org/*` usano `sessione()` invece di `autorizzatoScrittura`.

- [ ] **Step 1: Estendi `OrgRecord`** in `src/types/org.ts`: aggiungi `societaId?: string | null` all'interfaccia.

- [ ] **Step 2: Test (RED)** in `handler.test.ts` — con due utenti abilitati di **società diverse** (`s1`, `s2`, via token `creaJWT`) e un admin:
  - PUT `/api/org/CODX {doc, version:0}` come utente s1 → 200, e `ORG.get('CODX').societaId === 's1'` (claim).
  - GET `/api/org/CODX` come utente s1 → 200; come utente s2 → 403; come admin → 200.
  - PUT `/api/org/CODX {version:1}` come utente s2 → 403 (non è sua società).
  - DELETE `/api/org/CODX` come utente s2 → 403; come admin → 200.
  - GET/PUT senza token → 401.
  - documento **legacy** senza società (seedato con `societaId:null`): GET come utente qualsiasi → 200 (grazia legacy); PUT lo reclama (`societaId` = società dell'utente).

Run: `npm test -- worker/src/handler.test.ts` → FAIL.

- [ ] **Step 3: Riscrivi i tre endpoint org** in `handle()` (sostituiscono quelli attuali basati su `autorizzatoScrittura`):

```ts
  // helper proprietà: true se l'utente può accedere al doc
  // (admin sempre; società combacia; doc legacy senza società → concesso)
  // definiscilo inline o come funzione: accessoOrg(s, row) => s.ruolo==='admin' || !row.societaId || row.societaId===s.societaId

  // GET /api/org/:codice
  if (req.method === 'GET' && p1 === 'org' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    const row = await env.ORG.get(p2)
    if (!row) return json({ error: 'non trovato' }, 404)
    if (!(s.ruolo === 'admin' || !row.societaId || row.societaId === s.societaId)) return json({ error: 'vietato' }, 403)
    return json(row)
  }

  // PUT /api/org/:codice
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

  // DELETE /api/org/:codice
  if (req.method === 'DELETE' && p1 === 'org' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    const row = await env.ORG.get(p2)
    if (row && !(s.ruolo === 'admin' || !row.societaId || row.societaId === s.societaId)) return json({ error: 'vietato' }, 403)
    await env.ORG.delete(p2)
    return json({ ok: true })
  }
```

Rimuovi l'helper `autorizzatoScrittura` se non più usato (il `WRITE_TOKEN` in `Env` può restare, ora inutilizzato dagli endpoint org — lascialo per non toccare index.ts in questo task; sarà pulito nel Task 6).

- [ ] **Step 4: Verifica** — `npm test -- worker/src/handler.test.ts` → PASS (inclusi i test org preesistenti aggiornati: quelli che usavano il write token ora vanno adattati a usare un token di sessione — aggiornali).

- [ ] **Step 5: Commit** — `git add -A worker/src src/types/org.ts && git commit -m "feat(worker): endpoint org per-società (sessione + claim + admin bypass)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 6: D1 (schema + adattatori) + wiring index.ts + mock server

**Files:** Modify `worker/schema.sql`, `worker/src/d1-org-store.ts`, `worker/src/index.ts`, `worker/mock-server.mjs`, `worker/wrangler.toml`; Create `worker/src/d1-user-store.ts`, `worker/src/d1-societa-store.ts`.

- [ ] **Step 1: Schema** — In `worker/schema.sql` aggiungi (dopo la tabella `organizzazioni`) SOLO le due tabelle nuove. *(La colonna `societa_id` su `organizzazioni` — l'`ALTER TABLE organizzazioni ADD COLUMN societa_id TEXT;` — è GIÀ stata aggiunta nel fix del Task 5: NON riaggiungerla.)*
```sql
CREATE TABLE IF NOT EXISTS societa (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  creato_il TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS utenti (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  salt              TEXT NOT NULL,
  iterazioni        INTEGER NOT NULL,
  ruolo             TEXT NOT NULL DEFAULT 'utente',
  abilitato         INTEGER NOT NULL DEFAULT 0,
  societa_id        TEXT,
  societa_richiesta TEXT,
  creato_il         TEXT NOT NULL
);
```

- [ ] **Step 2: `d1-org-store.ts`** — GIÀ FATTO nel fix del Task 5 (SELECT/INSERT includono `societa_id AS societaId`). **Salta questo step.**

- [ ] **Step 3: Adattatori D1** — Create `worker/src/d1-user-store.ts` (usa `D1Like` importato da `./d1-org-store`):
```ts
import type { UserStore, UtenteRecord } from './handler'
import type { D1Like } from './d1-org-store'

export function d1UserStore(db: D1Like): UserStore {
  const cols = 'id, email, password_hash, salt, iterazioni, ruolo, abilitato, societa_id AS societa_id, societa_richiesta AS societa_richiesta, creato_il'
  return {
    async perEmail(email) {
      return (await db.prepare(`SELECT ${cols} FROM utenti WHERE email = ?`).bind(email.trim().toLowerCase()).first<UtenteRecord>()) ?? null
    },
    async perId(id) {
      return (await db.prepare(`SELECT ${cols} FROM utenti WHERE id = ?`).bind(id).first<UtenteRecord>()) ?? null
    },
    async crea(u) {
      await db.prepare('INSERT INTO utenti (id,email,password_hash,salt,iterazioni,ruolo,abilitato,societa_id,societa_richiesta,creato_il) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(u.id, u.email.trim().toLowerCase(), u.password_hash, u.salt, u.iterazioni, u.ruolo, u.abilitato, u.societa_id, u.societa_richiesta, u.creato_il).run()
    },
    async abilita(id, societaId, abilitato) {
      await db.prepare('UPDATE utenti SET abilitato = ?, societa_id = ? WHERE id = ?').bind(abilitato ? 1 : 0, societaId, id).run()
    },
    async elenco() {
      const r = await db.prepare(`SELECT ${cols} FROM utenti ORDER BY creato_il DESC`).all<UtenteRecord>()
      return r.results ?? []
    },
  }
}
```
Nota: `D1Like` va esteso con `all<T>(): Promise<{ results: T[] }>` su `D1Bound` (aggiungilo all'interfaccia in `d1-org-store.ts`). Create `worker/src/d1-societa-store.ts` analogo (elenco/crea/perId su tabella `societa`).

- [ ] **Step 4: `index.ts`** — estendi `CfEnv` con `AUTH_SECRET: string; ADMIN_EMAIL: string` e costruisci `env` con `USERS: d1UserStore(cfEnv.DB)`, `SOCIETA: d1SocietaStore(cfEnv.DB)`, `AUTH_SECRET`, `ADMIN_EMAIL`. `READ_TOKEN`/`WRITE_TOKEN` restano (WRITE_TOKEN ormai inutilizzato — lascialo per non rompere il typing di `Env`, oppure rimuovilo da `Env` e da qui insieme; se lo rimuovi, togli anche il campo da `Env` in handler.ts).

- [ ] **Step 5: `wrangler.toml`** — aggiungi `[vars]` con `ADMIN_EMAIL = "nicola.hdr@gmail.com"`. (`AUTH_SECRET` è un secret: `wrangler secret put AUTH_SECRET`.)

- [ ] **Step 6: `mock-server.mjs`** — aggiungi al `env` mock: `fakeUserStore()`, `fakeSocietaStore()`, `AUTH_SECRET: 'dev-secret'`, `ADMIN_EMAIL: 'admin@dev'` (leggi il file per lo stile; importa i fake).

- [ ] **Step 7: Verifica** — `npm test -- worker/` (i file worker) → PASS; controlla che `worker/src/index.ts` compili (tsc del worker se configurato, altrimenti verifica manuale dei tipi).

- [ ] **Step 8: Commit** — `git add -A worker && git commit -m "feat(worker): D1 utenti/società + societa_id org + wiring + mock\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 7: Client — sessione, servizio auth, metodi API

**Files:** Modify `src/services/config.ts`, `src/services/registrations-api.ts`, `src/services/orgSync.ts`; Create `src/services/auth.ts`; Test `src/services/auth.test.ts`, aggiorna `src/services/registrations-api.test.ts`.

**Interfaces — Produces:** `config`: `getSessione/setSessione/clearSessione`. `registrations-api` client: `registrazione(email,password,societa)`, `accesso(email,password)`, `io()`, admin (`elencoUtenti/elencoSocieta/creaSocieta/abilitaUtente`); `getOrg/putOrg/deleteOrg` usano il Bearer di sessione. `auth.ts`: `registra/accedi/esci/utenteCorrente`.

- [ ] **Step 1: `config.ts`** — aggiungi:
```ts
export function getSessione(): string | undefined { return localStorage.getItem('sessione') ?? undefined }
export function setSessione(v: string): void { localStorage.setItem('sessione', v) }
export function clearSessione(): void { localStorage.removeItem('sessione') }
```
In `getClient()` passa `sessione: getSessione()` (nuovo campo) invece di `writeToken`. (Puoi mantenere `getWriteToken` per compatibilità ma non più usato dagli org.)

- [ ] **Step 2: `registrations-api.ts`** — `creaClient` accetta `{ baseUrl, token?, sessione? }`. `headerW()` → `sessione ? { authorization: 'Bearer '+sessione } : {}`. Aggiungi i metodi auth/admin (POST/GET con `headerW` per gli endpoint protetti). `getOrg/putOrg/deleteOrg` usano `headerW()` (già lo facevano col write token; ora è la sessione). Definisci i tipi di ritorno (`{token?, utente?, stato?}`, elenchi, ecc.). Aggiorna `RegistrationsClient` interface.

- [ ] **Step 3: `auth.ts` (servizio)** —
```ts
import { getClient, setSessione, clearSessione } from './config'

export interface Utente { email: string; ruolo: 'utente' | 'admin'; societaId: string | null }

export async function registra(email: string, password: string, societa: string): Promise<{ inAttesa: boolean }> {
  const r = await getClient().registrazione(email, password, societa)
  if (r.token) { setSessione(r.token); return { inAttesa: false } }
  return { inAttesa: true }
}
export async function accedi(email: string, password: string): Promise<Utente> {
  const r = await getClient().accesso(email, password)
  setSessione(r.token)
  return r.utente
}
export function esci(): void { clearSessione() }
export async function utenteCorrente(): Promise<Utente | null> {
  try { return await getClient().io() } catch { return null }
}
```

- [ ] **Step 4: `orgSync.ts`** — `sincronizzabile()` usa `getSessione()` invece di `getWriteToken()` (online + sessione presente). Aggiorna l'import.

- [ ] **Step 5: Test** — `src/services/auth.test.ts` con un client fake (registra→token vs in_attesa; accedi salva sessione; utenteCorrente null se io lancia). Aggiorna `registrations-api.test.ts` per i nuovi metodi (verbo/path/Bearer sessione). Run: `npx vitest run src/services/auth.test.ts src/services/registrations-api.test.ts src/services/orgSync.test.ts` → PASS; `npx tsc -b` → 0.

- [ ] **Step 6: Commit** — `git add src/services && git commit -m "feat(app): sessione + servizio auth + client API (org via sessione)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 8: UI login/registrazione + Impostazioni + URL cablato

**Files:** Create `src/screens/AuthScreen.tsx` (+ test); Modify `src/screens/SettingsScreen.tsx`, `src/app/App.tsx` (rotta), e crea `.env.production`.

- [ ] **Step 1: `.env.production`** (root) → `VITE_API_BASE_URL=https://torneigen-api.nicola-hdr.workers.dev`.

- [ ] **Step 2: `AuthScreen`** (`/accesso`) — form con due modalità (Accedi / Registrati): email, password, e in registrazione anche «Organizzazione (società)». Chiama `accedi`/`registra` da `services/auth`. Messaggi: login riuscito → naviga a `/`; registrazione → «Account creato: in attesa di abilitazione» (se `inAttesa`); errori (`401 credenziali`, `403 in_attesa`, `409 email registrata`) mostrati. Test: rende i campi; submit chiama i servizi (mock `services/auth`).

- [ ] **Step 3: `SettingsScreen`** — sostituisci il campo «Token di scrittura» con lo **stato sessione**: se loggato mostra «Accesso come <email> (<ruolo>)» + pulsante **Esci** (`esci()` + refresh stato); se non loggato, link/pulsante «Accedi o registrati» → `/accesso`. Usa `utenteCorrente()` al mount. Mantieni URL API + token di lettura. Aggiorna il test del write token (rimosso) → test dello stato sessione.

- [ ] **Step 4: Rotta** — in `src/app/App.tsx` aggiungi `<Route path="accesso" element={<AuthScreen />} />` dentro l'`AppShell`.

- [ ] **Step 5: Verifica** — `npx vitest run src/screens/AuthScreen.test.tsx src/screens/SettingsScreen.test.tsx` → PASS; `npx tsc -b` → 0; `npm run build` → OK.

- [ ] **Step 6: Commit** — `git add -A src .env.production && git commit -m "feat(app): schermata Accedi/Registrati + stato sessione in Impostazioni + URL cablato\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 9: UI pannello admin (`/admin`)

**Files:** Create `src/screens/AdminScreen.tsx` (+ test); Modify `src/app/App.tsx` (rotta), e un ingresso visibile solo all'admin (es. in AppShell nav o in Impostazioni).

- [ ] **Step 1: `AdminScreen`** (`/admin`) — al mount verifica `utenteCorrente()`; se non admin → messaggio «Accesso riservato» / redirect. Mostra:
  - elenco **utenti** (`elencoUtenti()`): email, ruolo, stato (in attesa/attivo), società; per gli utenti in attesa un pulsante **Abilita** che apre la scelta società (select da `elencoSocieta()` o campo «nuova società» → `creaSocieta()` poi `abilitaUtente(id, societaId)`), quindi ricarica l'elenco.
  - elenco/creazione **società**.
- [ ] **Step 2: Ingresso** — mostra il link «Admin» (rotta `/admin`) solo se `utenteCorrente()?.ruolo === 'admin'` (in `AppShell` o Impostazioni).
- [ ] **Step 3: Rotta** — `<Route path="admin" element={<AdminScreen />} />` in `App.tsx`.
- [ ] **Step 4: Test** — con `services/auth`/client mockati: rende l'elenco utenti; il click su «Abilita» con una società scelta chiama `abilitaUtente`. Verifica il gate non-admin.
- [ ] **Step 5: Verifica** — `npx vitest run src/screens/AdminScreen.test.tsx` → PASS; `npx tsc -b` → 0; `npm run build` → OK.
- [ ] **Step 6: Commit** — `git add -A src && git commit -m "feat(app): pannello admin abilitazione utenti + società\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

## Verifica finale + setup

- [ ] `npm test -- worker/` (worker) + run mirati app + `npx tsc -b` + `npm run build` → tutti verdi.
- [ ] Whole-branch review (opus) prima del merge.
- [ ] **Setup una tantum (utente, dopo il merge):** `cd worker && npx wrangler d1 execute torneigen-org --file=schema.sql --remote` · `npx wrangler secret put AUTH_SECRET` · verificare `ADMIN_EMAIL` in `wrangler.toml` · `npx wrangler deploy`. Poi registrarsi con la ADMIN_EMAIL (diventa admin abilitato), e abilitare gli altri dal pannello.

## Note di scope

- Fuori Fase 1: lista "i miei tornei"/navigazione admin di tutti i tornei (Fase 2), condivisione tra società (Fase 3), reset password via email, rate limiting, sync punteggi.
