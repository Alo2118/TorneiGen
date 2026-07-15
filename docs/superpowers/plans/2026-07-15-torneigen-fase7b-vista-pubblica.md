# TorneiGen Fase 7b — Vista pubblica del torneo (link per i giocatori) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pubblicare uno snapshot in sola lettura del torneo (gironi + tabellone + calendario) su Cloudflare KV e mostrarlo ai giocatori via link pubblico `/pubblico/:codice`, con pubblicazione opt-in e auto-update a ogni risultato.

**Architecture:** Il Cloudflare Worker guadagna una coppia di endpoint `pubblico` (scrivi autenticato / leggi pubblico / cancella). L'app costruisce lo snapshot dall'IndexedDB (senza dati personali), lo pubblica quando l'organizzatore preme "Pubblica", e lo ri-pubblica best-effort dopo ogni mutazione se il torneo è `pubblicato`. Una rotta pubblica della PWA legge lo snapshot e lo rende con i componenti già esistenti (`BracketTree variant="statico"`, `GironeStandings`) più un calendario read-only.

**Tech Stack:** Vite + React 18/19 + TypeScript strict, Vitest + @testing-library/react, Cloudflare Worker + KV (handler puro `handle(req, env)` + `fakeKV` per i test), `qrcode` (nuova dip).

## Global Constraints

- TypeScript **strict**: nessun `any`, nessun errore `tsc --noEmit`.
- **Solo design token** in `src/styles/tokens.css` (`--paper --surface --ink --muted --line --sea --sand --win --danger --radius --space --font-*`); nessun colore hardcoded nuovo.
- Copy in **italiano**.
- **Zero dati personali** nello snapshot: le squadre sono ridotte a `{id, nome}` (niente `players`/email/telefono). Le partite non contengono dati personali.
- **Pubblicazione best-effort**: `pubblicaSeAttivo` non deve MAI lanciare né bloccare il salvataggio locale (guardie: `pubblicato` + online + token; try/catch attorno alla rete).
- **Verifica su WSL**: la suite vitest completa è inaffidabile (timeout worker). Verificare con run mirati (`npm test -- <file>`), `npx tsc --noEmit`, `npx vite build`. Il Worker si testa con `npm test -- worker/src/handler.test.ts`.
- Il `codice` pubblico è `Tournament.codiceIscrizione` (stesso delle iscrizioni). L'auth del Worker è `Bearer <READ_TOKEN>` (stesso token già usato per leggere le iscrizioni).
- Il link pubblico punta all'origine della PWA (`window.location.origin`), non al Worker.

---

## File Structure

- **Create** `src/types/public.ts` — tipo `PublicSnapshot` condiviso app+Worker.
- **Modify** `worker/src/handler.ts` — endpoint `POST/GET/DELETE /api/pubblico/:codice`.
- **Modify** `worker/src/handler.test.ts` — test dei nuovi endpoint.
- **Create** `src/services/pubblicazione.ts` — `buildSnapshot`/`pubblica`/`interrompiPubblicazione`/`pubblicaSeAttivo`.
- **Create** `src/services/pubblicazione.test.ts`.
- **Modify** `src/services/registrations-api.ts` — client `pubblicaSnapshot`/`getSnapshot`/`rimuoviSnapshot`.
- **Modify** `src/engine/types.ts` — `Tournament.pubblicato?: boolean`.
- **Modify** `src/services/saveResult.ts`, `src/services/faseFinale.ts`, `src/services/calendario.ts`, `src/screens/BracketScreen.tsx` — hook `pubblicaSeAttivo` nei punti di mutazione.
- **Create** `src/components/PublicCalendar.tsx` (+ test) — calendario read-only.
- **Create** `src/screens/PublicViewScreen.tsx` (+ test) — vista pubblica.
- **Modify** `src/app/App.tsx` — rotta `/pubblico/:codice` fuori da AppShell.
- **Create** `src/components/QRCode.tsx` (+ test) — QR del link.
- **Create** `src/components/SharePanel.tsx` (+ test) — pannello condivisione.
- **Modify** `src/screens/RiepilogoScreen.tsx` — inserisce `<SharePanel>`.
- **Modify** `src/styles/tokens.css` — CSS dei nuovi componenti (in coda, solo token).
- **Modify** `package.json` — dip `qrcode` + `@types/qrcode`.

---

## Task 1: Worker — endpoint `pubblico` + tipo `PublicSnapshot`

**Files:**
- Create: `src/types/public.ts`
- Modify: `worker/src/handler.ts`
- Test: `worker/src/handler.test.ts`

**Interfaces:**
- Produces:
  - `PublicSnapshot` (vedi sotto).
  - Worker: `POST /api/pubblico/:codice` (auth → `pubblico:${codice}`), `GET /api/pubblico/:codice` (pubblico), `DELETE /api/pubblico/:codice` (auth).

