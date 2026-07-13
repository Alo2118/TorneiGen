# TorneiGen — Piano Fase 1: Scaffold + Motore + Persistenza locale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il core testato dell'app: i tipi di dominio, il motore puro dei tornei (round robin, esito partite, classifiche, eliminazione singola, gironi+eliminazione) e la persistenza locale su IndexedDB con export/import JSON.

**Architecture:** Progetto Vite + React + TypeScript. Il motore (`src/engine/`) è fatto di funzioni pure senza dipendenze da UI o storage, sviluppate in TDD con Vitest. La persistenza (`src/db/`) usa Dexie su IndexedDB, testata con `fake-indexeddb`. Nessuna UI in questo piano: il deliverable è una libreria core con test verdi.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Dexie, fake-indexeddb, uuid.

## Global Constraints

- Linguaggio: **TypeScript strict** (`"strict": true` in `tsconfig.json`).
- Il codice in `src/engine/` NON deve importare da `src/db/`, `src/ui/`, `dexie`, o Supabase. Solo funzioni pure.
- Test runner: **Vitest**. Ogni funzione del motore ha test unitari prima dell'implementazione (TDD).
- Tipologia squadra: `2x2` (2 giocatori) | `4x4` (da 4 a 8 giocatori). Il motore lavora su `teamId` e NON valida il numero di giocatori (è compito della UI/registrazione).
- Punteggio interamente configurabile per torneo via `RegolePunteggio` — nessun valore fisso nel motore.
- Nomi/identificatori del dominio in italiano come da spec (es. `regolePunteggio`, `testaDiSerie`).
- Commit frequenti, uno per task completato.

---

### Task 1: Scaffold progetto (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `src/engine/.gitkeep`, `src/db/.gitkeep`
- Create: `.gitignore`
- Test: `src/engine/smoke.test.ts`

**Interfaces:**
- Consumes: niente (primo task).
- Produces: progetto buildabile e comando `npm test` funzionante. Struttura cartelle `src/engine`, `src/db`.

- [ ] **Step 1: Inizializzare il progetto Vite React-TS**

