# TorneiGen — Piano Fase 6b: gironi → fase finale (diretta/doppia)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare il formato "gironi + eliminazione": dai risultati dei gironi generare la fase a eliminazione (diretta o doppia) sui qualificati, con un'azione dedicata.

**Architecture:** Config sul `Tournament` (`faseFinale`, `qualificatiPerGirone`). Un servizio `generaFaseFinale` calcola le classifiche dei gironi, prende i qualificati (`qualifiedTeams`) e genera il tabellone (`generateSingleElimination` o `generateDoubleElimination`), aggiungendolo ai match esistenti. La `BracketScreen` mostra un'azione "Genera fase finale" e poi il tabellone (riuso della resa esistente).

**Tech Stack:** TypeScript, Vitest, React (invariati). Nota: la suite completa è flaky in questo ambiente (timeout worker) — verificare con run mirati + tsc + build.

## Global Constraints

- TypeScript strict. `src/engine/` puro. UI usa i servizi. Styling solo token; nessun hex nuovo. Copy italiano.
- Fase finale **doppia** richiede un numero di qualificati **potenza di 2** (la doppia non gestisce i bye); errore chiaro altrimenti. La **diretta** accetta qualsiasi numero (bye alle teste di serie).
- I match dei gironi restano; la fase finale **aggiunge** i match `fase: 'tabellone'`.
- Commit frequenti, uno per task.

## File Structure

```
src/engine/types.ts               # + faseFinale?/qualificatiPerGirone? su Tournament
src/services/faseFinale.ts         # generaFaseFinale
src/services/faseFinale.test.ts
src/screens/SetupScreen.tsx        # config fase finale (per gironi_eliminazione)
src/screens/BracketScreen.tsx      # azione "Genera fase finale"
```

---

### Task 1: Config tipi + Setup

**Files:**
- Modify: `src/engine/types.ts`, `src/screens/SetupScreen.tsx`
- Test: `src/screens/SetupScreen.test.tsx` (adeguare se serve)

**Interfaces:**
- Produces: su `Tournament` i campi opzionali `faseFinale?: 'diretta' | 'doppia'` e
  `qualificatiPerGirone?: number | 'tutti'`. Nel Setup, **solo quando `formato === 'gironi_eliminazione'`**,
  mostrare una sezione "Fase finale": selettore fase finale (diretta/doppia) e qualificati per girone
  (numero, con opzione "tutti"). Default: `diretta`, `tutti`.

- [ ] **Step 1: Tipi**

In `src/engine/types.ts`, aggiungere a `Tournament`:
```ts
  faseFinale?: 'diretta' | 'doppia'
  qualificatiPerGirone?: number | 'tutti'
```

- [ ] **Step 2: Setup**

In `SetupScreen.tsx`, quando `formato === 'gironi_eliminazione'`, aggiungere una sezione "Fase finale":
- selettore **Fase finale**: opzioni "Eliminazione diretta" (`diretta`) e "Eliminazione doppia" (`doppia`)
- **Qualificati per girone**: un campo che accetta un numero oppure "tutti" (es. un select con "Tutti" + numeri 1..4, o un input con checkbox "tutti"). Default "tutti".
Salvare `faseFinale` e `qualificatiPerGirone` nel `Tournament` alla submit. Riuso `Field`/`Button`, token.
Nota: mostrare un aiuto che la doppia richiede un numero di qualificati potenza di 2.

- [ ] **Step 3: Verificare**

Run: `npm test -- SetupScreen` → PASS. `npx tsc --noEmit -p tsconfig.app.json` (e `worker/tsconfig.json`) pulito; `npm run build` ok.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/screens/SetupScreen.tsx src/screens/SetupScreen.test.tsx
git commit -m "feat(ui): configurazione fase finale (diretta/doppia, qualificati)"
```

---

### Task 2: Servizio `generaFaseFinale`

**Files:**
- Create: `src/services/faseFinale.ts`
- Test: `src/services/faseFinale.test.ts`

**Interfaces:**
- Consumes: `getTournament`, `groupsOf`, `matchesOf`, `db.matches`; `classificaGirone` (services/standings);
  `qualifiedTeams` (engine/groups); `generateSingleElimination`+`resolveByes`, `generateDoubleElimination`;
  `newId`.
- Produces: `generaFaseFinale(tournamentId: string): Promise<number>` — verifica gironi conclusi, calcola
  classifiche, prende i qualificati, genera il tabellone (diretta o doppia), **sostituisce** eventuali
  match `fase:'tabellone'` esistenti e li aggiunge (i gironi restano). Ritorna il numero di match della
  fase finale. Errori chiari: nessun girone, gironi non conclusi, doppia con qualificati non potenza di 2.

- [ ] **Step 1: Scrivere i test**

Create `src/services/faseFinale.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { generaFaseFinale } from './faseFinale'
import type { Tournament, Team, Group, Match } from '../engine/types'