- [ ] **Step 1: Crea il tipo `PublicSnapshot`**

```ts
// src/types/public.ts
import type { Match, RegolePunteggio, Tipologia } from '../engine/types'

export interface PublicTeam {
  id: string
  nome: string
}
export interface PublicGroup {
  id: string
  nome: string
  teamIds: string[]
}
export interface PublicSnapshot {
  codice: string
  nome: string
  tipologia: Tipologia
  formato: string | null
  faseFinale?: 'diretta' | 'doppia'
  qualificatiPerGirone?: number | 'tutti'
  regolePunteggio: RegolePunteggio
  updatedAt: string
  teams: PublicTeam[]
  groups: PublicGroup[]
  matches: Match[]
  giornate?: { data: string; inizio: string; fine: string }[]
  numeroCampi?: number
  durataPartitaMin?: number
}
```

- [ ] **Step 2: Scrivi i test del Worker (falliscono)**

Aggiungi in fondo al `describe('handle', ...)` di `worker/src/handler.test.ts`:

```ts
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
```

- [ ] **Step 3: Esegui i test (devono fallire)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: FAIL — i nuovi test su `/api/pubblico/...` ricevono 404 (endpoint non gestito) invece di 401/200/400.

- [ ] **Step 4: Implementa gli endpoint nel Worker**

In `worker/src/handler.ts`: aggiungi in cima l'import del tipo, e i tre blocchi PRIMA del `return json({ error: 'not found' }, 404)` finale.

```ts
// in cima, accanto agli altri import di tipo:
import type { PublicSnapshot } from '../../src/types/public'
```

```ts
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
```

- [ ] **Step 5: Esegui i test (devono passare)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: PASS (tutti, inclusi i preesistenti).

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add src/types/public.ts worker/src/handler.ts worker/src/handler.test.ts
git commit -m "feat(worker): endpoint /api/pubblico/:codice + tipo PublicSnapshot"
```

---

## Task 2: Servizio di pubblicazione + client API + flag + hook

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/services/registrations-api.ts`
- Create: `src/services/pubblicazione.ts`
- Test: `src/services/pubblicazione.test.ts`
- Modify: `src/services/saveResult.ts`, `src/services/faseFinale.ts`, `src/services/calendario.ts`, `src/screens/BracketScreen.tsx`

**Interfaces:**
- Consumes: `PublicSnapshot` (Task 1); `getTournament/teamsOf/groupsOf/matchesOf/saveTournament` da `../db/repositories`; `getClient/getReadToken` da `./config`.
- Produces:
  - `buildSnapshot(tournamentId: string): Promise<PublicSnapshot>`
  - `pubblica(tournamentId: string): Promise<void>`
  - `interrompiPubblicazione(tournamentId: string): Promise<void>`
  - `pubblicaSeAttivo(tournamentId: string): Promise<void>` (best-effort, no-throw)
  - client: `pubblicaSnapshot(snap)`, `getSnapshot(codice)`, `rimuoviSnapshot(codice)`
  - `Tournament.pubblicato?: boolean`

- [ ] **Step 1: Aggiungi il flag al tipo `Tournament`**

In `src/engine/types.ts`, dentro `interface Tournament`, dopo `qualificatiPerGirone?: number | 'tutti'`:

```ts
  pubblicato?: boolean
```

- [ ] **Step 2: Aggiungi i metodi client**

In `src/services/registrations-api.ts`:
- aggiungi l'import del tipo in cima:
```ts
import type { PublicSnapshot } from '../types/public'
```
- aggiungi alla `interface RegistrationsClient`:
```ts
  pubblicaSnapshot(snap: PublicSnapshot): Promise<void>
  getSnapshot(codice: string): Promise<PublicSnapshot>
  rimuoviSnapshot(codice: string): Promise<void>
```
- aggiungi nell'oggetto ritornato da `creaClient` (dopo `eliminaIscrizione`):
```ts
    async pubblicaSnapshot(snap) {
      await call('POST', `/api/pubblico/${snap.codice}`, { body: snap, auth: true })
    },
    getSnapshot: (codice) => call('GET', `/api/pubblico/${codice}`) as Promise<PublicSnapshot>,
    async rimuoviSnapshot(codice) {
      await call('DELETE', `/api/pubblico/${codice}`, { auth: true })
    },
```

- [ ] **Step 3: Scrivi i test del servizio (falliscono)**