Run:
```bash
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest fake-indexeddb
npm install dexie uuid
npm install -D @types/uuid
```
Nota: se `npm create` si rifiuta perché la cartella non è vuota (contiene `docs/`, `.git`), scaffoldare in una cartella temporanea e copiare i file (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/`) nella root.

- [ ] **Step 2: Configurare Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Aggiungere script test e strict mode**

In `package.json` aggiungere agli `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
In `tsconfig.json` assicurarsi che `compilerOptions` contenga `"strict": true`.

- [ ] **Step 4: Scrivere uno smoke test**

Create `src/engine/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('esegue i test', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test`
Expected: PASS, 1 test verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS con Vitest"
```

---

### Task 2: Tipi di dominio

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/id.ts`
- Test: `src/engine/id.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces:
  - Tipi: `Tipologia`, `Formato`, `StatoTorneo`, `RegolePunteggio`, `Player`, `Team`, `Group`, `SetScore`, `Match`, `Tournament`.
  - Tipi motore: `Pairing`, `BracketMatch`, `StandingRow`.
  - `newId(): string` — genera un id univoco (wrapper su `uuid`).

- [ ] **Step 1: Scrivere il test di `newId`**

Create `src/engine/id.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { newId } from './id'

describe('newId', () => {
  it('genera id diversi e non vuoti', () => {
    const a = newId()
    const b = newId()
    expect(a).not.toBe('')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run: `npm test -- id`
Expected: FAIL — modulo `./id` non trovato.

- [ ] **Step 3: Implementare `newId`**

Create `src/engine/id.ts`:
```ts
import { v4 as uuidv4 } from 'uuid'

export function newId(): string {
  return uuidv4()
}
```

- [ ] **Step 4: Creare i tipi di dominio**

Create `src/engine/types.ts`:
```ts
export type Tipologia = '2x2' | '4x4'

export type Formato =
  | 'gironi_eliminazione'
  | 'eliminazione_diretta'
  | 'girone_italiana'
  | 'king_of_the_court'

export type StatoTorneo = 'bozza' | 'iscrizioni_aperte' | 'in_corso' | 'concluso'

export interface RegolePunteggio {
  setAlMeglioDi: 1 | 3
  puntiSet: number
  puntiTieBreak: number
  vittoriaConDue: boolean
  cap?: number
}

export interface Player {
  nome: string
  cognome: string
  email: string
  telefono: string
}

export interface Team {
  id: string
  tournamentId: string
  nome: string
  players: Player[]
  testaDiSerie?: number
  stato: 'in_attesa' | 'confermata'
  origine: 'online' | 'manuale'
}

export interface Group {
  id: string
  tournamentId: string
  nome: string
  teamIds: string[]
}

export interface SetScore {
  puntiA: number
  puntiB: number
}

export interface Match {
  id: string
  tournamentId: string
  fase: 'girone' | 'tabellone' | 'kotc'
  groupId?: string
  round: number
  posizioneTabellone?: number
  teamAId: string | null
  teamBId: string | null
  set: SetScore[]
  vincitoreId?: string | null
  stato: 'programmata' | 'in_corso' | 'conclusa'
  campo?: string
  orario?: string
}

export interface Tournament {
  id: string
  nome: string
  tipologia: Tipologia
  formato: Formato
  data: string
  stato: StatoTorneo
  regolePunteggio: RegolePunteggio
  codiceIscrizione: string
}

// --- Tipi risultato del motore (indipendenti dalla persistenza) ---

export interface Pairing {
  round: number
  teamAId: string | null
  teamBId: string | null
}

export interface BracketMatch {
  id: string
  round: number
  index: number
  teamAId: string | null
  teamBId: string | null
  feedsMatchId: string | null
  feedsSlot: 'A' | 'B' | null
}

export interface StandingRow {
  teamId: string
  giocate: number
  vinte: number
  perse: number
  setVinti: number
  setPersi: number
  puntiFatti: number
  puntiSubiti: number
}
```

- [ ] **Step 5: Eseguire i test**

Run: `npm test -- id`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/id.ts src/engine/id.test.ts
git commit -m "feat(engine): tipi di dominio e generatore id"
```

---

### Task 3: Generatore round robin (metodo del cerchio)

**Files:**
- Create: `src/engine/roundRobin.ts`
- Test: `src/engine/roundRobin.test.ts`

**Interfaces:**
- Consumes: `Pairing` da `types.ts`.
- Produces: `generateRoundRobin(teamIds: string[]): Pairing[]` — genera tutti gli incontri; con numero dispari di squadre inserisce un bye (`null`).

- [ ] **Step 1: Scrivere i test**

Create `src/engine/roundRobin.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateRoundRobin } from './roundRobin'

describe('generateRoundRobin', () => {
  it('4 squadre → 3 round da 2 partite, ogni coppia una volta', () => {
    const p = generateRoundRobin(['A', 'B', 'C', 'D'])
    expect(p).toHaveLength(6)
    expect(new Set(p.map((m) => m.round)).size).toBe(3)
    const coppie = p.map((m) => [m.teamAId, m.teamBId].sort().join('-')).sort()
    expect(coppie).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D'])
  })

  it('3 squadre (dispari) → ogni round una squadra ha bye (null)', () => {
    const p = generateRoundRobin(['A', 'B', 'C'])
    expect(new Set(p.map((m) => m.round)).size).toBe(3)
    const conBye = p.filter((m) => m.teamAId === null || m.teamBId === null)
    expect(conBye).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `npm test -- roundRobin`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/roundRobin.ts`:
```ts
import type { Pairing } from './types'

export function generateRoundRobin(teamIds: string[]): Pairing[] {
  const teams: (string | null)[] = [...teamIds]
  if (teams.length % 2 !== 0) teams.push(null) // bye
  const n = teams.length
  const rounds = n - 1
  const half = n / 2
  const arr = [...teams]
  const result: Pairing[] = []

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      result.push({
        round: r + 1,
        teamAId: arr[i],
        teamBId: arr[n - 1 - i],
      })
    }
    // rotazione: primo fisso, gli altri ruotano
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop() as string | null)
    arr.splice(0, arr.length, fixed, ...rest)
  }
  return result
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test -- roundRobin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/roundRobin.ts src/engine/roundRobin.test.ts
git commit -m "feat(engine): generatore round robin con gestione bye"
```

---

### Task 4: Esito set e partita dalle regole di punteggio

**Files:**
- Create: `src/engine/matchOutcome.ts`
- Test: `src/engine/matchOutcome.test.ts`

**Interfaces:**
- Consumes: `SetScore`, `RegolePunteggio` da `types.ts`.
- Produces:
  - `setWinner(set: SetScore, target: number, vittoriaConDue: boolean, cap?: number): 'A' | 'B' | null`
  - `matchOutcome(sets: SetScore[], r: RegolePunteggio): { vincitore: 'A' | 'B' | null; setA: number; setB: number; completa: boolean }`

- [ ] **Step 1: Scrivere i test**

Create `src/engine/matchOutcome.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { setWinner, matchOutcome } from './matchOutcome'
import type { RegolePunteggio } from './types'

const bo1: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const bo3: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

describe('setWinner', () => {
  it('vince A a 21-18', () => {
    expect(setWinner({ puntiA: 21, puntiB: 18 }, 21, true)).toBe('A')
  })
  it('nessun vincitore a 21-20 con vittoria a 2 di scarto', () => {
    expect(setWinner({ puntiA: 21, puntiB: 20 }, 21, true)).toBe(null)
  })
  it('vince B a 23-25 (oltre il target, +2)', () => {
    expect(setWinner({ puntiA: 23, puntiB: 25 }, 21, true)).toBe('B')
  })
  it('con cap, chiude a 1 di scarto se raggiunge il cap', () => {
    expect(setWinner({ puntiA: 22, puntiB: 21 }, 21, true, 22)).toBe('A')
  })
  it('senza vittoria a 2, chiude a 1 di scarto', () => {
    expect(setWinner({ puntiA: 21, puntiB: 20 }, 21, false)).toBe('A')
  })
})

describe('matchOutcome', () => {
  it('best of 1: 1 set deciso chiude la partita', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 15 }], bo1)
    expect(o).toEqual({ vincitore: 'A', setA: 1, setB: 0, completa: true })
  })
  it('best of 3: vince chi arriva a 2 set', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }, { puntiA: 18, puntiB: 21 }, { puntiA: 15, puntiB: 11 }], bo3)
    expect(o.vincitore).toBe('A')
    expect(o.completa).toBe(true)
  })
  it('best of 3: il terzo set (spareggio) usa puntiTieBreak', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }, { puntiA: 10, puntiB: 21 }, { puntiA: 15, puntiB: 12 }], bo3)
    expect(o.vincitore).toBe('A')
  })
  it('partita incompleta se nessuno ha ancora i set necessari', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }], bo3)
    expect(o.completa).toBe(false)
    expect(o.vincitore).toBe(null)
  })
})
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `npm test -- matchOutcome`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/matchOutcome.ts`:
```ts
import type { SetScore, RegolePunteggio } from './types'

