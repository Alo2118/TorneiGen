# Fase 8b — Sync dell'organizzazione (auto bidirezionale) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare contenuto al documento cloud dell'organizzazione (config + squadre + gironi + struttura tabellone, senza punteggi) e sincronizzarlo automaticamente in entrambe le direzioni tra locale e cloud, mantenendo i punteggi (lo svolgimento) locali.

**Architecture:** Un modulo puro (`orgDoc.ts`) costruisce/applica il documento con merge dei punteggi per `matchId`. Un servizio orchestratore (`orgSync.ts`) fa push (debounce) e pull (all'apertura) sopra il client della 8a, con guardia local-first e risoluzione conflitti esplicita. Un hook (`useOrgSync`) esegue il pull all'apertura del torneo e un banner mostra i conflitti. Le operazioni che modificano l'organizzazione chiamano `notificaModificaOrg`; i punteggi no.

**Tech Stack:** TypeScript strict, React 18 + react-router-dom, Dexie (IndexedDB), Vitest + @testing-library/react, il client `RegistrationsClient` della Fase 8a.

## Global Constraints

- TypeScript strict; nessun `any` non giustificato.
- Copy in italiano.
- **Local-first intatto:** tutta la sync è no-op se offline oppure senza token di scrittura. Le operazioni esistenti dell'app non devono cambiare comportamento quando la sync è spenta.
- Il documento è privato → sempre e solo tramite gli endpoint dietro `WRITE_TOKEN` della 8a (client `getOrg/putOrg/deleteOrg`).
- I **punteggi** (`set`, `vincitoreId`, `stato`) non entrano mai nel documento cloud.
- Verifica (vincolo ambiente WSL: full-suite Vitest è flaky): `npx tsc --noEmit` + run **mirati** Vitest sui file toccati + `npx vite build`. Mai `npm test` intero.
- Ogni commit termina con: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Tipi e modulo puro del documento (`orgDoc.ts`)

**Files:**
- Modify: `src/types/org.ts` (aggiunge `MatchStruct`, `OrgDoc`)
- Modify: `src/engine/types.ts` (aggiunge `orgVersion?`, `orgPending?` a `Tournament`)
- Create: `src/services/orgDoc.ts`
- Test: `src/services/orgDoc.test.ts`

**Interfaces:**
- Consumes: `Tournament, Team, Group, Match` da `../engine/types`; `db` da `../db/database`; `getTournament, teamsOf, groupsOf, matchesOf` da `../db/repositories`.
- Produces:
  - `type MatchStruct = Omit<Match, 'set' | 'vincitoreId' | 'stato'>`
  - `interface OrgDoc { tournament: Tournament; teams: Team[]; groups: Group[]; struttura: MatchStruct[] }`
  - `buildOrgDoc(tournamentId: string): Promise<OrgDoc>`
  - `interface StatoLocaleOrg { tournament: Tournament; teams: Team[]; groups: Group[]; matches: Match[] }`
  - `applyOrgDoc(doc: OrgDoc, localTournament: Tournament | undefined, localMatches: Match[]): StatoLocaleOrg`
  - `scriviOrgLocale(s: StatoLocaleOrg): Promise<void>`

- [ ] **Step 1: Estendi i tipi**

In `src/types/org.ts`, in fondo al file (lasciando `OrgRecord` invariato), aggiungi:

```ts
import type { Tournament, Team, Group, Match } from '../engine/types'

export type MatchStruct = Omit<Match, 'set' | 'vincitoreId' | 'stato'>

export interface OrgDoc {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  struttura: MatchStruct[]
}
```

In `src/engine/types.ts`, dentro `interface Tournament`, aggiungi in fondo (dopo `pubblicato?: boolean`):

```ts
  orgVersion?: number
  orgPending?: boolean
```

- [ ] **Step 2: Scrivi i test (falliscono)**

Create `src/services/orgDoc.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale } from './orgDoc'
import type { Tournament, Team, Group, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti', pubblicato: true, orgVersion: 3, orgPending: true,
}
const team = (id: string): Team => ({
  id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
  players: [{ nome: 'Mario', cognome: `C${id}`, email: 'm@x.it', telefono: '3330000000' }],
})
const group: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['a', 'b'] }
const match = (id: string, over: Partial<Match> = {}): Match => ({
  id, tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b',
  set: [], stato: 'programmata', ...over,
})

describe('buildOrgDoc', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(torneo)
    await db.teams.bulkPut([team('a'), team('b')])
    await db.groups.put(group)
    await db.matches.put(match('m1', { set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'a' }))
  })

  it('esclude i punteggi dalla struttura', async () => {
    const doc = await buildOrgDoc('t1')
    const s = doc.struttura[0]
    expect(s.id).toBe('m1')
    expect('set' in s).toBe(false)
    expect('vincitoreId' in s).toBe(false)
    expect('stato' in s).toBe(false)
    expect(JSON.stringify(doc)).not.toContain('conclusa')
  })

  it('esclude i campi locali dal torneo nel documento', async () => {
    const doc = await buildOrgDoc('t1')
    expect(doc.tournament.pubblicato).toBeUndefined()
    expect(doc.tournament.orgVersion).toBeUndefined()
    expect(doc.tournament.orgPending).toBeUndefined()
    expect(doc.teams).toHaveLength(2)
    expect(doc.groups).toHaveLength(1)
  })
})

describe('applyOrgDoc', () => {
  it('fonde i punteggi locali per matchId e preserva i campi locali', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: { ...torneo, pubblicato: undefined, orgVersion: undefined, orgPending: undefined },
      teams: [team('a')], groups: [group],
      struttura: [{ id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
    }
    const locali: Match[] = [match('m1', { set: [{ puntiA: 21, puntiB: 10 }], stato: 'conclusa', vincitoreId: 'a' })]
    const localT: Tournament = { ...torneo, pubblicato: true, orgVersion: 5, orgPending: false }
    const res = applyOrgDoc(doc, localT, locali)
    expect(res.matches[0].set).toEqual([{ puntiA: 21, puntiB: 10 }])
    expect(res.matches[0].vincitoreId).toBe('a')
    expect(res.tournament.pubblicato).toBe(true)
    expect(res.tournament.orgVersion).toBe(5)
  })

  it('inizializza punteggi vuoti per match nuovi e rimuove quelli assenti dal cloud', () => {
    const doc: import('../types/org').OrgDoc = {
      tournament: torneo, teams: [], groups: [],
      struttura: [{ id: 'nuovo', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b' }],
    }
    const locali: Match[] = [match('vecchio', { set: [{ puntiA: 21, puntiB: 9 }], stato: 'conclusa' })]
    const res = applyOrgDoc(doc, torneo, locali)
    expect(res.matches).toHaveLength(1)
    expect(res.matches[0].id).toBe('nuovo')
    expect(res.matches[0].set).toEqual([])
    expect(res.matches[0].stato).toBe('programmata')
  })
})

describe('scriviOrgLocale', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })
  it('sostituisce teams/groups/matches del torneo', async () => {
    await db.teams.bulkPut([team('vecchia')])
    await scriviOrgLocale({
      tournament: torneo, teams: [team('a'), team('b')], groups: [group],
      matches: [match('m1')],
    })
    const teams = await db.teams.where('tournamentId').equals('t1').toArray()
    expect(teams.map((x) => x.id).sort()).toEqual(['a', 'b'])
    const matches = await db.matches.where('tournamentId').equals('t1').toArray()
    expect(matches).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Verifica che i test falliscano**

Run: `npx vitest run src/services/orgDoc.test.ts`
Expected: FAIL (`orgDoc` non esiste / export mancanti).

- [ ] **Step 4: Implementa `orgDoc.ts`**

Create `src/services/orgDoc.ts`:

```ts
import type { Tournament, Team, Group, Match } from '../engine/types'
import type { OrgDoc, MatchStruct } from '../types/org'
import { db } from '../db/database'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'

function strutturaDaMatch(m: Match): MatchStruct {
  const copia: Partial<Match> = { ...m }
  delete copia.set
  delete copia.vincitoreId
  delete copia.stato
  return copia as MatchStruct
}

export async function buildOrgDoc(tournamentId: string): Promise<OrgDoc> {
  const [t, teams, groups, matches] = await Promise.all([
    getTournament(tournamentId),
    teamsOf(tournamentId),
    groupsOf(tournamentId),
    matchesOf(tournamentId),
  ])
  if (!t) throw new Error('Torneo non trovato')
  const tournament: Tournament = { ...t, pubblicato: undefined, orgVersion: undefined, orgPending: undefined }
  return { tournament, teams, groups, struttura: matches.map(strutturaDaMatch) }
}

export interface StatoLocaleOrg {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  matches: Match[]
}

export function applyOrgDoc(
  doc: OrgDoc,
  localTournament: Tournament | undefined,
  localMatches: Match[],
): StatoLocaleOrg {
  const perId = new Map(localMatches.map((m) => [m.id, m]))
  const matches: Match[] = doc.struttura.map((s) => {
    const locale = perId.get(s.id)
    return {
      ...s,
      set: locale?.set ?? [],
      vincitoreId: locale?.vincitoreId ?? null,
      stato: locale?.stato ?? 'programmata',
    }
  })
  const tournament: Tournament = {
    ...doc.tournament,
    pubblicato: localTournament?.pubblicato,
    orgVersion: localTournament?.orgVersion,
    orgPending: localTournament?.orgPending,
  }
  return { tournament, teams: doc.teams, groups: doc.groups, matches }
}

export async function scriviOrgLocale(s: StatoLocaleOrg): Promise<void> {
  await db.transaction('rw', db.tournaments, db.teams, db.groups, db.matches, async () => {
    await db.tournaments.put(s.tournament)
    await db.teams.where('tournamentId').equals(s.tournament.id).delete()
    await db.groups.where('tournamentId').equals(s.tournament.id).delete()
    await db.matches.where('tournamentId').equals(s.tournament.id).delete()
    if (s.teams.length) await db.teams.bulkPut(s.teams)
    if (s.groups.length) await db.groups.bulkPut(s.groups)
    if (s.matches.length) await db.matches.bulkPut(s.matches)
  })
}
```

- [ ] **Step 5: Verifica che i test passino**

Run: `npx vitest run src/services/orgDoc.test.ts`
Expected: PASS (tutti). Poi `npx tsc --noEmit` → nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/types/org.ts src/engine/types.ts src/services/orgDoc.ts src/services/orgDoc.test.ts
git commit -m "feat(fase8b): OrgDoc + build/apply con merge punteggi per matchId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Orchestratore sync (`orgSync.ts` — push/pull/conflitti)

**Files:**
- Create: `src/services/orgSync.ts`
- Test: `src/services/orgSync.test.ts`

**Interfaces:**
- Consumes: `RegistrationsClient` da `./registrations-api`; `OrgDoc` da `../types/org`; `getClient, getWriteToken` da `./config`; `getTournament, matchesOf, saveTournament` da `../db/repositories`; `buildOrgDoc, applyOrgDoc, scriviOrgLocale` da `./orgDoc`.
- Produces:
  - `type StatoSync = 'sincronizzato' | 'aggiornato' | 'conflitto' | 'errore' | 'inpari'`
  - `interface EsitoSync { stato: StatoSync; versioneCloud?: number; docCloud?: OrgDoc }`
  - `sincronizzabile(): boolean`
  - `spingiOrg(tournamentId: string, client?: RegistrationsClient): Promise<EsitoSync>`
  - `tiraOrg(tournamentId: string, client?: RegistrationsClient): Promise<EsitoSync>`
  - `risolviConflittoUsaCloud(tournamentId: string, docCloud: OrgDoc, versioneCloud: number): Promise<void>`
  - `risolviConflittoSovrascrivi(tournamentId: string, versioneCloud: number, client?: RegistrationsClient): Promise<EsitoSync>`

- [ ] **Step 1: Scrivi i test (falliscono)**

Create `src/services/orgSync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament, matchesOf } from '../db/repositories'
import { spingiOrg, tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi } from './orgSync'
import { buildOrgDoc } from './orgDoc'
import type { RegistrationsClient } from './registrations-api'
import type { OrgRecord } from '../types/org'
import type { Tournament, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
const match = (id: string, over: Partial<Match> = {}): Match => ({
  id, tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b',
  set: [], stato: 'programmata', ...over,
})

// Client fake: implementa solo i metodi org usati; gli altri lanciano.
function fakeClient(over: Partial<RegistrationsClient>): RegistrationsClient {
  const base = {
    getOrg: async () => null,
    putOrg: async () => ({ conflitto: false, version: 1 }),
    deleteOrg: async () => {},
  } as unknown as RegistrationsClient
  return { ...base, ...over }
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  await saveTournament(torneo)
  await db.matches.put(match('m1'))
})