```ts
// src/services/pubblicazione.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { buildSnapshot, pubblicaSeAttivo } from './pubblicazione'
import type { Tournament, Team, Group, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
    players: [{ nome: 'Mario', cognome: 'Rossi', email: 'mario@x.it', telefono: '3330000000' }] }
}
const group: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['a', 'b'] }
const match: Match = { id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }

describe('buildSnapshot', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(torneo)
    await db.teams.bulkPut([team('a'), team('b')])
    await db.groups.put(group)
    await db.matches.put(match)
  })

  it('usa il codice iscrizione come codice pubblico', async () => {
    const s = await buildSnapshot('t1')
    expect(s.codice).toBe('ABC123')
  })

  it('riduce le squadre a id+nome SENZA dati personali', async () => {
    const s = await buildSnapshot('t1')
    expect(s.teams).toEqual([
      { id: 'a', nome: 'Team a' },
      { id: 'b', nome: 'Team b' },
    ])
    // nessun campo players/email/telefono nello snapshot serializzato
    expect(JSON.stringify(s)).not.toContain('mario@x.it')
    expect(JSON.stringify(s)).not.toContain('players')
  })

  it('include gironi, partite, regole e updatedAt', async () => {
    const s = await buildSnapshot('t1')
    expect(s.groups).toHaveLength(1)
    expect(s.matches).toHaveLength(1)
    expect(s.regolePunteggio.puntiSet).toBe(21)
    expect(s.updatedAt).not.toBe('')
  })
})

describe('pubblicaSeAttivo (guardie)', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })
  it('non fa nulla (e non lancia) se il torneo non è pubblicato', async () => {
    await saveTournament({ ...torneo, pubblicato: false })
    await expect(pubblicaSeAttivo('t1')).resolves.toBeUndefined()
  })
  it('non lancia se il torneo non esiste', async () => {
    await expect(pubblicaSeAttivo('inesistente')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Esegui i test (devono fallire)**

Run: `npm test -- src/services/pubblicazione.test.ts`
Expected: FAIL — "Failed to resolve import './pubblicazione'".

- [ ] **Step 5: Implementa il servizio**

```ts
// src/services/pubblicazione.ts
import { getTournament, teamsOf, groupsOf, matchesOf, saveTournament } from '../db/repositories'
import { getClient, getReadToken } from './config'
import type { PublicSnapshot } from '../types/public'

export async function buildSnapshot(tournamentId: string): Promise<PublicSnapshot> {
  const [t, teams, groups, matches] = await Promise.all([
    getTournament(tournamentId),
    teamsOf(tournamentId),
    groupsOf(tournamentId),
    matchesOf(tournamentId),
  ])
  if (!t) throw new Error('Torneo non trovato')
  return {
    codice: t.codiceIscrizione,
    nome: t.nome,
    tipologia: t.tipologia,
    formato: t.formato,
    faseFinale: t.faseFinale,
    qualificatiPerGirone: t.qualificatiPerGirone,
    regolePunteggio: t.regolePunteggio,
    updatedAt: new Date().toISOString(),
    teams: teams.map((x) => ({ id: x.id, nome: x.nome })),
    groups: groups.map((g) => ({ id: g.id, nome: g.nome, teamIds: g.teamIds })),
    matches,
    giornate: t.giornate,
    numeroCampi: t.numeroCampi,
    durataPartitaMin: t.durataPartitaMin,
  }
}

export async function pubblica(tournamentId: string): Promise<void> {
  const snap = await buildSnapshot(tournamentId)
  await getClient().pubblicaSnapshot(snap)
  const t = await getTournament(tournamentId)
  if (t) await saveTournament({ ...t, pubblicato: true })
}

export async function interrompiPubblicazione(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (!t) return
  try {
    await getClient().rimuoviSnapshot(t.codiceIscrizione)
  } catch {
    // best-effort: rimuoviamo comunque il flag locale
  }
  await saveTournament({ ...t, pubblicato: false })
}

export async function pubblicaSeAttivo(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (!t?.pubblicato) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (!getReadToken()) return
  try {
    const snap = await buildSnapshot(tournamentId)
    await getClient().pubblicaSnapshot(snap)
  } catch {
    // best-effort: si aggiorna al prossimo salvataggio riuscito
  }
}
```

- [ ] **Step 6: Esegui i test (devono passare)**

Run: `npm test -- src/services/pubblicazione.test.ts`
Expected: PASS.

- [ ] **Step 7: Aggancia `pubblicaSeAttivo` ai punti di mutazione**

In `src/services/saveResult.ts`, aggiungi l'import e la chiamata best-effort in fondo a `salvaEProppaga`:
```ts
import { pubblicaSeAttivo } from './pubblicazione'
```
Dopo `await db.matches.bulkPut(finali)`:
```ts
  void pubblicaSeAttivo(tournamentId)
```

In `src/services/faseFinale.ts`, in fondo a `generaFaseFinale`, prima di `return tabellone.length`:
```ts
  void pubblicaSeAttivo(tournamentId)