export function setWinner(
  set: SetScore,
  target: number,
  vittoriaConDue: boolean,
  cap?: number,
): 'A' | 'B' | null {
  const { puntiA, puntiB } = set
  const max = Math.max(puntiA, puntiB)
  const diff = Math.abs(puntiA - puntiB)
  if (max < target) return null
  if (vittoriaConDue) {
    const raggiuntoCap = cap !== undefined && max >= cap
    if (!raggiuntoCap && diff < 2) return null
  }
  if (puntiA === puntiB) return null
  return puntiA > puntiB ? 'A' : 'B'
}

export function matchOutcome(
  sets: SetScore[],
  r: RegolePunteggio,
): { vincitore: 'A' | 'B' | null; setA: number; setB: number; completa: boolean } {
  const setNecessari = Math.ceil(r.setAlMeglioDi / 2)
  let setA = 0
  let setB = 0
  sets.forEach((s, i) => {
    const isSpareggio = r.setAlMeglioDi === 3 && i === 2
    const target = isSpareggio ? r.puntiTieBreak : r.puntiSet
    const w = setWinner(s, target, r.vittoriaConDue, r.cap)
    if (w === 'A') setA++
    else if (w === 'B') setB++
  })
  let vincitore: 'A' | 'B' | null = null
  if (setA >= setNecessari) vincitore = 'A'
  else if (setB >= setNecessari) vincitore = 'B'
  return { vincitore, setA, setB, completa: vincitore !== null }
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test -- matchOutcome`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/matchOutcome.ts src/engine/matchOutcome.test.ts
git commit -m "feat(engine): esito set e partita da regole configurabili"
```

---

### Task 5: Calcolo classifiche con spareggi

**Files:**
- Create: `src/engine/standings.ts`
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: `Match`, `RegolePunteggio`, `StandingRow` da `types.ts`; `matchOutcome` dal Task 4.
- Produces: `computeStandings(teamIds: string[], matches: Match[], r: RegolePunteggio): StandingRow[]` — righe ordinate per: vinte desc → quoziente set desc → quoziente punti desc → scontro diretto. Considera solo le partite `conclusa` tra squadre della lista.

- [ ] **Step 1: Scrivere i test**

Create `src/engine/standings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeStandings } from './standings'
import type { Match, RegolePunteggio } from './types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

function match(a: string, b: string, pa: number, pb: number): Match {
  return {
    id: `${a}${b}`, tournamentId: 't', fase: 'girone', round: 1,
    teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }],
    stato: 'conclusa', vincitoreId: pa > pb ? a : b,
  }
}

describe('computeStandings', () => {
  it('conta vittorie, set e punti', () => {
    const rows = computeStandings(['A', 'B'], [match('A', 'B', 21, 15)], r)
    const A = rows.find((x) => x.teamId === 'A')!
    expect(A.vinte).toBe(1)
    expect(A.setVinti).toBe(1)
    expect(A.puntiFatti).toBe(21)
    expect(A.puntiSubiti).toBe(15)
  })

  it('ordina per numero di vittorie', () => {
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [match('A', 'B', 21, 10), match('A', 'C', 21, 12), match('B', 'C', 21, 19)],
      r,
    )
    expect(rows[0].teamId).toBe('A') // 2 vittorie
  })

  it('a parità di vittorie usa lo scontro diretto tra due squadre', () => {
    // A e B: 1 vittoria ciascuna nel girone, ma A ha battuto B
    const rows = computeStandings(
      ['A', 'B'],
      [match('A', 'B', 21, 15)],
      r,
    )
    expect(rows[0].teamId).toBe('A')
  })

  it('ignora le partite non concluse', () => {
    const incompleta: Match = {
      id: 'x', tournamentId: 't', fase: 'girone', round: 1,
      teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata',
    }
    const rows = computeStandings(['A', 'B'], [incompleta], r)
    expect(rows.every((row) => row.giocate === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `npm test -- standings`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/standings.ts`:
```ts
import type { Match, RegolePunteggio, StandingRow } from './types'
import { matchOutcome } from './matchOutcome'

function rigaVuota(teamId: string): StandingRow {
  return {
    teamId, giocate: 0, vinte: 0, perse: 0,
    setVinti: 0, setPersi: 0, puntiFatti: 0, puntiSubiti: 0,
  }
}

function quoziente(fatti: number, subiti: number): number {
  if (subiti === 0) return fatti === 0 ? 1 : Number.POSITIVE_INFINITY
  return fatti / subiti
}

export function computeStandings(
  teamIds: string[],
  matches: Match[],
  r: RegolePunteggio,
): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  teamIds.forEach((id) => rows.set(id, rigaVuota(id)))

  const validi = matches.filter(
    (m) =>
      m.stato === 'conclusa' &&
      m.teamAId && m.teamBId &&
      rows.has(m.teamAId) && rows.has(m.teamBId),
  )

  for (const m of validi) {
    const o = matchOutcome(m.set, r)
    if (!o.completa) continue
    const A = rows.get(m.teamAId as string)!
    const B = rows.get(m.teamBId as string)!
    A.giocate++; B.giocate++
    A.setVinti += o.setA; A.setPersi += o.setB
    B.setVinti += o.setB; B.setPersi += o.setA
    const puntiA = m.set.reduce((s, x) => s + x.puntiA, 0)
    const puntiB = m.set.reduce((s, x) => s + x.puntiB, 0)
    A.puntiFatti += puntiA; A.puntiSubiti += puntiB
    B.puntiFatti += puntiB; B.puntiSubiti += puntiA
    if (o.vincitore === 'A') { A.vinte++; B.perse++ } else { B.vinte++; A.perse++ }
  }

  // scontro diretto tra due squadre a pari punti
  function scontroDiretto(x: StandingRow, y: StandingRow): number {
    const m = validi.find(
      (mm) =>
        (mm.teamAId === x.teamId && mm.teamBId === y.teamId) ||
        (mm.teamAId === y.teamId && mm.teamBId === x.teamId),
    )
    if (!m) return 0
    const o = matchOutcome(m.set, r)
    const vincitoreId = o.vincitore === 'A' ? m.teamAId : m.teamBId
    if (vincitoreId === x.teamId) return -1
    if (vincitoreId === y.teamId) return 1
    return 0
  }

  return [...rows.values()].sort((a, b) => {
    if (b.vinte !== a.vinte) return b.vinte - a.vinte
    const qsA = quoziente(a.setVinti, a.setPersi)
    const qsB = quoziente(b.setVinti, b.setPersi)
    if (qsB !== qsA) return qsB - qsA
    const qpA = quoziente(a.puntiFatti, a.puntiSubiti)
    const qpB = quoziente(b.puntiFatti, b.puntiSubiti)
    if (qpB !== qpA) return qpB - qpA
    return scontroDiretto(a, b)
  })
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test -- standings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/standings.ts src/engine/standings.test.ts
git commit -m "feat(engine): classifiche con quozienti e scontro diretto"
```

---

### Task 6: Tabellone a eliminazione singola + avanzamento

**Files:**
- Create: `src/engine/bracket.ts`
- Test: `src/engine/bracket.test.ts`

**Interfaces:**
- Consumes: `BracketMatch` da `types.ts`.
- Produces:
  - `generateSingleElimination(teamIds: string[]): BracketMatch[]` — `teamIds` è già ordinato per testa di serie (1° = testa di serie 1). Padding a potenza di 2 con bye (`null`); seeding standard; partite dei round successivi con `teamAId/teamBId = null` collegate via `feedsMatchId`/`feedsSlot`.
  - `advanceWinner(bracket: BracketMatch[], matchId: string, winnerId: string): BracketMatch[]` — ritorna una nuova lista con il vincitore inserito nello slot della partita successiva.
  - `resolveByes(bracket: BracketMatch[]): BracketMatch[]` — fa avanzare automaticamente le squadre che al primo round hanno un bye.

- [ ] **Step 1: Scrivere i test**

Create `src/engine/bracket.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateSingleElimination, advanceWinner, resolveByes } from './bracket'

describe('generateSingleElimination', () => {
  it('4 squadre → 3 partite (2 semifinali + 1 finale)', () => {
    const b = generateSingleElimination(['A', 'B', 'C', 'D'])
    expect(b).toHaveLength(3)
    expect(b.filter((m) => m.round === 1)).toHaveLength(2)
    expect(b.filter((m) => m.round === 2)).toHaveLength(1)
  })

  it('testa di serie 1 e 2 si incontrano solo in finale', () => {
    const b = generateSingleElimination(['S1', 'S2', 'S3', 'S4'])
    const r1 = b.filter((m) => m.round === 1)
    // S1 non affronta S2 al primo round
    const insieme = r1.some(
      (m) =>
        (m.teamAId === 'S1' && m.teamBId === 'S2') ||
        (m.teamAId === 'S2' && m.teamBId === 'S1'),
    )
    expect(insieme).toBe(false)
  })

  it('3 squadre → padding a 4 con un bye', () => {
    const b = generateSingleElimination(['A', 'B', 'C'])
    const r1 = b.filter((m) => m.round === 1)
    const conBye = r1.filter((m) => m.teamAId === null || m.teamBId === null)
    expect(conBye).toHaveLength(1)
  })
})

describe('advanceWinner', () => {
  it('inserisce il vincitore nella partita successiva', () => {
    const b = generateSingleElimination(['A', 'B', 'C', 'D'])
    const semi = b.find((m) => m.round === 1)!
    const dopo = advanceWinner(b, semi.id, semi.teamAId as string)
    const finale = dopo.find((m) => m.id === semi.feedsMatchId)!
    const slot = semi.feedsSlot === 'A' ? finale.teamAId : finale.teamBId
    expect(slot).toBe(semi.teamAId)
  })
})

describe('resolveByes', () => {
  it('la squadra con bye al primo round avanza da sola', () => {
    const b = generateSingleElimination(['A', 'B', 'C']) // D = bye
    const risolto = resolveByes(b)
    const finale = risolto.find((m) => m.round === 2)!
    // uno dei due slot della finale è già occupato dalla squadra col bye
    expect(finale.teamAId !== null || finale.teamBId !== null).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `npm test -- bracket`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/bracket.ts`:
```ts
import type { BracketMatch } from './types'

function prossimaPotenzaDi2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// Ordine standard delle teste di serie per gli slot del tabellone.
function seedPositions(size: number): number[] {
  let pos = [1, 2]
  while (pos.length < size) {
    const sum = pos.length * 2 + 1
    const next: number[] = []
    for (const p of pos) {
      next.push(p)
      next.push(sum - p)
    }
    pos = next
  }
  return pos
}

export function generateSingleElimination(teamIds: string[]): BracketMatch[] {
  const n = teamIds.length
  if (n < 2) return []
  const size = prossimaPotenzaDi2(n)
  const slots = seedPositions(size).map((seed) => teamIds[seed - 1] ?? null)
  const totRound = Math.log2(size)
  const matches: BracketMatch[] = []

  // id deterministico
  const mid = (round: number, index: number) => `m-r${round}-i${index}`

  // Round 1
  for (let i = 0; i < size / 2; i++) {
    matches.push({
      id: mid(1, i),
      round: 1,
      index: i,
      teamAId: slots[i * 2],
      teamBId: slots[i * 2 + 1],
      feedsMatchId: totRound >= 2 ? mid(2, Math.floor(i / 2)) : null,
      feedsSlot: totRound >= 2 ? (i % 2 === 0 ? 'A' : 'B') : null,
    })
  }

  // Round successivi
  for (let round = 2; round <= totRound; round++) {
    const count = size / Math.pow(2, round)
    for (let i = 0; i < count; i++) {
      const isFinale = round === totRound
      matches.push({
        id: mid(round, i),
        round,
        index: i,
        teamAId: null,
        teamBId: null,
        feedsMatchId: isFinale ? null : mid(round + 1, Math.floor(i / 2)),
        feedsSlot: isFinale ? null : i % 2 === 0 ? 'A' : 'B',
      })
    }
  }

  return matches
}

export function advanceWinner(
  bracket: BracketMatch[],
  matchId: string,
  winnerId: string,
): BracketMatch[] {
  const m = bracket.find((x) => x.id === matchId)
  if (!m || !m.feedsMatchId) return bracket
  return bracket.map((x) => {
    if (x.id !== m.feedsMatchId) return x
    return m.feedsSlot === 'A' ? { ...x, teamAId: winnerId } : { ...x, teamBId: winnerId }
  })
}

export function resolveByes(bracket: BracketMatch[]): BracketMatch[] {
  let result = bracket
  for (const m of bracket.filter((x) => x.round === 1)) {
    const soloA = m.teamAId !== null && m.teamBId === null
    const soloB = m.teamBId !== null && m.teamAId === null
    if (soloA) result = advanceWinner(result, m.id, m.teamAId as string)
    else if (soloB) result = advanceWinner(result, m.id, m.teamBId as string)
  }
  return result
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test -- bracket`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/bracket.ts src/engine/bracket.test.ts
git commit -m "feat(engine): tabellone a eliminazione singola con seeding e bye"
```

---

### Task 7: Composizione gironi + qualificati al tabellone

**Files:**
- Create: `src/engine/groups.ts`
- Test: `src/engine/groups.test.ts`

**Interfaces:**
- Consumes: `StandingRow` da `types.ts`.
- Produces:
  - `splitIntoGroups(teamIds: string[], numeroGironi: number): string[][]` — distribuisce le squadre nei gironi a serpentina (snake) per bilanciare le teste di serie (input ordinato per seed).
  - `qualifiedTeams(standingsPerGirone: StandingRow[][], perGirone: number): string[]` — prende i primi `perGirone` di ogni girone e li ordina per l'ingresso nel tabellone (1° dei gironi, poi 2° dei gironi...).

- [ ] **Step 1: Scrivere i test**

Create `src/engine/groups.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { splitIntoGroups, qualifiedTeams } from './groups'
import type { StandingRow } from './types'

function row(teamId: string): StandingRow {
  return { teamId, giocate: 0, vinte: 0, perse: 0, setVinti: 0, setPersi: 0, puntiFatti: 0, puntiSubiti: 0 }
}

describe('splitIntoGroups', () => {
  it('8 squadre in 2 gironi → 4 e 4, a serpentina', () => {
    const g = splitIntoGroups(['1', '2', '3', '4', '5', '6', '7', '8'], 2)
    expect(g).toHaveLength(2)
    expect(g[0]).toHaveLength(4)
    expect(g[1]).toHaveLength(4)
    // snake: girone A = 1,4,5,8 ; girone B = 2,3,6,7
    expect(g[0]).toEqual(['1', '4', '5', '8'])
    expect(g[1]).toEqual(['2', '3', '6', '7'])
  })
})

describe('qualifiedTeams', () => {
  it('prende i primi 2 di ogni girone ordinati per posizione', () => {
    const gA = [row('A1'), row('A2'), row('A3')]
    const gB = [row('B1'), row('B2'), row('B3')]
    const q = qualifiedTeams([gA, gB], 2)
    // 1° dei gironi, poi 2° dei gironi
    expect(q).toEqual(['A1', 'B1', 'A2', 'B2'])
  })
})
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `npm test -- groups`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/groups.ts`:
```ts
import type { StandingRow } from './types'

export function splitIntoGroups(teamIds: string[], numeroGironi: number): string[][] {
  const gironi: string[][] = Array.from({ length: numeroGironi }, () => [])
  teamIds.forEach((id, i) => {
    const giro = Math.floor(i / numeroGironi)
    const posInGiro = i % numeroGironi
    // serpentina: righe pari da sinistra, dispari da destra
    const idx = giro % 2 === 0 ? posInGiro : numeroGironi - 1 - posInGiro
    gironi[idx].push(id)
  })
  return gironi
}

export function qualifiedTeams(
  standingsPerGirone: StandingRow[][],
  perGirone: number,
): string[] {
  const q: string[] = []
  for (let pos = 0; pos < perGirone; pos++) {
    for (const girone of standingsPerGirone) {
      if (girone[pos]) q.push(girone[pos].teamId)
    }
  }
  return q
}
```

- [ ] **Step 4: Eseguire i test**

Run: `npm test -- groups`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/groups.ts src/engine/groups.test.ts
git commit -m "feat(engine): gironi a serpentina e selezione qualificati"
```

---

### Task 8: Persistenza locale (Dexie) + export/import JSON

**Files:**
- Create: `src/db/database.ts`
- Create: `src/db/backup.ts`
- Test: `src/db/database.test.ts`
- Test: `src/db/backup.test.ts`
- Modify: `vitest.config.ts` (setup file per fake-indexeddb)
- Create: `src/db/test-setup.ts`

**Interfaces:**
- Consumes: `Tournament`, `Team`, `Group`, `Match` da `../engine/types`.
- Produces:
  - `db` — istanza Dexie con tabelle `tournaments`, `teams`, `groups`, `matches`.
  - `exportBackup(tournamentId: string): Promise<BackupData>` e `importBackup(data: BackupData): Promise<void>` in `backup.ts`, con tipo `BackupData = { tournament: Tournament; teams: Team[]; groups: Group[]; matches: Match[] }`.

- [ ] **Step 1: Configurare fake-indexeddb per i test**

Create `src/db/test-setup.ts`:
```ts
import 'fake-indexeddb/auto'
```

Modify `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/db/test-setup.ts'],
  },
})
```

- [ ] **Step 2: Scrivere il test del database**

Create `src/db/database.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Test', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('db', () => {
  beforeEach(async () => {
    await db.tournaments.clear()
  })

  it('salva e rilegge un torneo', async () => {
    await db.tournaments.put(torneo)
    const letto = await db.tournaments.get('t1')
    expect(letto?.nome).toBe('Test')
  })
})
```

- [ ] **Step 3: Eseguire il test (deve fallire)**

Run: `npm test -- database`
Expected: FAIL — modulo `./database` non trovato.

- [ ] **Step 4: Implementare il database**

Create `src/db/database.ts`:
```ts
import Dexie, { type Table } from 'dexie'
import type { Tournament, Team, Group, Match } from '../engine/types'

export class TorneiDB extends Dexie {
  tournaments!: Table<Tournament, string>
  teams!: Table<Team, string>
  groups!: Table<Group, string>
  matches!: Table<Match, string>

  constructor() {
    super('TorneiGen')
    this.version(1).stores({
      tournaments: 'id, stato, codiceIscrizione',
      teams: 'id, tournamentId, stato',
      groups: 'id, tournamentId',
      matches: 'id, tournamentId, groupId, fase, round',
    })
  }
}

export const db = new TorneiDB()
```

- [ ] **Step 5: Eseguire il test**

Run: `npm test -- database`
Expected: PASS.

- [ ] **Step 6: Scrivere il test di backup**

Create `src/db/backup.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import { exportBackup, importBackup } from './backup'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Test', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('backup', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })

  it('esporta e reimporta un torneo completo', async () => {
    await db.tournaments.put(torneo)
    const data = await exportBackup('t1')
    await db.tournaments.clear()
    await importBackup(data)
    const letto = await db.tournaments.get('t1')
    expect(letto?.nome).toBe('Test')
  })
})
```

- [ ] **Step 7: Eseguire il test (deve fallire)**

Run: `npm test -- backup`
Expected: FAIL — modulo `./backup` non trovato.

- [ ] **Step 8: Implementare backup**

Create `src/db/backup.ts`:
```ts
import { db } from './database'
import type { Tournament, Team, Group, Match } from '../engine/types'

export interface BackupData {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  matches: Match[]
}

export async function exportBackup(tournamentId: string): Promise<BackupData> {
  const tournament = await db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Torneo ${tournamentId} non trovato`)
  const [teams, groups, matches] = await Promise.all([
    db.teams.where('tournamentId').equals(tournamentId).toArray(),
    db.groups.where('tournamentId').equals(tournamentId).toArray(),
    db.matches.where('tournamentId').equals(tournamentId).toArray(),
  ])
  return { tournament, teams, groups, matches }
}