describe('spingiOrg', () => {
  it('su 200 aggiorna orgVersion e azzera orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true, orgVersion: 0 })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const esito = await spingiOrg('t1', fakeClient({ putOrg }))
    expect(esito.stato).toBe('sincronizzato')
    expect(putOrg).toHaveBeenCalledWith('ABC123', expect.any(String), 0)
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(1)
    expect(t?.orgPending).toBe(false)
  })

  it('su 409 restituisce conflitto senza toccare orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true, orgVersion: 2 })
    const esito = await spingiOrg('t1', fakeClient({ putOrg: async () => ({ conflitto: true, version: 5 }) }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.versioneCloud).toBe(5)
    const t = await getTournament('t1')
    expect(t?.orgPending).toBe(true)
  })

  it('su errore di rete restituisce errore e lascia orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true })
    const esito = await spingiOrg('t1', fakeClient({ putOrg: async () => { throw new Error('offline') } }))
    expect(esito.stato).toBe('errore')
    const t = await getTournament('t1')
    expect(t?.orgPending).toBe(true)
  })
})

describe('tiraOrg', () => {
  it('se il cloud è assente fa il primo upload (push)', async () => {
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => null, putOrg }))
    expect(putOrg).toHaveBeenCalled()
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se cloud è avanti e non ci sono modifiche pendenti, applica il documento', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: false })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify({ ...doc, teams: [], groups: [], struttura: [] }), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('aggiornato')
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(4)
    const matches = await matchesOf('t1')
    expect(matches).toHaveLength(0) // struttura cloud vuota → match locali rimossi
  })

  it('se cloud è avanti CON modifiche pendenti, segnala conflitto', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.versioneCloud).toBe(4)
    expect(esito.docCloud).toBeTruthy()
  })

  it('se le versioni combaciano e non c\'è pending, è in pari', async () => {
    await saveTournament({ ...torneo, orgVersion: 4, orgPending: false })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('inpari')
  })
})