```
(aggiungi l'import `import { pubblicaSeAttivo } from './pubblicazione'` in cima.)

In `src/services/calendario.ts`, in fondo a `programmaCalendario`, prima del `return`:
```ts
  void pubblicaSeAttivo(tournamentId)
```
(aggiungi l'import in cima.)

In `src/screens/BracketScreen.tsx`, dentro `handleGenera`, subito dopo `await saveTournament({ ...torneo, stato: 'in_corso' })`:
```ts
      void pubblicaSeAttivo(torneo.id)
```
(aggiungi l'import `import { pubblicaSeAttivo } from '../services/pubblicazione'` in cima.)

- [ ] **Step 8: Verifica che i test esistenti restino verdi**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npm test -- src/services/saveResult.test.ts src/services/faseFinale.test.ts src/services/calendario.test.ts src/screens/BracketScreen.test.tsx`
Expected: PASS. (`pubblicaSeAttivo` è no-op senza `pubblicato`, quindi nessuna chiamata di rete nei test.)

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/services/registrations-api.ts src/services/pubblicazione.ts src/services/pubblicazione.test.ts src/services/saveResult.ts src/services/faseFinale.ts src/services/calendario.ts src/screens/BracketScreen.tsx
git commit -m "feat(services): pubblicazione snapshot (opt-in + auto-update best-effort)"
```

---

## Task 3: Vista pubblica — `PublicViewScreen` + rotta + `PublicCalendar`

**Files:**
- Create: `src/components/PublicCalendar.tsx`
- Test: `src/components/PublicCalendar.test.tsx`
- Create: `src/screens/PublicViewScreen.tsx`
- Test: `src/screens/PublicViewScreen.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: `getClient().getSnapshot(codice)`; `PublicSnapshot`; `GironeStandings`, `BracketTree`, `PublicCalendar`.
- Produces: `PublicCalendar({ matches, teamNames })`; rotta `/pubblico/:codice`.

- [ ] **Step 1: Scrivi il test di `PublicCalendar` (fallisce)**

```tsx
// src/components/PublicCalendar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicCalendar } from './PublicCalendar'
import type { Match } from '../engine/types'

function m(id: string, orario: string | undefined, campo: string | undefined, a: string, b: string): Match {
  return { id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata', orario, campo }
}
const names = { a: 'Rossi', b: 'Bianchi', c: 'Verdi', d: 'Neri' }

describe('PublicCalendar', () => {
  it('mostra le partite programmate raggruppate per data con orario e campo', () => {
    const matches = [
      m('1', '2026-07-20T09:00', '1', 'a', 'b'),
      m('2', '2026-07-20T10:00', '2', 'c', 'd'),
    ]
    render(<PublicCalendar matches={matches} teamNames={names} />)
    expect(screen.getByText('2026-07-20')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText(/Campo 1/)).toBeTruthy()
  })
  it('non renderizza nulla se nessuna partita è programmata', () => {
    const { container } = render(<PublicCalendar matches={[m('1', undefined, undefined, 'a', 'b')]} teamNames={names} />)
    expect(container.querySelector('.public-calendar')).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `npm test -- src/components/PublicCalendar.test.tsx`
Expected: FAIL — "Failed to resolve import './PublicCalendar'".

- [ ] **Step 3: Implementa `PublicCalendar`**

```tsx
// src/components/PublicCalendar.tsx
import type { Match } from '../engine/types'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}