export async function importBackup(data: BackupData): Promise<void> {
  await db.transaction('rw', db.tournaments, db.teams, db.groups, db.matches, async () => {
    await db.tournaments.put(data.tournament)
    await db.teams.bulkPut(data.teams)
    await db.groups.bulkPut(data.groups)
    await db.matches.bulkPut(data.matches)
  })
}
```

- [ ] **Step 9: Eseguire tutti i test**

Run: `npm test`
Expected: PASS — tutti i test (engine + db) verdi.

- [ ] **Step 10: Commit**

```bash
git add src/db vitest.config.ts
git commit -m "feat(db): persistenza IndexedDB con Dexie ed export/import JSON"
```

---

## Self-Review (già eseguita in fase di scrittura)

- **Copertura spec (Fase 1):** tipi di dominio ✓ (Task 2); round robin per girone all'italiana e gironi ✓ (Task 3); esito partita da regole configurabili ✓ (Task 4); classifiche con quozienti e scontro diretto ✓ (Task 5); eliminazione singola con seeding e bye ✓ (Task 6); composizione gironi+qualificati ✓ (Task 7); persistenza locale + JSON ✓ (Task 8). Fuori da questo piano (per design): UI, iscrizioni online/Supabase, eliminazione doppia, King of the Court → Piani 2–4.
- **Placeholder:** nessuno; ogni step ha codice o comando reale.
- **Consistenza tipi:** `BracketMatch`, `StandingRow`, `Pairing`, `RegolePunteggio`, `Match` usati coerentemente tra i task; `matchOutcome` ritorna `{ vincitore, setA, setB, completa }` usato da `standings.ts`.

## Prossimi piani

- **Piano 2 — UI organizzatore:** setup torneo, gestione squadre, generazione (che combina i moduli engine in record `Match`/`Group` persistiti), viste calendario/tabellone, inserimento punteggi, classifiche.
- **Piano 3 — Iscrizioni online:** PWA pubblica (form 2/4–8 giocatori), tabella Supabase `registrations` + RLS, import nella modalità organizzatore.
- **Piano 4 — Motori avanzati:** eliminazione doppia e King of the Court.