describe('risoluzione conflitti', () => {
  it('usa cloud: applica il doc e azzera pending', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1')
    await risolviConflittoUsaCloud('t1', { ...doc, struttura: [] }, 4)
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(4)
    expect(t?.orgPending).toBe(false)
    expect(await matchesOf('t1')).toHaveLength(0)
  })

  it('sovrascrivi: ri-pusha con la versione cloud come base', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 5 }))
    const esito = await risolviConflittoSovrascrivi('t1', 4, fakeClient({ putOrg }))
    expect(putOrg).toHaveBeenCalledWith('ABC123', expect.any(String), 4)
    expect(esito.stato).toBe('sincronizzato')
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(5)
    expect(t?.orgPending).toBe(false)
  })
})
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/services/orgSync.test.ts`
Expected: FAIL (`orgSync` non esiste).

- [ ] **Step 3: Implementa `orgSync.ts`**

Create `src/services/orgSync.ts`:

```ts
import type { RegistrationsClient } from './registrations-api'
import type { OrgDoc } from '../types/org'
import { getClient, getWriteToken } from './config'
import { getTournament, matchesOf, saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale } from './orgDoc'

export type StatoSync = 'sincronizzato' | 'aggiornato' | 'conflitto' | 'errore' | 'inpari'

export interface EsitoSync {
  stato: StatoSync
  versioneCloud?: number
  docCloud?: OrgDoc
}

/** La sync è attiva solo se online e con token di scrittura impostato (local-first). */
export function sincronizzabile(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (!getWriteToken()) return false
  return true
}