export function PublicCalendar({ matches, teamNames }: Props) {
  const programmate = matches
    .filter((m) => m.orario)
    .sort((a, b) => (a.orario! < b.orario! ? -1 : a.orario! > b.orario! ? 1 : 0))
  if (programmate.length === 0) return null

  const perData = new Map<string, Match[]>()
  for (const m of programmate) {
    const data = m.orario!.slice(0, 10)
    const lista = perData.get(data) ?? []
    lista.push(m)
    perData.set(data, lista)
  }

  return (
    <section className="public-calendar">
      <h2>Calendario</h2>
      {[...perData.entries()].map(([data, ms]) => (
        <div key={data} className="public-calendar-day">
          <h3>{data}</h3>
          <ul className="public-calendar-list">
            {ms.map((m) => (
              <li key={m.id} className="public-calendar-row">
                <span className="public-calendar-time tnum">{m.orario!.slice(11, 16)}</span>
                {m.campo && <span className="public-calendar-court">Campo {m.campo}</span>}
                <span className="public-calendar-teams">
                  {nome(m.teamAId, teamNames)} — {nome(m.teamBId, teamNames)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `npm test -- src/components/PublicCalendar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Scrivi il test di `PublicViewScreen` (fallisce)**

```tsx
// src/screens/PublicViewScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { PublicSnapshot } from '../types/public'

const snap: PublicSnapshot = {
  codice: 'ABC123', nome: 'Beach Cup', tipologia: '2x2', formato: 'gironi_eliminazione',
  qualificatiPerGirone: 'tutti', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  updatedAt: '2026-07-20T12:00:00.000Z',
  teams: [{ id: 'a', nome: 'Rossi' }, { id: 'b', nome: 'Bianchi' }],
  groups: [{ id: 'g1', nome: 'Girone A', teamIds: ['a', 'b'] }],
  matches: [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }],
}

const getSnapshot = vi.fn()
vi.mock('../services/config', () => ({
  getClient: () => ({ getSnapshot }),
}))

import { PublicViewScreen } from './PublicViewScreen'

describe('PublicViewScreen', () => {
  beforeEach(() => { getSnapshot.mockReset() })

  it('mostra nome torneo, gironi e tabellone dallo snapshot', async () => {
    getSnapshot.mockResolvedValue(snap)
    render(
      <MemoryRouter initialEntries={['/pubblico/ABC123']}>
        <Routes><Route path="/pubblico/:codice" element={<PublicViewScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Beach Cup')).toBeTruthy()
    expect(await screen.findByText('Girone A')).toBeTruthy()
    // i nomi squadra compaiono nella classifica
    expect((await screen.findAllByText('Rossi')).length).toBeGreaterThan(0)
  })

  it('mostra un messaggio se il torneo non è pubblicato', async () => {
    getSnapshot.mockRejectedValue(new Error('torneo non trovato'))
    render(
      <MemoryRouter initialEntries={['/pubblico/NOPE']}>
        <Routes><Route path="/pubblico/:codice" element={<PublicViewScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/non trovato|non ancora pubblicato/i)).toBeTruthy()
  })
})
```

- [ ] **Step 6: Esegui il test (deve fallire)**

Run: `npm test -- src/screens/PublicViewScreen.test.tsx`
Expected: FAIL — "Failed to resolve import './PublicViewScreen'".

- [ ] **Step 7: Implementa `PublicViewScreen`**

```tsx
// src/screens/PublicViewScreen.tsx
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getClient } from '../services/config'
import { GironeStandings } from '../components/GironeStandings'
import { BracketTree } from '../components/BracketTree'
import { PublicCalendar } from '../components/PublicCalendar'
import { Button } from '../components/Button'
import type { PublicSnapshot } from '../types/public'
import type { Group } from '../engine/types'

function oraLocale(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function PublicViewScreen() {
  const { codice } = useParams()
  const [snap, setSnap] = useState<PublicSnapshot | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    if (!codice) return
    try {
      const s = await getClient().getSnapshot(codice)
      setSnap(s)
      setErrore(null)
    } catch {
      setErrore('Torneo non trovato o non ancora pubblicato.')
    } finally {
      setCaricando(false)
    }
  }, [codice])

  useEffect(() => {
    carica()
    const onFocus = () => carica()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(carica, 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [carica])

  if (caricando && !snap) return <section className="public-view"><p className="muted">Caricamento…</p></section>
  if (errore && !snap) return <section className="public-view"><p className="empty">{errore}</p></section>
  if (!snap) return null

  const teamNames: Record<string, string> = Object.fromEntries(snap.teams.map((t) => [t.id, t.nome]))
  const qualificati = snap.qualificatiPerGirone ?? 'tutti'
  const matchTabellone = snap.matches.filter((m) => m.fase === 'tabellone')

  return (
    <section className="public-view">
      <header className="public-view-head">
        <h1>{snap.nome}</h1>
        <div className="public-view-meta">
          <span className="muted">Aggiornato alle {oraLocale(snap.updatedAt)}</span>
          <Button type="button" variant="ghost" onClick={carica}>Aggiorna</Button>
        </div>
      </header>

      {snap.groups.length > 0 && (
        <div className="standings-groups">
          {snap.groups.map((g) => {
            const group: Group = { id: g.id, nome: g.nome, tournamentId: snap.codice, teamIds: g.teamIds }
            return (
              <GironeStandings
                key={g.id}
                group={group}
                matches={snap.matches}
                regole={snap.regolePunteggio}
                teamNames={teamNames}
                qualificati={qualificati}
              />
            )
          })}
        </div>
      )}

      {matchTabellone.length > 0 && (
        <section className="standings-bracket">
          <h2>Tabellone</h2>
          <BracketTree matches={matchTabellone} teamNames={teamNames} variant="statico" />
        </section>
      )}

      <PublicCalendar matches={snap.matches} teamNames={teamNames} />
    </section>
  )
}
```

- [ ] **Step 8: Aggiungi la rotta pubblica**

In `src/app/App.tsx`, aggiungi l'import in cima (stesso stile degli altri screen: `RegistrationScreen` è importata da `../screens/RegistrationScreen`):
```tsx
import { PublicViewScreen } from '../screens/PublicViewScreen'
```
E la rotta accanto a `<Route path="/iscrizione/:codice" element={<RegistrationScreen />} />` (fuori da `AppShell`):
```tsx
      <Route path="/pubblico/:codice" element={<PublicViewScreen />} />
```

- [ ] **Step 9: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Fase 7b: vista pubblica --- */
.public-view { display: flex; flex-direction: column; gap: calc(var(--space) * 3); padding: calc(var(--space) * 2); max-width: 960px; margin: 0 auto; }
.public-view-head { display: flex; flex-direction: column; gap: var(--space); }
.public-view-meta { display: flex; align-items: center; gap: var(--space); }
.public-calendar { display: flex; flex-direction: column; gap: var(--space); }
.public-calendar-day { display: flex; flex-direction: column; gap: calc(var(--space) / 2); }
.public-calendar-day h3 { margin: 0; font-size: .85rem; color: var(--muted); }
.public-calendar-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--space) / 2); }
.public-calendar-row { display: flex; align-items: center; gap: var(--space); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space); }
.public-calendar-court { color: var(--muted); font-size: .85rem; }
```

- [ ] **Step 10: Esegui i test (devono passare) + typecheck**

Run: `npm test -- src/screens/PublicViewScreen.test.tsx src/components/PublicCalendar.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 11: Commit**

```bash
git add src/components/PublicCalendar.tsx src/components/PublicCalendar.test.tsx src/screens/PublicViewScreen.tsx src/screens/PublicViewScreen.test.tsx src/app/App.tsx src/styles/tokens.css
git commit -m "feat(ui): vista pubblica /pubblico/:codice (gironi + tabellone + calendario)"
```

---

## Task 4: Condivisione — `QRCode` + `SharePanel` nel Riepilogo

**Files:**
- Modify: `package.json` (dip `qrcode`, `@types/qrcode`)
- Create: `src/components/QRCode.tsx`
- Test: `src/components/QRCode.test.tsx`
- Create: `src/components/SharePanel.tsx`
- Test: `src/components/SharePanel.test.tsx`
- Modify: `src/screens/RiepilogoScreen.tsx`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: `pubblica`, `interrompiPubblicazione` da `../services/pubblicazione`; `getReadToken` da `../services/config`.
- Produces: `QRCode({ value, size? })`; `SharePanel({ tournament })`.

- [ ] **Step 1: Installa la dipendenza `qrcode`**

Run:
```bash
npm install qrcode && npm install -D @types/qrcode
```
Expected: `package.json` e `package-lock.json` aggiornati, nessun errore.

- [ ] **Step 2: Scrivi il test di `QRCode` (fallisce)**

```tsx
// src/components/QRCode.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') },
}))

import { QRCode } from './QRCode'

describe('QRCode', () => {
  it('rende un\'immagine col data URL generato', async () => {
    render(<QRCode value="https://x/pubblico/ABC" />)
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
    expect(screen.getByRole('img').getAttribute('src')).toContain('data:image/png')
  })
})
```

- [ ] **Step 3: Esegui il test (deve fallire)**

Run: `npm test -- src/components/QRCode.test.tsx`
Expected: FAIL — "Failed to resolve import './QRCode'".

- [ ] **Step 4: Implementa `QRCode`**

```tsx
// src/components/QRCode.tsx
import { useEffect, useState } from 'react'
import QRCodeLib from 'qrcode'

interface Props {
  value: string
  size?: number
}

export function QRCode({ value, size = 160 }: Props) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let attivo = true
    QRCodeLib.toDataURL(value, { width: size, margin: 1 })
      .then((d) => { if (attivo) setSrc(d) })
      .catch(() => { if (attivo) setSrc('') })
    return () => { attivo = false }
  }, [value, size])
  if (!src) return null
  return <img className="qr-code" src={src} width={size} height={size} alt="Codice QR del link pubblico" />
}
```

- [ ] **Step 5: Esegui il test (deve passare)**

Run: `npm test -- src/components/QRCode.test.tsx`
Expected: PASS.

- [ ] **Step 6: Scrivi il test di `SharePanel` (fallisce)**

```tsx
// src/components/SharePanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Tournament } from '../engine/types'

const pubblica = vi.fn()
const interrompiPubblicazione = vi.fn()
vi.mock('../services/pubblicazione', () => ({
  pubblica: (...a: unknown[]) => pubblica(...a),
  interrompiPubblicazione: (...a: unknown[]) => interrompiPubblicazione(...a),
}))
vi.mock('../services/config', () => ({ getReadToken: () => 'token' }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }))

import { SharePanel } from './SharePanel'

const base: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('SharePanel', () => {
  beforeEach(() => { pubblica.mockReset(); interrompiPubblicazione.mockReset() })

  it('con torneo non pubblicato mostra il bottone Pubblica', () => {
    render(<SharePanel tournament={base} />)
    expect(screen.getByRole('button', { name: /pubblica/i })).toBeTruthy()
  })

  it('al click su Pubblica chiama il servizio', async () => {
    pubblica.mockResolvedValue(undefined)
    render(<SharePanel tournament={base} />)
    await userEvent.click(screen.getByRole('button', { name: /pubblica/i }))
    await waitFor(() => expect(pubblica).toHaveBeenCalledWith('t1'))
  })

  it('con torneo pubblicato mostra il link pubblico e il QR', async () => {
    render(<SharePanel tournament={{ ...base, pubblicato: true }} />)
    expect(screen.getByText(/\/pubblico\/ABC123/)).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
  })
})
```

- [ ] **Step 7: Esegui il test (deve fallire)**

Run: `npm test -- src/components/SharePanel.test.tsx`
Expected: FAIL — "Failed to resolve import './SharePanel'".

- [ ] **Step 8: Implementa `SharePanel`**

```tsx
// src/components/SharePanel.tsx
import { useState } from 'react'
import { pubblica, interrompiPubblicazione } from '../services/pubblicazione'
import { getReadToken } from '../services/config'
import { QRCode } from './QRCode'
import { Button } from './Button'
import { useToast } from './Toast'
import type { Tournament } from '../engine/types'

interface Props {
  tournament: Tournament
}

export function SharePanel({ tournament }: Props) {
  const toast = useToast()
  const [inCorso, setInCorso] = useState(false)
  const link = `${window.location.origin}/pubblico/${tournament.codiceIscrizione}`

  async function handlePubblica() {
    if (!getReadToken()) {
      toast('Imposta prima il token in Impostazioni per pubblicare', 'errore')
      return
    }
    setInCorso(true)
    try {
      await pubblica(tournament.id)
      toast('Torneo pubblicato')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Errore durante la pubblicazione', 'errore')
    } finally {
      setInCorso(false)
    }
  }

  async function handleInterrompi() {
    setInCorso(true)
    try {
      await interrompiPubblicazione(tournament.id)
      toast('Pubblicazione interrotta')
    } finally {
      setInCorso(false)
    }
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copiato')
    } catch {
      toast('Impossibile copiare il link', 'errore')
    }
  }

  async function condividi() {
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.nome, url: link })
      } catch {
        // condivisione annullata: nessun errore da mostrare
      }
    } else {
      await copiaLink()
    }
  }

  if (!tournament.pubblicato) {
    return (
      <section className="share-panel">
        <h2>Condivisione pubblica</h2>
        <p className="muted">Pubblica il tabellone in sola lettura: i giocatori lo vedranno sul telefono col link. Si aggiorna da solo a ogni risultato.</p>
        <Button type="button" onClick={handlePubblica} disabled={inCorso}>Pubblica</Button>
      </section>
    )
  }

  return (
    <section className="share-panel">
      <h2>Condivisione pubblica</h2>
      <p className="muted">Pubblicazione automatica attiva. Condividi questo link con i giocatori:</p>
      <p className="share-link">{link}</p>
      <div className="share-actions">
        <Button type="button" variant="ghost" onClick={copiaLink}>Copia link</Button>
        <Button type="button" variant="ghost" onClick={condividi}>Condividi</Button>
        <Button type="button" variant="ghost" onClick={handleInterrompi} disabled={inCorso}>Interrompi pubblicazione</Button>
      </div>
      <QRCode value={link} />
    </section>
  )
}
```

- [ ] **Step 9: Esegui il test (deve passare)**

Run: `npm test -- src/components/SharePanel.test.tsx`
Expected: PASS.

- [ ] **Step 10: Inserisci `SharePanel` nel Riepilogo**

In `src/screens/RiepilogoScreen.tsx`:
- aggiungi l'import in cima:
```tsx
import { SharePanel } from '../components/SharePanel'
```
- la variabile del torneo nello screen è `torneo` (garantita non-null: lo screen fa `if (!id || !torneo) return null` prima del `return`). Inserisci nel JSX del `return` principale, dopo la sezione del prossimo passo (il blocco con `<Link to={passo.rotta}>`):
```tsx
        <SharePanel tournament={torneo} />