function torneo(over: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1', nome: 'C', tipologia: '2x2', formato: 'gironi_eliminazione', data: '2026-09-01', stato: 'in_corso',
    regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
    faseFinale: 'diretta', qualificatiPerGirone: 'tutti', ...over,
  }
}
function team(id: string): Team { return { id, tournamentId: 't1', nome: id, players: [], stato: 'confermata', origine: 'manuale' } }
function girone(id: string, teamIds: string[]): Group { return { id, tournamentId: 't1', nome: id, teamIds } }
function matchGirone(id: string, groupId: string, a: string, b: string, pa: number, pb: number): Match {
  return { id, tournamentId: 't1', fase: 'girone', groupId, round: 1, teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }], vincitoreId: pa > pb ? a : b, stato: 'conclusa' }
}

describe('generaFaseFinale', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()]) })

  async function seed(over: Partial<Tournament> = {}) {
    await saveTournament(torneo(over))
    await db.teams.bulkPut(['A', 'B', 'C', 'D'].map(team))
    await db.groups.bulkPut([girone('g1', ['A', 'B']), girone('g2', ['C', 'D'])])
    await db.matches.bulkPut([matchGirone('m1', 'g1', 'A', 'B', 21, 10), matchGirone('m2', 'g2', 'C', 'D', 21, 12)])
  }

  it('diretta: genera un tabellone dai qualificati dei gironi', async () => {
    await seed({ faseFinale: 'diretta' })
    const n = await generaFaseFinale('t1')
    expect(n).toBeGreaterThan(0)
    const tab = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
    expect(tab.length).toBeGreaterThan(0)
  })

  it('doppia con 4 qualificati (potenza di 2): genera vincenti/perdenti/finale', async () => {
    await seed({ faseFinale: 'doppia', qualificatiPerGirone: 'tutti' })
    await generaFaseFinale('t1')
    const tab = (await db.matches.where('tournamentId').equals('t1').toArray())
    expect(tab.some((m) => m.tabelloneTipo === 'vincenti')).toBe(true)
    expect(tab.some((m) => m.tabelloneTipo === 'perdenti')).toBe(true)
  })

  it('errore se i gironi non sono conclusi', async () => {
    await seed()
    await db.matches.put({ id: 'm3', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' })
    await expect(generaFaseFinale('t1')).rejects.toThrow(/concludi|gironi/i)
  })

  it('doppia con qualificati non potenza di 2 → errore', async () => {
    // 3 gironi con 1 qualificato ciascuno = 3 (non potenza di 2). Qui: 1 qualificato per girone su 2 gironi = 2 (pow2), quindi forziamo 1 girone con dispari.
    await saveTournament(torneo({ faseFinale: 'doppia', qualificatiPerGirone: 1 }))
    await db.teams.bulkPut(['A', 'B', 'C'].map(team))
    await db.groups.bulkPut([girone('g1', ['A', 'B', 'C'])])
    await db.matches.bulkPut([
      matchGirone('m1', 'g1', 'A', 'B', 21, 10), matchGirone('m2', 'g1', 'A', 'C', 21, 11), matchGirone('m3', 'g1', 'B', 'C', 21, 12),
    ])
    // 1 girone × 1 qualificato = 1 qualificato → non potenza di 2 valida per la doppia
    await expect(generaFaseFinale('t1')).rejects.toThrow(/potenza di 2/i)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- faseFinale`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/services/faseFinale.ts`:
```ts
import { db } from '../db/database'
import { getTournament, groupsOf, matchesOf } from '../db/repositories'
import { classificaGirone } from './standings'
import { qualifiedTeams } from '../engine/groups'
import { generateSingleElimination, resolveByes } from '../engine/bracket'
import { generateDoubleElimination } from '../engine/doubleElimination'
import type { Match } from '../engine/types'

const isPotenzaDi2 = (n: number): boolean => n >= 2 && (n & (n - 1)) === 0

export async function generaFaseFinale(tournamentId: string): Promise<number> {
  const torneo = await getTournament(tournamentId)
  if (!torneo) throw new Error('Torneo non trovato')

  const groups = await groupsOf(tournamentId)
  const matches = await matchesOf(tournamentId)
  const gironi = matches.filter((m) => m.fase === 'girone')
  if (gironi.length === 0) throw new Error('Nessun girone da cui generare la fase finale.')
  if (!gironi.every((m) => m.stato === 'conclusa')) {
    throw new Error('Concludi tutte le partite dei gironi prima di generare la fase finale.')
  }

  const classifiche = groups.map((g) => classificaGirone(g, matches, torneo.regolePunteggio))
  const perGirone =
    torneo.qualificatiPerGirone === 'tutti' || torneo.qualificatiPerGirone == null
      ? Math.max(...classifiche.map((c) => c.length))
      : torneo.qualificatiPerGirone
  const ids = qualifiedTeams(classifiche, perGirone)

  let tabellone: Match[]
  if (torneo.faseFinale === 'doppia') {
    if (!isPotenzaDi2(ids.length)) {
      throw new Error(
        `La fase finale doppia richiede un numero di qualificati potenza di 2 (attuali: ${ids.length}). Riduci i qualificati per girone o usa la diretta.`,
      )
    }
    const bracket = generateDoubleElimination(ids)
    tabellone = bracket.map((bm) => ({
      id: bm.id, tournamentId, fase: 'tabellone', tabelloneTipo: bm.tabelloneTipo,
      round: bm.round, posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
      set: [], stato: 'programmata', vincitoreVerso: bm.winnerFeeds, perdenteVerso: bm.loserFeeds,
    }))
  } else {
    const bracket = resolveByes(generateSingleElimination(ids))
    tabellone = bracket.map((bm) => ({
      id: bm.id, tournamentId, fase: 'tabellone', round: bm.round,
      posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId, set: [], stato: 'programmata',
    }))
  }

  // sostituisce eventuali match tabellone esistenti (rigenerazione), lascia i gironi
  const esistentiTab = matches.filter((m) => m.fase === 'tabellone').map((m) => m.id)
  await db.transaction('rw', db.matches, async () => {
    if (esistentiTab.length) await db.matches.bulkDelete(esistentiTab)
    await db.matches.bulkPut(tabellone)
  })
  return tabellone.length
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- faseFinale`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/faseFinale.ts src/services/faseFinale.test.ts
git commit -m "feat(services): genera fase finale (diretta/doppia) dai qualificati dei gironi"
```

---

### Task 3: Azione "Genera fase finale" nella BracketScreen

**Files:**
- Modify: `src/screens/BracketScreen.tsx`
- Test: `src/screens/BracketScreen.test.tsx` (nuovo caso)

**Interfaces:**
- Consumes: `generaFaseFinale` (Task 2), `useToast`, `matchesOf`, `useLiveQuery`.
- Produces: per il formato `gironi_eliminazione`, quando esistono match di girone tutti conclusi e non
  c'è ancora un tabellone, un bottone **"Genera fase finale"** che chiama `generaFaseFinale(id)` (con
  toast e gestione errore, es. gironi non conclusi / doppia non potenza di 2). Dopo la generazione, la
  vista mostra il tabellone (resa già esistente per vincenti/perdenti/finale o single-elim).

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/BracketScreen.test.tsx` un caso: torneo `gironi_eliminazione` con gironi
conclusi → click "Genera fase finale" → compaiono match `fase:'tabellone'` in db. Adeguare al
`beforeEach`/wrapper esistenti (ToastProvider se serve).
```ts
it('gironi+eliminazione: genera la fase finale dai gironi', async () => {
  await db.tournaments.update('t1', { formato: 'gironi_eliminazione', faseFinale: 'diretta', qualificatiPerGirone: 'tutti' })
  await db.groups.bulkPut([{ id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['A', 'B'] }])
  await db.matches.bulkPut([
    { id: 'gm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' },
  ])
  render(/* ... BracketScreen su /tornei/t1/tabellone, con ToastProvider ... */)
  await userEvent.click(await screen.findByRole('button', { name: /genera fase finale/i }))
  await waitFor(async () => {
    const tab = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
    expect(tab.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- BracketScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

In `BracketScreen.tsx`: per `torneo.formato === 'gironi_eliminazione'`, se esistono match di girone tutti
`conclusa` e non ci sono match `fase:'tabellone'`, mostrare il bottone **"Genera fase finale"** che chiama
`generaFaseFinale(id)` in un handler con try/catch → toast successo ("Fase finale generata") o errore (il
messaggio dell'eccezione, es. gironi non conclusi / doppia non potenza di 2). Grazie a `useLiveQuery`, dopo
la generazione la vista mostra il tabellone (la resa dei match `tabellone`/`tabelloneTipo` è già presente).
Stile con token. Non rimuovere la resa dei gironi.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- BracketScreen` → PASS (tutti i casi). `npx tsc --noEmit -p tsconfig.app.json` pulito; `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/BracketScreen.test.tsx
git commit -m "feat(ui): azione genera fase finale dai gironi"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (6b):** config faseFinale/qualificatiPerGirone → Task 1; servizio generaFaseFinale
  (classifiche→qualificati→tabellone diretta/doppia, guard potenza-di-2, gironi conclusi) → Task 2;
  azione UI → Task 3.
- **Placeholder:** servizio con codice completo e test reali; task UI con contratto, comportamento, test.
- **Consistenza:** `generaFaseFinale` riusa `classificaGirone`/`qualifiedTeams`/`generateSingleElimination`/
  `generateDoubleElimination`; mappa doppia con `tabelloneTipo`/`vincitoreVerso`/`perdenteVerso` (inclusa la
  golden, generata dalla doppia); i match tabellone si aggiungono ai gironi.

## Note per l'esecuzione

- "tutti" come qualificati → `perGirone` = numero massimo di squadre in un girone (tutti passano, ordinati
  per posizione via `qualifiedTeams`). Per la doppia il totale deve essere potenza di 2.
- La suite completa è flaky in questo ambiente (timeout worker che droppano file): verificare con run mirati
  (`npm test -- faseFinale`, `-- BracketScreen`) + tsc + build.