// Helper privato: push del documento con una versione-base esplicita.
async function eseguiPush(
  tournamentId: string,
  base: number,
  client: RegistrationsClient,
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  try {
    const doc = await buildOrgDoc(tournamentId)
    const esito = await client.putOrg(t.codiceIscrizione, JSON.stringify(doc), base)
    if (esito.conflitto) return { stato: 'conflitto', versioneCloud: esito.version }
    await saveTournament({ ...t, orgVersion: esito.version, orgPending: false })
    return { stato: 'sincronizzato', versioneCloud: esito.version }
  } catch {
    return { stato: 'errore' }
  }
}

// Helper privato: applica un documento cloud al locale (merge punteggi) e fissa la versione.
export async function applicaEScrivi(tournamentId: string, doc: OrgDoc, versione: number): Promise<void> {
  const [t, locali] = await Promise.all([getTournament(tournamentId), matchesOf(tournamentId)])
  const stato = applyOrgDoc(doc, t, locali)
  await scriviOrgLocale({ ...stato, tournament: { ...stato.tournament, orgVersion: versione, orgPending: false } })
}

export async function spingiOrg(
  tournamentId: string,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  return eseguiPush(tournamentId, t.orgVersion ?? 0, client)
}

export async function tiraOrg(
  tournamentId: string,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  let record
  try {
    record = await client.getOrg(t.codiceIscrizione)
  } catch {
    return { stato: 'errore' }
  }
  if (!record) return spingiOrg(tournamentId, client)

  const versioneLocale = t.orgVersion ?? 0
  if (record.version === versioneLocale) {
    if (t.orgPending) return spingiOrg(tournamentId, client)
    return { stato: 'inpari', versioneCloud: record.version }
  }
  if (record.version < versioneLocale) return spingiOrg(tournamentId, client)

  const doc = JSON.parse(record.doc) as OrgDoc
  if (t.orgPending) return { stato: 'conflitto', versioneCloud: record.version, docCloud: doc }

  await applicaEScrivi(tournamentId, doc, record.version)
  return { stato: 'aggiornato', versioneCloud: record.version }
}

export async function risolviConflittoUsaCloud(
  tournamentId: string,
  docCloud: OrgDoc,
  versioneCloud: number,
): Promise<void> {
  await applicaEScrivi(tournamentId, docCloud, versioneCloud)
}