```
Non modificare altra logica del Riepilogo.

- [ ] **Step 11: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Fase 7b: condivisione --- */
.share-panel { display: flex; flex-direction: column; gap: var(--space); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: calc(var(--space) * 2); }
.share-panel h2 { margin: 0; font-size: 1.1rem; }
.share-link { font-family: var(--font-body); word-break: break-all; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space); margin: 0; }
.share-actions { display: flex; flex-wrap: wrap; gap: var(--space); }
.qr-code { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
```

- [ ] **Step 12: Typecheck + test dello screen Riepilogo**

Run: `npx tsc --noEmit`
Expected: nessun errore.
Run: `npm test -- src/screens/RiepilogoScreen.test.tsx`
Expected: PASS. Se un test esistente si rompe perché ora compare il pannello, aggiorna l'asserzione in modo minimo senza indebolirla; mostra la modifica nel report.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json src/components/QRCode.tsx src/components/QRCode.test.tsx src/components/SharePanel.tsx src/components/SharePanel.test.tsx src/screens/RiepilogoScreen.tsx src/styles/tokens.css
git commit -m "feat(ui): SharePanel + QR nel Riepilogo (pubblica/condividi/interrompi)"
```

---

## Task 5: Verifica finale (typecheck, build, deploy Worker, screenshot)

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati di tutti i file toccati**

Run: `npm test -- worker/src/handler.test.ts src/services/pubblicazione.test.ts src/components/PublicCalendar.test.tsx src/screens/PublicViewScreen.test.tsx src/components/QRCode.test.tsx src/components/SharePanel.test.tsx src/services/saveResult.test.ts src/services/faseFinale.test.ts src/services/calendario.test.ts src/screens/BracketScreen.test.tsx src/screens/RiepilogoScreen.test.tsx`
Expected: tutti verdi. (NON usare la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione**

Run: `VITE_API_BASE_URL="https://torneigen-api.nicola-hdr.workers.dev" npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: Deploy del Worker (nuovi endpoint) e verifica**

Il Worker va ridistribuito perché ha nuovi endpoint. Run:
```bash
cd worker && npx wrangler deploy 2>&1 | tail -5; cd ..
```
Poi verifica gli endpoint pubblici (senza token deve dare 401 su POST, 404 su GET inesistente):
```bash
curl -s -o /dev/null -w "POST no-auth: %{http_code}\n" -X POST https://torneigen-api.nicola-hdr.workers.dev/api/pubblico/TEST -H 'content-type: application/json' -d '{}'
curl -s -o /dev/null -w "GET inesistente: %{http_code}\n" https://torneigen-api.nicola-hdr.workers.dev/api/pubblico/NONESISTE
```
Expected: `POST no-auth: 401`, `GET inesistente: 404`.

- [ ] **Step 5: Verifica visiva (screenshot headless)**

Riusa il flusso collaudato (chromium snap via CDP + `vite preview`): inietta in IndexedDB un torneo demo (`carica-demo-torneo.js`), poi nell'app apri il Riepilogo, verifica che compaia il pannello "Condivisione pubblica"; e visita direttamente `/pubblico/SIMBV1` dopo aver pubblicato (o inietta uno snapshot noto tramite il mock/worker) per catturare la vista pubblica (gironi + tabellone + calendario). Salva le immagini in `screenshot-simulazione/`. Controlla a occhio: header con "aggiornato alle", classifiche con zona qualificazione, albero statico, calendario per giornata.