export async function risolviConflittoSovrascrivi(
  tournamentId: string,
  versioneCloud: number,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  return eseguiPush(tournamentId, versioneCloud, client)
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run src/services/orgSync.test.ts`
Expected: PASS. Poi `npx tsc --noEmit` → nessun errore.

- [ ] **Step 5: Commit**

```bash
git add src/services/orgSync.ts src/services/orgSync.test.ts
git commit -m "feat(fase8b): orgSync push/pull + risoluzione conflitti esplicita

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Auto-push con debounce (`notificaModificaOrg`)

**Files:**
- Modify: `src/services/orgSync.ts` (aggiunge `notificaModificaOrg`)
- Test: `src/services/orgSync.debounce.test.ts`

**Interfaces:**
- Consumes: quanto già in `orgSync.ts`.
- Produces: `notificaModificaOrg(tournamentId: string, client?: RegistrationsClient): void`

Comportamento: imposta **sempre** `orgPending=true` (anche offline, così una modifica offline verrà rilevata al prossimo pull); se `sincronizzabile()`, programma un push con debounce di 1500 ms che coalizza chiamate ravvicinate.

- [ ] **Step 1: Scrivi il test (fallisce)**

Create `src/services/orgSync.debounce.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament } from '../db/repositories'
import { notificaModificaOrg } from './orgSync'
import type { RegistrationsClient } from './registrations-api'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
function fakeClient(putOrg: RegistrationsClient['putOrg']): RegistrationsClient {
  return { getOrg: async () => null, putOrg, deleteOrg: async () => {} } as unknown as RegistrationsClient
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.matches.clear()])
  await saveTournament(torneo)
  localStorage.setItem('writeToken', 'wt') // rende sincronizzabile() true (jsdom: navigator.onLine = true)
})
afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('notificaModificaOrg', () => {
  it('imposta orgPending=true', async () => {
    notificaModificaOrg('t1', fakeClient(async () => ({ conflitto: false, version: 1 })))
    await vi.waitFor(async () => {
      const t = await getTournament('t1')
      expect(t?.orgPending).toBe(true)
    })
  })

  it('coalizza più chiamate ravvicinate in un solo push', async () => {
    vi.useFakeTimers()
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const client = fakeClient(putOrg)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    await vi.advanceTimersByTimeAsync(1600)
    expect(putOrg).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Verifica che il test fallisca**

Run: `npx vitest run src/services/orgSync.debounce.test.ts`
Expected: FAIL (`notificaModificaOrg` non esiste).

- [ ] **Step 3: Implementa `notificaModificaOrg`**

In `src/services/orgSync.ts`, aggiungi in fondo:

```ts
const DEBOUNCE_MS = 1500
const timer = new Map<string, ReturnType<typeof setTimeout>>()

async function marcaPending(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (t && !t.orgPending) await saveTournament({ ...t, orgPending: true })
}

/** Da chiamare dopo ogni modifica dell'ORGANIZZAZIONE (non dei punteggi). */
export function notificaModificaOrg(tournamentId: string, client: RegistrationsClient = getClient()): void {
  void marcaPending(tournamentId)
  if (!sincronizzabile()) return
  const esistente = timer.get(tournamentId)
  if (esistente) clearTimeout(esistente)
  timer.set(
    tournamentId,
    setTimeout(() => {
      timer.delete(tournamentId)
      void spingiOrg(tournamentId, client)
    }, DEBOUNCE_MS),
  )
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run src/services/orgSync.debounce.test.ts`
Expected: PASS. Poi `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/services/orgSync.ts src/services/orgSync.debounce.test.ts
git commit -m "feat(fase8b): auto-push con debounce (notificaModificaOrg)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Hook `useOrgSync` + banner conflitto + montaggio

**Files:**
- Create: `src/services/useOrgSync.ts`
- Create: `src/components/ConflittoOrgBanner.tsx`
- Create: `src/components/ConflittoOrgBanner.test.tsx`
- Modify: `src/screens/RiepilogoScreen.tsx` (monta hook + banner)
- Modify: `src/styles/tokens.css` (stile banner)

**Interfaces:**
- Consumes: `tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi, sincronizzabile` da `./orgSync`; `OrgDoc` da `../types/org`; `Button` da `./Button`.
- Produces:
  - `interface StatoConflitto { versioneCloud: number; docCloud: OrgDoc }`
  - `interface OrgSync { conflitto: StatoConflitto | null; risolviCloud: () => Promise<void>; risolviLocale: () => Promise<void> }`
  - `useOrgSync(tournamentId: string | undefined): OrgSync`
  - `ConflittoOrgBanner({ sync }: { sync: OrgSync })`

- [ ] **Step 1: Scrivi il test del banner (fallisce)**

Create `src/components/ConflittoOrgBanner.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflittoOrgBanner } from './ConflittoOrgBanner'
import type { OrgSync } from '../services/useOrgSync'

function sync(over: Partial<OrgSync>): OrgSync {
  return { conflitto: null, risolviCloud: vi.fn(async () => {}), risolviLocale: vi.fn(async () => {}), ...over }
}

describe('ConflittoOrgBanner', () => {
  it('non mostra nulla senza conflitto', () => {
    const { container } = render(<ConflittoOrgBanner sync={sync({ conflitto: null })} />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra il banner e invoca le due azioni', () => {
    const risolviCloud = vi.fn(async () => {})
    const risolviLocale = vi.fn(async () => {})
    const s = sync({ conflitto: { versioneCloud: 4, docCloud: {} as never }, risolviCloud, risolviLocale })
    render(<ConflittoOrgBanner sync={s} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usa quelle dal cloud' }))
    expect(risolviCloud).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sovrascrivi con le mie' }))
    expect(risolviLocale).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verifica che il test fallisca**

Run: `npx vitest run src/components/ConflittoOrgBanner.test.tsx`
Expected: FAIL (componente e hook inesistenti).

- [ ] **Step 3: Implementa hook e banner**

Create `src/services/useOrgSync.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import type { OrgDoc } from '../types/org'
import { tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi, sincronizzabile } from './orgSync'

export interface StatoConflitto {
  versioneCloud: number
  docCloud: OrgDoc
}
export interface OrgSync {
  conflitto: StatoConflitto | null
  risolviCloud: () => Promise<void>
  risolviLocale: () => Promise<void>
}

export function useOrgSync(tournamentId: string | undefined): OrgSync {
  const [conflitto, setConflitto] = useState<StatoConflitto | null>(null)
  const fatto = useRef<string | null>(null)

  useEffect(() => {
    if (!tournamentId || !sincronizzabile()) return
    if (fatto.current === tournamentId) return
    fatto.current = tournamentId
    let annullato = false
    void tiraOrg(tournamentId).then((esito) => {
      if (annullato) return
      if (esito.stato === 'conflitto' && esito.docCloud && esito.versioneCloud !== undefined) {
        setConflitto({ versioneCloud: esito.versioneCloud, docCloud: esito.docCloud })
      }
    })
    return () => {
      annullato = true
    }
  }, [tournamentId])

  async function risolviCloud(): Promise<void> {
    if (!tournamentId || !conflitto) return
    await risolviConflittoUsaCloud(tournamentId, conflitto.docCloud, conflitto.versioneCloud)
    setConflitto(null)
  }
  async function risolviLocale(): Promise<void> {
    if (!tournamentId || !conflitto) return
    await risolviConflittoSovrascrivi(tournamentId, conflitto.versioneCloud)
    setConflitto(null)
  }
  return { conflitto, risolviCloud, risolviLocale }
}
```

Create `src/components/ConflittoOrgBanner.tsx`:

```tsx
import { Button } from './Button'
import type { OrgSync } from '../services/useOrgSync'

export function ConflittoOrgBanner({ sync }: { sync: OrgSync }) {
  if (!sync.conflitto) return null
  return (
    <div className="org-conflitto" role="alert">
      <p className="org-conflitto-testo">
        L'organizzazione è cambiata su un altro dispositivo. Le tue ultime modifiche non sono ancora nel cloud.
      </p>
      <div className="org-conflitto-azioni">
        <Button variant="ghost" onClick={() => void sync.risolviCloud()}>
          Usa quelle dal cloud
        </Button>
        <Button onClick={() => void sync.risolviLocale()}>Sovrascrivi con le mie</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verifica che il test del banner passi**

Run: `npx vitest run src/components/ConflittoOrgBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Monta hook e banner in `RiepilogoScreen`**

In `src/screens/RiepilogoScreen.tsx`:
- aggiungi gli import:

```ts
import { useOrgSync } from '../services/useOrgSync'
import { ConflittoOrgBanner } from '../components/ConflittoOrgBanner'
```

- dentro il componente, dopo `const toast = useToast()`:

```ts
  const orgSync = useOrgSync(id)
```

- nel JSX, subito dopo `<header className="riepilogo-head">…</header>` (prima di `<div className="riepilogo-stats">`), inserisci:

```tsx
      <ConflittoOrgBanner sync={orgSync} />
```

- [ ] **Step 6: Aggiungi lo stile del banner**

In `src/styles/tokens.css`, in fondo al file:

```css
.org-conflitto {
  border: 1px solid var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--paper));
  border-radius: var(--radius);
  padding: var(--space);
  margin-bottom: var(--space);
}
.org-conflitto-testo { margin: 0 0 var(--space) 0; }
.org-conflitto-azioni { display: flex; gap: var(--space); flex-wrap: wrap; }
```

- [ ] **Step 7: Verifica**

Run: `npx vitest run src/components/ConflittoOrgBanner.test.tsx src/screens/RiepilogoScreen.test.tsx`
Expected: PASS (il RiepilogoScreen esistente continua a funzionare: `sincronizzabile()` è false senza write token → l'hook non fa nulla). Poi `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add src/services/useOrgSync.ts src/components/ConflittoOrgBanner.tsx src/components/ConflittoOrgBanner.test.tsx src/screens/RiepilogoScreen.tsx src/styles/tokens.css
git commit -m "feat(fase8b): pull all'apertura + banner conflitto nel riepilogo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Agganci auto-push nelle operazioni di organizzazione

**Files:**
- Modify: `src/screens/SetupScreen.tsx` (dopo `saveTournament`)
- Modify: `src/screens/TeamsScreen.tsx` (dopo ogni scrittura squadre)
- Modify: `src/screens/BracketScreen.tsx` (dopo `replaceGenerated`)
- Modify: `src/screens/CalendarScreen.tsx` (dopo assegnazione campo/orario)
- Modify: `src/screens/RegistrationsAdminScreen.tsx` (dopo cambio stato)
- Modify: `src/screens/RiepilogoScreen.tsx` (dopo `confermaTutte` e dopo import iscrizioni)
- Modify: `src/screens/BracketScreen.test.tsx` (test rappresentativo: generazione → push)

**Interfaces:**
- Consumes: `notificaModificaOrg` da `../services/orgSync`.
- Produces: nessun nuovo export (solo agganci).

Nota: `notificaModificaOrg` è no-op quando la sync è spenta, quindi gli agganci non cambiano il comportamento offline.

- [ ] **Step 1: Aggancia `SetupScreen`**

In `src/screens/SetupScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'`. Subito dopo la riga `await saveTournament(torneo)` (riga ~114), aggiungi:

```ts
    notificaModificaOrg(torneo.id)
```

- [ ] **Step 2: Aggancia `TeamsScreen`**

In `src/screens/TeamsScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'`. Lo screen ha `const { id } = useParams()` (tipo `string | undefined`, riga 19). Poiché `id` può essere `undefined`, guardalo. Dopo **ognuna** delle quattro scritture, aggiungi sulla riga seguente `if (id) notificaModificaOrg(id)`:
- riga ~68 dopo `await db.teams.put({ ...team, testaDiSerie })` (in `handleSeed`)
- riga ~72 dopo `await db.teams.update(teamId, { stato: 'confermata' })` (in `handleConfirm`)
- riga ~77 dopo `await db.teams.delete(teamId)` (in `handleRemove`)
- riga ~98 dopo `await db.teams.put(team)` (in `handleSubmit`)

```ts
    if (id) notificaModificaOrg(id)
```

- [ ] **Step 3: Aggancia `BracketScreen`**

In `src/screens/BracketScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'`. Dopo il blocco:

```ts
      await replaceGenerated(torneo.id, nuoviGruppi, nuovePartite)
      await saveTournament({ ...torneo, stato: 'in_corso' })
```

aggiungi:

```ts
      notificaModificaOrg(torneo.id)
```

- [ ] **Step 4: Aggancia `CalendarScreen`**

In `src/screens/CalendarScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'`. Dopo `await db.matches.update(inSpostamento.id, { orario: nuovoOrario, campo: nuovoCampo })`, aggiungi (usa l'id del torneo dello screen, verifica il nome nel file, tipicamente `id` di `useParams`):

```ts
    notificaModificaOrg(inSpostamento.tournamentId)
```

- [ ] **Step 5: Aggancia `RegistrationsAdminScreen`**

In `src/screens/RegistrationsAdminScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'`. Dopo entrambe le `saveTournament({ ...torneo, stato: … })`, aggiungi:

```ts
        notificaModificaOrg(torneo.id)
```

- [ ] **Step 6: Aggancia `RiepilogoScreen`**

In `src/screens/RiepilogoScreen.tsx`: aggiungi `import { notificaModificaOrg } from '../services/orgSync'` (Task 4 ha già aggiunto l'import di `useOrgSync`).
- In `confermaTutte`, dopo `await db.teams.where(...).modify({ stato: 'confermata' })`, aggiungi `if (id) notificaModificaOrg(id)` (`id` è `string | undefined`).
- In `sincronizzaIscrizioni`, dentro il ramo `if (nuove.length > 0) { await db.teams.bulkPut(...) }`, subito dopo il `bulkPut`, aggiungi `notificaModificaOrg(tournamentId)` (`tournamentId` è il parametro `string` della funzione).

- [ ] **Step 7: Test rappresentativo (generazione → push)**

Apri `src/screens/BracketScreen.test.tsx`, leggi come renderizza lo screen (helper/router esistenti) e aggiungi in cima al file il mock del modulo orgSync:

```ts
import { vi } from 'vitest'
vi.mock('../services/orgSync', () => ({
  notificaModificaOrg: vi.fn(),
  sincronizzabile: () => false,
}))
import { notificaModificaOrg } from '../services/orgSync'
```

Aggiungi un test che, riusando lo stesso setup degli altri test del file (creazione torneo + squadre e click sul pulsante "Genera"), verifica:

```ts
it('notifica la modifica organizzazione dopo la generazione', async () => {
  // …stesso arrange/act degli altri test del file: render + click "Genera"…
  await waitFor(() => expect(notificaModificaOrg).toHaveBeenCalled())
})
```

Se il mock di `sincronizzabile` confligge con altri test del file che si aspettano la sync attiva (improbabile: nessuno la usa oggi), restringi il mock al solo `notificaModificaOrg` e lascia il resto reale con `vi.importActual`.

- [ ] **Step 8: Verifica**

Run: `npx vitest run src/screens/BracketScreen.test.tsx src/screens/SetupScreen.test.tsx src/screens/TeamsScreen.test.tsx src/screens/CalendarScreen.test.tsx src/screens/RegistrationsAdminScreen.test.tsx src/screens/RiepilogoScreen.test.tsx`
Expected: PASS (tutti). Poi `npx tsc --noEmit`.

- [ ] **Step 9: Commit**

```bash
git add src/screens/
git commit -m "feat(fase8b): auto-push org su setup/squadre/generazione/calendario/stato

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Onboarding secondo dispositivo (Home) + write token (Impostazioni)

**Files:**
- Modify: `src/services/orgSync.ts` (aggiunge `caricaDalCloud`)
- Test: `src/services/orgSync.carica.test.ts`
- Modify: `src/screens/HomeScreen.tsx` (azione "Carica dal cloud")
- Modify: `src/screens/SettingsScreen.tsx` (campo write token)
- Modify: `src/screens/SettingsScreen.test.tsx` (test campo)
- Modify: `src/styles/tokens.css` (stile form inline in Home, se serve)

**Interfaces:**
- Consumes: `getOrg` (via client), `applyOrgDoc, scriviOrgLocale` da `./orgDoc`, `getTournament, matchesOf` da `../db/repositories`, `getWriteToken, setWriteToken` da `./config`.
- Produces: `caricaDalCloud(codice: string, client?: RegistrationsClient): Promise<string | null>` (ritorna l'id del torneo locale creato/aggiornato, o `null` se non esiste nel cloud).

- [ ] **Step 1: Scrivi il test di `caricaDalCloud` (fallisce)**

Create `src/services/orgSync.carica.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { caricaDalCloud } from './orgSync'
import type { RegistrationsClient } from './registrations-api'
import type { OrgDoc, OrgRecord } from '../types/org'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 'remoto-1', nome: 'Coppa Cloud', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'CLOUD1', qualificatiPerGirone: 'tutti',
}
const doc: OrgDoc = { tournament: torneo, teams: [], groups: [], struttura: [] }
function fakeClient(record: OrgRecord | null): RegistrationsClient {
  return { getOrg: async () => record, putOrg: async () => ({ conflitto: false, version: 1 }), deleteOrg: async () => {} } as unknown as RegistrationsClient
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
})

describe('caricaDalCloud', () => {
  it('crea il torneo locale dal documento e ritorna il suo id', async () => {
    const record: OrgRecord = { codice: 'CLOUD1', doc: JSON.stringify(doc), version: 2, updatedAt: 'x' }
    const id = await caricaDalCloud('CLOUD1', fakeClient(record))
    expect(id).toBe('remoto-1')
    const t = await db.tournaments.get('remoto-1')
    expect(t?.nome).toBe('Coppa Cloud')
    expect(t?.orgVersion).toBe(2)
    expect(t?.orgPending).toBe(false)
  })

  it('ritorna null se il codice non esiste nel cloud', async () => {
    const id = await caricaDalCloud('INESISTENTE', fakeClient(null))
    expect(id).toBeNull()
  })
})
```

- [ ] **Step 2: Verifica che il test fallisca**

Run: `npx vitest run src/services/orgSync.carica.test.ts`
Expected: FAIL (`caricaDalCloud` non esiste).

- [ ] **Step 3: Implementa `caricaDalCloud`**

In `src/services/orgSync.ts`, aggiungi (riusa l'helper privato `applicaEScrivi` introdotto nel Task 2, che fa merge dei punteggi e fissa la versione; gestisce anche il caso "torneo già presente localmente" perché `applyOrgDoc` legge i match locali per `id`):

```ts
export async function caricaDalCloud(
  codice: string,
  client: RegistrationsClient = getClient(),
): Promise<string | null> {
  const record = await client.getOrg(codice)
  if (!record) return null
  const doc = JSON.parse(record.doc) as OrgDoc
  await applicaEScrivi(doc.tournament.id, doc, record.version)
  return doc.tournament.id
}
```

- [ ] **Step 4: Verifica che il test passi**

Run: `npx vitest run src/services/orgSync.carica.test.ts`
Expected: PASS.

- [ ] **Step 5: Aggiungi "Carica dal cloud" in `HomeScreen`**

Sostituisci `src/screens/HomeScreen.tsx` con:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTournaments } from '../db/repositories'
import { caricaDalCloud } from '../services/orgSync'
import { getWriteToken } from '../services/config'
import { Button } from '../components/Button'
import { Field } from '../components/Field'

export function HomeScreen() {
  const tornei = useLiveQuery(listTournaments, [], [])
  const navigate = useNavigate()
  const [apertoCarica, setApertoCarica] = useState(false)
  const [codice, setCodice] = useState('')
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function handleCarica() {
    setErrore(null)
    if (!getWriteToken()) {
      setErrore('Imposta prima il token di scrittura nelle Impostazioni.')
      return
    }
    const c = codice.trim().toUpperCase()
    if (!c) return
    setCaricando(true)
    try {
      const id = await caricaDalCloud(c)
      if (!id) {
        setErrore('Nessun torneo con questo codice nel cloud.')
        return
      }
      navigate(`/tornei/${id}`)
    } catch {
      setErrore('Errore di connessione o token non valido.')
    } finally {
      setCaricando(false)
    }
  }

  return (
    <section className="home">
      <header className="home-head">
        <h1>Tornei</h1>
        <div className="home-head-azioni">
          <Button variant="ghost" onClick={() => setApertoCarica((v) => !v)}>Carica dal cloud</Button>
          <Link to="/tornei/nuovo"><Button>Nuovo torneo</Button></Link>
        </div>
      </header>

      {apertoCarica && (
        <div className="home-carica">
          <Field
            label="Codice torneo"
            value={codice}
            onChange={(e) => { setCodice(e.target.value); setErrore(null) }}
            placeholder="es. ABC123"
          />
          <div className="home-carica-azioni">
            <Button onClick={() => void handleCarica()} disabled={caricando}>
              {caricando ? 'Caricamento…' : 'Carica'}
            </Button>
          </div>
          {errore && <p className="verifica-esito verifica-esito-errore" role="alert">✗ {errore}</p>}
        </div>
      )}

      {tornei.length === 0 ? (
        <p className="empty">Nessun torneo ancora. Creane uno per iniziare.</p>
      ) : (
        <ul className="card-grid">
          {tornei.map((t) => (
            <li key={t.id} className="card">
              <Link to={`/tornei/${t.id}`} className="card-link">
                <h3>{t.nome}</h3>
                <p className="muted">{t.tipologia} · {t.formato.replace(/_/g, ' ')} · {t.data}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Stili Home**

In `src/styles/tokens.css`, in fondo:

```css
.home-head-azioni { display: flex; gap: var(--space); align-items: center; }
.home-carica { border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space); margin-bottom: var(--space); }
.home-carica-azioni { margin-top: var(--space); }
```

- [ ] **Step 7: Campo write token in `SettingsScreen`**

In `src/screens/SettingsScreen.tsx`:
- estendi l'import da config: `import { getSavedApiBaseUrl, getApiBaseUrl, getReadToken, setApiBaseUrl, setReadToken, getWriteToken, setWriteToken } from '../services/config'`
- aggiungi lo state: `const [writeToken, setWriteTokenValue] = useState(() => getWriteToken() ?? '')`
- in `handleSubmit` e `handleVerifica`, dopo `setReadToken(readToken)`, aggiungi `setWriteToken(writeToken)`
- nel JSX, dopo il paragrafo del token di lettura (prima di `<div className="setup-actions">`), aggiungi:

```tsx
        <Field
          label="Token di scrittura"
          type="password"
          value={writeToken}
          onChange={(e) => {
            setWriteTokenValue(e.target.value)
            setSalvato(false)
            setVerifica(null)
          }}
          autoComplete="off"
        />
        <p className="muted">Serve a sincronizzare l'organizzazione del torneo tra i tuoi dispositivi. È più potente del token di lettura: tienilo privato.</p>
```

- [ ] **Step 8: Test del campo write token**

In `src/screens/SettingsScreen.test.tsx`, leggi il pattern di render esistente e aggiungi un test che compila il campo "Token di scrittura", clicca "Salva" e verifica la persistenza:

```tsx
it('salva il token di scrittura', async () => {
  // …render dello screen come negli altri test del file…
  fireEvent.change(screen.getByLabelText('Token di scrittura'), { target: { value: 'segreto-w' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
  expect(localStorage.getItem('writeToken')).toBe('segreto-w')
})
```

- [ ] **Step 9: Verifica**

Run: `npx vitest run src/services/orgSync.carica.test.ts src/screens/SettingsScreen.test.tsx src/screens/HomeScreen.test.tsx`
Expected: PASS. Poi `npx tsc --noEmit` e `npx vite build` → build OK.

- [ ] **Step 10: Commit**

```bash
git add src/services/orgSync.ts src/services/orgSync.carica.test.ts src/screens/HomeScreen.tsx src/screens/SettingsScreen.tsx src/screens/SettingsScreen.test.tsx src/styles/tokens.css
git commit -m "feat(fase8b): carica torneo dal cloud (Home) + token di scrittura (Impostazioni)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verifica finale (dopo tutti i task)

- [ ] `npx tsc --noEmit` → nessun errore.
- [ ] Run mirati Vitest di tutti i file toccati (elencati nei task) → PASS.
- [ ] `npx vite build` → build OK.
- [ ] Review dell'intero branch (opus) prima del merge.

## Note di scope

- **Fuori 8b:** merge dei punteggi live tra dispositivi e secondo organizzatore che segna in tempo reale (8c); migrazione di massa dei tornei locali; presence/co-editing realtime; storico versioni.
- La progressione del tabellone (avanzamento vincitori) resta locale: entra nel documento solo di rimbalzo al prossimo push organizzativo, il che è innocuo (non sono punteggi) e converge.