- [ ] **Step 6: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore(fase7b): verifica finale vista pubblica"
```

---

## Note di esecuzione

- **Ordine:** Task 1 → 2 → 3 → 4 → 5 (dipendenza lineare). Task 3 e 4 dipendono dai tipi/servizi dei Task 1–2 e dai componenti della Fase 7a (`BracketTree`, `GironeStandings`) già in `main`.
- **Modelli (subagent-driven):** Task 1–4 hanno codice completo → transcription (modello economico); i Task che toccano screen esistenti (3 Riepilogo/App, 4 Riepilogo) hanno un po' di integrazione (modello standard). Review per task + review whole-branch (opus) prima del merge.
- **Best-effort:** `pubblicaSeAttivo` è agganciato con `void ...` (fire-and-forget) e non deve mai propagare errori nei chiamanti.
- **Fuori scope (fase futura):** multi-organizzatore/co-editing bidirezionale; directory pubblica dei tornei; notifiche.

## Scostamenti consapevoli dalla spec (polish rimandato)

La spec (Sezione C) descriveva due dettagli di stato che il piano **rimanda** per YAGNI, non li omette per errore:
- Lo stato nel `SharePanel` mostra "Pubblicazione automatica attiva" **senza** l'orario dell'ultimo aggiornamento (`aggiornato alle HH:MM`): l'orario è comunque visibile sulla **pagina pubblica** (`updatedAt`). Tracciarlo anche lato organizzatore richiederebbe salvare un `lastPublishedAt` locale — rimandato.
- Nessun **indicatore esplicito di fallimento** dell'auto-update: `pubblicaSeAttivo` è fire-and-forget best-effort e si ricongiunge al prossimo salvataggio riuscito; sorfacciare i fallimenti richiederebbe uno stato condiviso — rimandato.

Se il reviewer li segnala, sono decisioni di scope note (non difetti): il valore centrale — pubblicazione, auto-update, vista pubblica, condivisione con QR — è tutto coperto.
