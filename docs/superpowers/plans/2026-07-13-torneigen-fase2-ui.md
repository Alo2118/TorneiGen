# TorneiGen — Piano Fase 2: UI organizzatore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la UI dell'organizzatore (responsive, pulita e neutra) sopra il motore e la persistenza della Fase 1: gestione tornei/squadre, generazione gironi/tabelloni, inserimento punteggi e classifiche, tutto offline.

**Architecture:** Un livello `src/services/` fa da ponte puro-motore ↔ db (genera match/gruppi, salva risultati e propaga l'avanzamento del tabellone, calcola classifiche al volo). La UI React usa `dexie-react-hooks` (`useLiveQuery`) per reattività automatica sul db, `react-router-dom` per la navigazione. Design system via CSS custom properties (token) + font self-hosted `@fontsource` per l'offline.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom, dexie-react-hooks, @fontsource/inter, @fontsource/space-grotesk, Vitest (+ jsdom, @testing-library/react) — il tutto già in un progetto Vite dalla Fase 1.

## Global Constraints

- TypeScript strict. `src/engine/` resta **puro** (nessun import da db/UI/servizi). `src/services/` può importare `../engine/*` e `../db/*`. La UI (`src/ui/` o `src/screens/`+`src/components/`) NON contiene logica di dominio: chiama i services.
- Design token (usare ESATTAMENTE questi valori, definiti come CSS custom properties in `src/styles/tokens.css`):
  `--paper:#FBFCFD; --surface:#FFFFFF; --ink:#0F1B2A; --muted:#667085; --line:#E4E9EF; --sea:#0E9AA7; --sand:#E6A93C; --win:#16A34A; --danger:#DC2626`.
- Tipografia: display/numeri **Space Grotesk**, corpo/UI **Inter**, entrambi via `@fontsource` (offline, nessun fetch a runtime). Numeri con `font-variant-numeric: tabular-nums`.
- Tipologie: `2x2` = esattamente 2 giocatori; `4x4` = da 4 a 8 giocatori. Ogni giocatore: nome, cognome, email, telefono. La UI valida il numero di giocatori secondo la tipologia (il motore no).
- Regole punteggio interamente configurabili per torneo; i default mostrati sono modificabili.
- KotC (`king_of_the_court`): selezionabile ma **generazione disabilitata** con nota "disponibile a breve" (motore in Fase 4). Eliminazione doppia: fuori scope Fase 2.
- Quality floor: responsive fino a mobile, focus tastiera visibile, `prefers-reduced-motion` rispettato.
- Copy in italiano, sentence case, verbi attivi (es. "Salva", "Genera", "Nuovo torneo").
- Commit frequenti, uno per task.

## File Structure

```
src/
  styles/tokens.css          # design token + reset + tipografia base
  services/
    generation.ts            # genera gruppi/match dal formato
    results.ts               # salva risultato + propaga tabellone
    standings.ts             # helper classifiche (wrap engine)
    ids.ts                   # helper id match/gruppo deterministici (se serve)
  db/repositories.ts         # (nuovo) query riusabili sul db per torneo
  components/                # componenti riusabili (Button, Field, ScoreControl, ...)
  screens/                   # una cartella/file per schermata
  app/
    App.tsx                  # shell + router
    AppShell.tsx             # rail/bottom-bar + header torneo
  main.tsx                   # entrypoint (import token css + fonts)
```

---

### Task 1: Fondazione design system + dipendenze + pulizia scaffold

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/main.tsx` (import token + font), `index.html` (titolo), `package.json` (deps)
- Delete: `src/App.css`, contenuto starter di `src/App.tsx` (sostituito da placeholder), `src/assets/react.svg` se inutile
- Test: `src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: token CSS globali disponibili; font offline; app che builda con una shell placeholder.

- [ ] **Step 1: Installare le dipendenze**

Run:
```bash
npm install react-router-dom dexie-react-hooks @fontsource/inter @fontsource/space-grotesk
npm install -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Creare i token e la base tipografica**

Create `src/styles/tokens.css`:
```css
:root {
  --paper: #FBFCFD;
  --surface: #FFFFFF;
  --ink: #0F1B2A;
  --muted: #667085;
  --line: #E4E9EF;
  --sea: #0E9AA7;
  --sand: #E6A93C;
  --win: #16A34A;
  --danger: #DC2626;

  --radius: 10px;
  --space: 8px;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-display: 'Space Grotesk', 'Inter', sans-serif;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, .display { font-family: var(--font-display); letter-spacing: -0.01em; }
.tnum { font-variant-numeric: tabular-nums; }
:focus-visible { outline: 2px solid var(--sea); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```

- [ ] **Step 3: Cablare font e token nell'entrypoint**

Modify `src/main.tsx` — assicurarsi che in cima ci siano:
```ts
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import './styles/tokens.css'
```
Rimuovere l'import di `./index.css` e `./App.css` se presenti (spostata la base in tokens.css). Sostituire il contenuto di `src/App.tsx` con un placeholder minimale:
```tsx
export default function App() {
  return <div className="display">TorneiGen</div>
}
```
Aggiornare `index.html` `<title>` in `TorneiGen`. Eliminare `src/App.css`.

- [ ] **Step 4: Test di presenza token**

Create `src/styles/tokens.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('tokens.css', () => {
  it('definisce i token di colore richiesti', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
    for (const t of ['--paper', '--surface', '--ink', '--muted', '--line', '--sea', '--sand', '--win', '--danger']) {
      expect(css).toContain(t)
    }
  })
})
```

- [ ] **Step 5: Configurare jsdom per i test dei componenti**

Modify `vitest.config.ts` per usare jsdom di default e caricare jest-dom. Aggiornare a:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/db/test-setup.ts', 'src/test/setup-dom.ts'],
  },
})
```
Create `src/test/setup-dom.ts`:
```ts
import '@testing-library/jest-dom'
```
Nota: i test motore restano validi in jsdom (non usano DOM); `fake-indexeddb` resta caricato via il setup esistente.

- [ ] **Step 6: Eseguire i test e il build**

Run: `npm test` — tutti verdi (motore + db + tokens).
Run: `npx tsc --noEmit -p tsconfig.app.json` — pulito.
Run: `npm run build` — build ok.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): fondazione design system, font offline, setup jsdom"
```

---

### Task 2: Repository db per torneo

**Files:**
- Create: `src/db/repositories.ts`
- Test: `src/db/repositories.test.ts`

**Interfaces:**
- Consumes: `db` da `./database`; tipi da `../engine/types`.
- Produces:
  - `listTournaments(): Promise<Tournament[]>`
  - `getTournament(id): Promise<Tournament | undefined>`
  - `saveTournament(t: Tournament): Promise<void>`
  - `teamsOf(tournamentId): Promise<Team[]>`
  - `groupsOf(tournamentId): Promise<Group[]>`
  - `matchesOf(tournamentId): Promise<Match[]>`
  - `matchesOfGroup(groupId): Promise<Match[]>`
  - `replaceGenerated(tournamentId, groups: Group[], matches: Match[]): Promise<void>` — cancella gironi/match esistenti del torneo e inserisce i nuovi (rigenerazione).

- [ ] **Step 1: Scrivere i test**

Create `src/db/repositories.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import { saveTournament, listTournaments, teamsOf, replaceGenerated, matchesOf } from './repositories'
import type { Tournament, Team, Match, Group } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('repositories', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })

  it('salva ed elenca i tornei', async () => {
    await saveTournament(t)
    const all = await listTournaments()
    expect(all.map((x) => x.id)).toEqual(['t1'])
  })

  it('replaceGenerated sostituisce gironi e match del torneo', async () => {
    const g: Group = { id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['x', 'y'] }
    const m: Match = { id: 'm1', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'x', teamBId: 'y', set: [], stato: 'programmata' }
    await replaceGenerated('t1', [g], [m])
    expect((await matchesOf('t1')).map((x) => x.id)).toEqual(['m1'])
    // rigenerando con liste vuote, si svuota
    await replaceGenerated('t1', [], [])
    expect(await matchesOf('t1')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- repositories`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/db/repositories.ts`:
```ts
import { db } from './database'
import type { Tournament, Team, Group, Match } from '../engine/types'

export const listTournaments = (): Promise<Tournament[]> => db.tournaments.toArray()
export const getTournament = (id: string): Promise<Tournament | undefined> => db.tournaments.get(id)
export const saveTournament = async (t: Tournament): Promise<void> => { await db.tournaments.put(t) }

export const teamsOf = (tournamentId: string): Promise<Team[]> =>
  db.teams.where('tournamentId').equals(tournamentId).toArray()
export const groupsOf = (tournamentId: string): Promise<Group[]> =>
  db.groups.where('tournamentId').equals(tournamentId).toArray()
export const matchesOf = (tournamentId: string): Promise<Match[]> =>
  db.matches.where('tournamentId').equals(tournamentId).toArray()
export const matchesOfGroup = (groupId: string): Promise<Match[]> =>
  db.matches.where('groupId').equals(groupId).toArray()

export async function replaceGenerated(
  tournamentId: string,
  groups: Group[],
  matches: Match[],
): Promise<void> {
  await db.transaction('rw', db.groups, db.matches, async () => {
    await db.groups.where('tournamentId').equals(tournamentId).delete()
    await db.matches.where('tournamentId').equals(tournamentId).delete()
    if (groups.length) await db.groups.bulkPut(groups)
    if (matches.length) await db.matches.bulkPut(matches)
  })
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- repositories`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories.ts src/db/repositories.test.ts
git commit -m "feat(db): repository query per torneo"
```

---

### Task 3: Service di generazione

**Files:**
- Create: `src/services/generation.ts`
- Test: `src/services/generation.test.ts`

**Interfaces:**
- Consumes: engine `generateRoundRobin`, `generateSingleElimination`, `resolveByes`, `splitIntoGroups`; `newId`; tipi.
- Produces:
  - `type EsitoGenerazione = { groups: Group[]; matches: Match[] }`
  - `generaTorneo(torneo: Tournament, teams: Team[]): EsitoGenerazione` — funzione **pura** (non scrive su db; ritorna gruppi+match da persistere con `replaceGenerated`). Mappa i risultati del motore in record `Group`/`Match`. Lancia `Error('King of the Court non ancora disponibile')` per `king_of_the_court`. Per `gironi_eliminazione` genera i gironi + round robin (la fase finale è azione separata, non qui). Usa le teste di serie (`testaDiSerie`) per ordinare le squadre in ingresso all'eliminazione diretta.

- [ ] **Step 1: Scrivere i test**

Create `src/services/generation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generaTorneo } from './generation'
import type { Tournament, Team } from '../engine/types'

function team(id: string, seed?: number): Team {
  return { id, tournamentId: 't1', nome: id, players: [], testaDiSerie: seed, stato: 'confermata', origine: 'manuale' }
}
const base: Omit<Tournament, 'formato'> = {
  id: 't1', nome: 'T', tipologia: '2x2', data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('generaTorneo', () => {
  it('girone all\'italiana: un girone, round robin completo', () => {
    const t = { ...base, formato: 'girone_italiana' as const }
    const teams = ['A', 'B', 'C', 'D'].map((x) => team(x))
    const { groups, matches } = generaTorneo(t, teams)
    expect(groups).toHaveLength(1)
    expect(matches.filter((m) => m.fase === 'girone')).toHaveLength(6)
    expect(matches.every((m) => m.tournamentId === 't1')).toBe(true)
  })

  it('eliminazione diretta: match di tabellone secondo le teste di serie', () => {
    const t = { ...base, formato: 'eliminazione_diretta' as const }
    const teams = [team('S1', 1), team('S2', 2), team('S3', 3), team('S4', 4)]
    const { matches } = generaTorneo(t, teams)
    const tab = matches.filter((m) => m.fase === 'tabellone')
    expect(tab.length).toBe(3) // 2 semifinali + finale
    // S1 e S2 non si incontrano al primo round
    const r1 = tab.filter((m) => m.round === 1)
    const insieme = r1.some((m) => [m.teamAId, m.teamBId].includes('S1') && [m.teamAId, m.teamBId].includes('S2'))
    expect(insieme).toBe(false)
  })

  it('gironi + eliminazione: più gironi con round robin', () => {
    const t = { ...base, formato: 'gironi_eliminazione' as const }
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((x) => team(x))
    const { groups } = generaTorneo(t, teams)
    expect(groups.length).toBeGreaterThan(1)
  })

  it('King of the Court non è ancora supportato', () => {
    const t = { ...base, formato: 'king_of_the_court' as const }
    expect(() => generaTorneo(t, [team('A')])).toThrow(/King of the Court/i)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- generation`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/services/generation.ts`:
```ts
import type { Tournament, Team, Group, Match } from '../engine/types'
import { generateRoundRobin } from '../engine/roundRobin'
import { generateSingleElimination, resolveByes } from '../engine/bracket'
import { splitIntoGroups } from '../engine/groups'
import { newId } from '../engine/id'

export interface EsitoGenerazione {
  groups: Group[]
  matches: Match[]
}

const NUM_GIRONI_DEFAULT = 2

function matchGirone(t: Tournament, groupId: string, round: number, a: string | null, b: string | null): Match {
  return {
    id: newId(), tournamentId: t.id, fase: 'girone', groupId, round,
    teamAId: a, teamBId: b, set: [], stato: 'programmata',
  }
}

function roundRobinIntoGroup(t: Tournament, group: Group): Match[] {
  return generateRoundRobin(group.teamIds)
    .filter((p) => p.teamAId !== null && p.teamBId !== null) // salta i bye
    .map((p) => matchGirone(t, group.id, p.round, p.teamAId, p.teamBId))
}

function gironi(t: Tournament, teams: Team[], numeroGironi: number): EsitoGenerazione {
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const gruppiIds = splitIntoGroups(ids, numeroGironi)
  const groups: Group[] = gruppiIds.map((teamIds, i) => ({
    id: newId(), tournamentId: t.id, nome: `Girone ${String.fromCharCode(65 + i)}`, teamIds,
  }))
  const matches = groups.flatMap((g) => roundRobinIntoGroup(t, g))
  return { groups, matches }
}

function eliminazioneDiretta(t: Tournament, teams: Team[]): EsitoGenerazione {
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const bracket = resolveByes(generateSingleElimination(ids))
  const matches: Match[] = bracket.map((bm) => ({
    id: bm.id, tournamentId: t.id, fase: 'tabellone', round: bm.round,
    posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
    set: [], stato: 'programmata',
  }))
  return { groups: [], matches }
}

export function generaTorneo(torneo: Tournament, teams: Team[]): EsitoGenerazione {
  switch (torneo.formato) {
    case 'girone_italiana': {
      const group: Group = { id: newId(), tournamentId: torneo.id, nome: 'Girone unico', teamIds: teams.map((t) => t.id) }
      return { groups: [group], matches: roundRobinIntoGroup(torneo, group) }
    }
    case 'gironi_eliminazione':
      return gironi(torneo, teams, NUM_GIRONI_DEFAULT)
    case 'eliminazione_diretta':
      return eliminazioneDiretta(torneo, teams)
    case 'king_of_the_court':
      throw new Error('King of the Court non ancora disponibile')
    default:
      throw new Error(`Formato non gestito: ${torneo.formato}`)
  }
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- generation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/generation.ts src/services/generation.test.ts
git commit -m "feat(services): generazione gironi/tabellone dal formato"
```

---

### Task 4: Service risultati + avanzamento tabellone

**Files:**
- Create: `src/services/results.ts`
- Test: `src/services/results.test.ts`

**Interfaces:**
- Consumes: engine `matchOutcome`; tipi.
- Produces:
  - `applicaRisultato(match: Match, set: SetScore[], regole: RegolePunteggio): Match` — ritorna il match aggiornato con `set`, `vincitoreId` e `stato` (`conclusa` se completo, altrimenti `in_corso`/`programmata`). Puro.
  - `propagaTabellone(matches: Match[], regole: RegolePunteggio): Match[]` — dato l'insieme dei match `fase: 'tabellone'`, **ricalcola da zero** gli slot dei round successivi (round crescente, vincitore del match indice `i` → round+1 indice `floor(i/2)`, slot A se `i` pari altrimenti B). Gestisce la ri-modifica di un risultato già inserito. Puro. Non tocca i match di girone.

- [ ] **Step 1: Scrivere i test**

Create `src/services/results.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applicaRisultato, propagaTabellone } from './results'
import type { Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

function tab(id: string, round: number, index: number, a: string | null, b: string | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}

describe('applicaRisultato', () => {
  it('imposta vincitore e stato conclusa quando completo', () => {
    const m = tab('m', 1, 0, 'A', 'B')
    const out = applicaRisultato(m, [{ puntiA: 21, puntiB: 15 }], r)
    expect(out.vincitoreId).toBe('A')
    expect(out.stato).toBe('conclusa')
  })
  it('resta in corso se incompleto', () => {
    const bo3: RegolePunteggio = { ...r, setAlMeglioDi: 3 }
    const m = tab('m', 1, 0, 'A', 'B')
    const out = applicaRisultato(m, [{ puntiA: 21, puntiB: 10 }], bo3)
    expect(out.vincitoreId == null).toBe(true)
    expect(out.stato).toBe('in_corso')
  })
})

describe('propagaTabellone', () => {
  it('fa avanzare i vincitori al round successivo', () => {
    const semi1 = { ...tab('s1', 1, 0, 'A', 'B'), set: [{ puntiA: 21, puntiB: 15 }], vincitoreId: 'A', stato: 'conclusa' as const }
    const semi2 = { ...tab('s2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = tab('f', 2, 0, null, null)
    const out = propagaTabellone([semi1, semi2, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('A')
    expect(f.teamBId).toBe('C')
  })
  it('ricalcola correttamente dopo la modifica di un risultato', () => {
    const semi1 = { ...tab('s1', 1, 0, 'A', 'B'), set: [{ puntiA: 15, puntiB: 21 }], vincitoreId: 'B', stato: 'conclusa' as const }
    const semi2 = { ...tab('s2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = { ...tab('f', 2, 0, 'A', 'C'), } // conteneva il vecchio vincitore A
    const out = propagaTabellone([semi1, semi2, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('B') // ricalcolato dal nuovo risultato
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- results`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/services/results.ts`:
```ts
import type { Match, SetScore, RegolePunteggio } from '../engine/types'
import { matchOutcome } from '../engine/matchOutcome'

export function applicaRisultato(match: Match, set: SetScore[], regole: RegolePunteggio): Match {
  const o = matchOutcome(set, regole)
  const vincitoreId = o.vincitore === 'A' ? match.teamAId : o.vincitore === 'B' ? match.teamBId : null
  return {
    ...match,
    set,
    vincitoreId,
    stato: o.completa ? 'conclusa' : set.length > 0 ? 'in_corso' : 'programmata',
  }
}

export function propagaTabellone(matches: Match[], regole: RegolePunteggio): Match[] {
  const tabellone = matches.filter((m) => m.fase === 'tabellone')
  if (tabellone.length === 0) return matches

  // mappa per (round,index); lavoriamo su copie mutabili
  const byId = new Map(tabellone.map((m) => [m.id, { ...m }]))
  const lista = [...byId.values()]
  const maxRound = Math.max(...lista.map((m) => m.round))

  // azzera gli slot dei round > 1 prima di ricalcolare
  for (const m of lista) {
    if (m.round > 1) { m.teamAId = null; m.teamBId = null }
  }

  const key = (round: number, index: number) => lista.find((m) => m.round === round && m.posizioneTabellone === index)

  for (let round = 1; round < maxRound; round++) {
    const correnti = lista.filter((m) => m.round === round).sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
    for (const m of correnti) {
      const idx = m.posizioneTabellone ?? 0
      const succ = key(round + 1, Math.floor(idx / 2))
      if (!succ) continue
      const o = matchOutcome(m.set, regole)
      const vincitore = o.vincitore === 'A' ? m.teamAId : o.vincitore === 'B' ? m.teamBId : null
      if (vincitore == null) continue
      if (idx % 2 === 0) succ.teamAId = vincitore
      else succ.teamBId = vincitore
    }
  }

  // ricompone: match non-tabellone invariati + tabellone aggiornato
  const aggiornati = new Map(lista.map((m) => [m.id, m]))
  return matches.map((m) => aggiornati.get(m.id) ?? m)
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- results`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/results.ts src/services/results.test.ts
git commit -m "feat(services): applicazione risultati e propagazione tabellone"
```

---

### Task 5: Service classifiche

**Files:**
- Create: `src/services/standings.ts`
- Test: `src/services/standings.test.ts`

**Interfaces:**
- Consumes: engine `computeStandings`; tipi.
- Produces: `classificaGirone(group: Group, matches: Match[], regole: RegolePunteggio): StandingRow[]` — filtra i match del girone e chiama `computeStandings` sui `teamIds` del girone.

- [ ] **Step 1: Scrivere il test**

Create `src/services/standings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { classificaGirone } from './standings'
import type { Group, Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

it('classificaGirone ordina per vittorie', () => {
  const g: Group = { id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['A', 'B'] }
  const m: Match = { id: 'm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' }
  const rows = classificaGirone(g, [m], r)
  expect(rows[0].teamId).toBe('A')
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- services/standings`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/services/standings.ts`:
```ts
import type { Group, Match, RegolePunteggio, StandingRow } from '../engine/types'
import { computeStandings } from '../engine/standings'

export function classificaGirone(group: Group, matches: Match[], regole: RegolePunteggio): StandingRow[] {
  const delGirone = matches.filter((m) => m.groupId === group.id)
  return computeStandings(group.teamIds, delGirone, regole)
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- services/standings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/standings.ts src/services/standings.test.ts
git commit -m "feat(services): helper classifiche per girone"
```

---

### Task 6: Componenti base + App shell + routing + Home

**Files:**
- Create: `src/components/Button.tsx`, `src/components/Field.tsx`, `src/components/Badge.tsx`
- Create: `src/app/App.tsx`, `src/app/AppShell.tsx`
- Create: `src/screens/HomeScreen.tsx`
- Modify: `src/main.tsx` (montare `<App/>` dentro `<BrowserRouter>`)
- Test: `src/screens/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `repositories` (Task 2), react-router-dom, dexie-react-hooks.
- Produces: shell responsive (rail su desktop, bottom-bar su mobile) con header torneo; rotta `/` = Home con elenco tornei (via `useLiveQuery(listTournaments)`), bottone "Nuovo torneo" → `/tornei/nuovo`. I componenti base (`Button`, `Field`, `Badge`) usano i token.

**Approccio UI:** costruire i componenti seguendo i token e il design spec `docs/superpowers/specs/2026-07-13-torneigen-fase2-ui-design.md`. Il codice sotto fissa il comportamento e la struttura; rifinire lo stile con i token (classi CSS in un file `*.module.css` o className su tokens globali) mantenendo la UI pulita e neutra. Rail→bottom-bar via CSS responsive (`@media (max-width: 720px)`).

- [ ] **Step 1: Scrivere il test della Home**

Create `src/screens/HomeScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { HomeScreen } from './HomeScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('HomeScreen', () => {
  beforeEach(async () => { await db.tournaments.clear() })

  it('mostra i tornei esistenti', async () => {
    await saveTournament(t)
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
  })

  it('mostra un invito quando non ci sono tornei', async () => {
    render(<MemoryRouter><HomeScreen /></MemoryRouter>)
    expect(await screen.findByText(/nuovo torneo/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- HomeScreen`
Expected: FAIL — moduli non trovati.

- [ ] **Step 3: Implementare i componenti base**

Create `src/components/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }

export function Button({ variant = 'primary', ...rest }: Props) {
  return <button className={`btn btn-${variant}`} {...rest} />
}
```
Create `src/components/Field.tsx`:
```tsx
import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: ReactNode }

export function Field({ label, error, id, ...rest }: Props) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} className="field-input" {...rest} />
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}
```
Create `src/components/Badge.tsx`:
```tsx
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>
}
```
Aggiungere in `src/styles/tokens.css` le classi `.btn`, `.btn-primary` (bg `--sea`, testo bianco), `.btn-ghost` (bordo `--line`), `.btn-danger` (bg `--danger`), `.field`, `.field-input` (bordo `--line`, radius `--radius`), `.field-error` (colore `--danger`), `.badge` (bg tenue, testo `--muted`). Stile pulito e neutro.

- [ ] **Step 4: Implementare la Home**

Create `src/screens/HomeScreen.tsx`:
```tsx
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTournaments } from '../db/repositories'
import { Button } from '../components/Button'

export function HomeScreen() {
  const tornei = useLiveQuery(listTournaments, [], [])

  return (
    <section className="home">
      <header className="home-head">
        <h1>Tornei</h1>
        <Link to="/tornei/nuovo"><Button>Nuovo torneo</Button></Link>
      </header>
      {tornei.length === 0 ? (
        <p className="empty">Nessun torneo. Crea il tuo primo torneo con "Nuovo torneo".</p>
      ) : (
        <ul className="card-grid">
          {tornei.map((t) => (
            <li key={t.id} className="card">
              <Link to={`/tornei/${t.id}/squadre`}>
                <h3>{t.nome}</h3>
                <p className="muted">{t.tipologia} · {t.formato.replace('_', ' ')} · {t.data}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Implementare shell + router**

Create `src/app/AppShell.tsx` — layout con rail di navigazione (link: Riepilogo/Squadre/Tabellone/Classifiche quando un torneo è attivo, altrimenti solo "Tornei"), header torneo con nome/badge/azioni (Genera, Export — placeholder wired nei task successivi), `<Outlet/>` per il contenuto. Rail su desktop, bottom-bar su mobile (CSS responsive). Usa `useParams`/`useLiveQuery(getTournament)` per il torneo attivo.
Create `src/app/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        {/* rotte /tornei/* aggiunte nei task successivi */}
      </Route>
    </Routes>
  )
}
```
Modify `src/main.tsx` per avvolgere l'app:
```tsx
import { BrowserRouter } from 'react-router-dom'
// ...
root.render(<BrowserRouter><App /></BrowserRouter>)
```

- [ ] **Step 6: Verificare passaggio e build**

Run: `npm test -- HomeScreen` → PASS.
Run: `npm test` → tutto verde. `npx tsc --noEmit -p tsconfig.app.json` → pulito. `npm run build` → ok.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): componenti base, app shell responsive, routing e Home"
```

---

### Task 7: Schermata Setup torneo (crea/modifica)

**Files:**
- Create: `src/screens/SetupScreen.tsx`
- Modify: `src/app/App.tsx` (rotte `/tornei/nuovo`, `/tornei/:id/setup`)
- Test: `src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `saveTournament`, `getTournament` (Task 2); `newId`; `useNavigate`.
- Produces: form con nome, tipologia (2x2/4x4), formato (4 opzioni; KotC con nota), data, regole punteggio (setAlMeglioDi, puntiSet, puntiTieBreak, vittoriaConDue, cap opzionale). Salva un `Tournament` (nuovo con `newId` e `stato: 'bozza'`, `codiceIscrizione` generato) e naviga a `/tornei/:id/squadre`.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/SetupScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { listTournaments } from '../db/repositories'
import { SetupScreen } from './SetupScreen'

describe('SetupScreen', () => {
  beforeEach(async () => { await db.tournaments.clear() })

  it('crea un nuovo torneo e lo salva', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText(/nome/i), 'Coppa Estate')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()
    const all = await listTournaments()
    expect(all[0].nome).toBe('Coppa Estate')
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- SetupScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/SetupScreen.tsx` — form controllato React. Valori di default regole: `{ setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }`. Alla submit: costruire il `Tournament` (usare `useParams().id` per modifica, altrimenti `newId()`), `saveTournament`, `navigate(\`/tornei/${id}/squadre\`)`. Il selettore formato mostra le 4 opzioni; per KotC mostrare accanto una nota "generazione disponibile a breve". Generare `codiceIscrizione` con `newId().slice(0, 6).toUpperCase()`. Usare i componenti `Field`/`Button` e i token. Etichette in italiano (Nome, Tipologia, Formato, Data, Set al meglio di, Punti a set, Punti tie-break, Vittoria a 2 di scarto, Cap).

Aggiornare `src/app/App.tsx` aggiungendo dentro la route con `AppShell`:
```tsx
<Route path="tornei/nuovo" element={<SetupScreen />} />
<Route path="tornei/:id/setup" element={<SetupScreen />} />
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- SetupScreen` → PASS. Poi `npm test` intero verde, `tsc` pulito.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): schermata setup torneo (crea/modifica)"
```

---

### Task 8: Schermata Squadre (gestione + validazione tipologia)

**Files:**
- Create: `src/screens/TeamsScreen.tsx`
- Create: `src/services/teams.ts` (helper: numero giocatori atteso + validazione)
- Modify: `src/app/App.tsx` (rotta `/tornei/:id/squadre`)
- Test: `src/services/teams.test.ts`, `src/screens/TeamsScreen.test.tsx`

**Interfaces:**
- Consumes: `teamsOf`, db `teams`; `getTournament`; `newId`.
- Produces:
  - `src/services/teams.ts`: `numeroGiocatori(tipologia): { min: number; max: number }` (`2x2`→{2,2}, `4x4`→{4,8}); `validaSquadra(team, tipologia): string | null` (ritorna un messaggio d'errore o null — controlla range giocatori e campi obbligatori nome/cognome/email/telefono).
  - `TeamsScreen`: lista squadre del torneo (`useLiveQuery(teamsOf)`); form per aggiungere una squadra con nome + N righe giocatore (nome, cognome, email, telefono) dove N si adatta alla tipologia (2 fisse per 2x2; 4–8 con aggiungi/rimuovi per 4x4); modifica/rimozione; campo testa di serie. Salva `Team` con `origine: 'manuale'`, `stato: 'confermata'`.

- [ ] **Step 1: Scrivere i test del service**

Create `src/services/teams.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { numeroGiocatori, validaSquadra } from './teams'
import type { Team } from '../engine/types'

function squadra(n: number): Team {
  return {
    id: 't', tournamentId: 't1', nome: 'S', stato: 'confermata', origine: 'manuale',
    players: Array.from({ length: n }, (_, i) => ({ nome: `N${i}`, cognome: `C${i}`, email: `a${i}@x.it`, telefono: '123' })),
  }
}

describe('teams', () => {
  it('2x2 richiede 2 giocatori', () => {
    expect(numeroGiocatori('2x2')).toEqual({ min: 2, max: 2 })
    expect(validaSquadra(squadra(2), '2x2')).toBeNull()
    expect(validaSquadra(squadra(1), '2x2')).toMatch(/2/)
  })
  it('4x4 accetta da 4 a 8 giocatori', () => {
    expect(numeroGiocatori('4x4')).toEqual({ min: 4, max: 8 })
    expect(validaSquadra(squadra(4), '4x4')).toBeNull()
    expect(validaSquadra(squadra(8), '4x4')).toBeNull()
    expect(validaSquadra(squadra(3), '4x4')).toMatch(/4/)
    expect(validaSquadra(squadra(9), '4x4')).toMatch(/8/)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- services/teams`
Expected: FAIL.

- [ ] **Step 3: Implementare il service**

Create `src/services/teams.ts`:
```ts
import type { Team, Tipologia } from '../engine/types'

export function numeroGiocatori(tipologia: Tipologia): { min: number; max: number } {
  return tipologia === '2x2' ? { min: 2, max: 2 } : { min: 4, max: 8 }
}

export function validaSquadra(team: Team, tipologia: Tipologia): string | null {
  const { min, max } = numeroGiocatori(tipologia)
  if (team.players.length < min) return `Servono almeno ${min} giocatori`
  if (team.players.length > max) return `Massimo ${max} giocatori`
  if (!team.nome.trim()) return 'Il nome squadra è obbligatorio'
  for (const p of team.players) {
    if (!p.nome.trim() || !p.cognome.trim() || !p.email.trim() || !p.telefono.trim()) {
      return 'Ogni giocatore richiede nome, cognome, email e telefono'
    }
  }
  return null
}
```

- [ ] **Step 4: Verificare passaggio del service**

Run: `npm test -- services/teams` → PASS.

- [ ] **Step 5: Scrivere il test della schermata**

Create `src/screens/TeamsScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { TeamsScreen } from './TeamsScreen'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
const team: Team = {
  id: 'x', tournamentId: 't1', nome: 'Squali', stato: 'confermata', origine: 'manuale',
  players: [{ nome: 'Anna', cognome: 'Bo', email: 'a@x.it', telefono: '1' }, { nome: 'Bea', cognome: 'Ci', email: 'b@x.it', telefono: '2' }],
}

describe('TeamsScreen', () => {
  beforeEach(async () => { await db.tournaments.clear(); await db.teams.clear(); await saveTournament(t); await db.teams.put(team) })

  it('elenca le squadre del torneo', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Squali')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implementare la schermata**

Create `src/screens/TeamsScreen.tsx` — usa `useParams().id`, `useLiveQuery(() => teamsOf(id), [id], [])`, e `getTournament` per la tipologia. Form aggiunta squadra con righe giocatore dinamiche (2 fisse per 2x2; per 4x4 partire da 4 righe con pulsanti "Aggiungi giocatore" fino a 8 e "Rimuovi"). Al salvataggio: `validaSquadra`; se ok `db.teams.put({...})`, altrimenti mostra l'errore. Lista con modifica/rimozione (`db.teams.delete`) e input testa di serie. Componenti `Field`/`Button`, token, responsive.
Aggiungere in `App.tsx`: `<Route path="tornei/:id/squadre" element={<TeamsScreen />} />`.

- [ ] **Step 7: Verificare passaggio**

Run: `npm test -- TeamsScreen` → PASS. Intero `npm test` verde, `tsc` pulito.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): gestione squadre con validazione per tipologia"
```

---

### Task 9: Genera + viste Calendario/Tabellone

**Files:**
- Create: `src/screens/BracketScreen.tsx`
- Create: `src/components/MatchRow.tsx` (riga partita con esito, senza input punteggi qui)
- Modify: `src/app/App.tsx` (rotta `/tornei/:id/tabellone`), `src/app/AppShell.tsx` (azione "Genera")
- Test: `src/screens/BracketScreen.test.tsx`

**Interfaces:**
- Consumes: `generaTorneo` (Task 3), `replaceGenerated`, `matchesOf`, `groupsOf`, `teamsOf`, `getTournament`; `saveTournament`.
- Produces: bottone "Genera" che chiama `generaTorneo(torneo, teams)` e persiste con `replaceGenerated`, imposta `stato: 'in_corso'`. Vista gironi (partite raggruppate per girone) e/o vista tabellone (partite per round). Per KotC: bottone disabilitato + nota. Conferma prima di rigenerare se esistono già match.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/BracketScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { BracketScreen } from './BracketScreen'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: id, stato: 'confermata', origine: 'manuale', players: [] }
}

describe('BracketScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut([team('A'), team('B'), team('C')])
  })

  it('genera le partite del girone al click su Genera', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
    // 3 squadre round robin = 3 partite
    expect(await screen.findByText(/A/)).toBeInTheDocument()
    expect((await db.matches.where('tournamentId').equals('t1').toArray()).length).toBe(3)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- BracketScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/components/MatchRow.tsx` — mostra le due squadre (nomi risolti da una mappa id→nome passata via prop), il punteggio dei set se presenti (classe `.tnum`, Space Grotesk), evidenzia il vincitore. Nessun input qui (l'inserimento è nel Task 10, ma `MatchRow` accetta una prop `onModifica?` per aprire l'editor punteggi).
Create `src/screens/BracketScreen.tsx` — carica torneo, squadre, gruppi, match via `useLiveQuery`. Se non ci sono match, mostra il bottone "Genera" (disabilitato con nota per KotC). Al click: `try { const { groups, matches } = generaTorneo(torneo, teams); await replaceGenerated(id, groups, matches); await saveTournament({ ...torneo, stato: 'in_corso' }) } catch (e) { mostra messaggio }`. Se esistono match, chiedere conferma prima di rigenerare. Rendere le partite raggruppate per girone (formato con gironi) o per round (tabellone), usando `MatchRow`.
Aggiungere in `App.tsx`: `<Route path="tornei/:id/tabellone" element={<BracketScreen />} />`. In `AppShell`, l'azione header "Genera" può fare da scorciatoia navigando alla schermata tabellone.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- BracketScreen` → PASS. Intero `npm test` verde, `tsc` pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): generazione e viste calendario/tabellone"
```

---

### Task 10: Controllo punteggio (signature) + salvataggio risultati

**Files:**
- Create: `src/components/ScoreControl.tsx`
- Modify: `src/components/MatchRow.tsx` (apre l'editor), `src/screens/BracketScreen.tsx` (integra il salvataggio)
- Create: `src/services/saveResult.ts` (persistenza: applica risultato + propaga tabellone + scrive su db)
- Test: `src/components/ScoreControl.test.tsx`, `src/services/saveResult.test.ts`

**Interfaces:**
- Consumes: `applicaRisultato`, `propagaTabellone` (Task 4); `matchesOf`; db.
- Produces:
  - `src/services/saveResult.ts`: `salvaEProppaga(tournamentId, matchId, set: SetScore[], regole): Promise<void>` — carica i match del torneo, applica il risultato al match, e se è di tabellone ricalcola la propagazione, poi `bulkPut` dei match modificati.
  - `ScoreControl`: editor dei set con stepper +/- (Space Grotesk, `.tnum`), rispetta `setAlMeglioDi` (1 o 3 set), set attivo in `--sea`, evidenzia set/tie-break point in `--sand`. `onSalva(set: SetScore[])`.

- [ ] **Step 1: Scrivere i test**

Create `src/services/saveResult.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { salvaEProppaga } from './saveResult'
import type { Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
function tab(id: string, round: number, index: number, a: string | null, b: string | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}

describe('salvaEProppaga', () => {
  beforeEach(async () => { await db.matches.clear() })
  it('salva il risultato e fa avanzare il vincitore', async () => {
    await db.matches.bulkPut([tab('s1', 1, 0, 'A', 'B'), tab('s2', 1, 1, 'C', 'D'), tab('f', 2, 0, null, null)])
    await salvaEProppaga('t1', 's1', [{ puntiA: 21, puntiB: 10 }], r)
    const f = await db.matches.get('f')
    expect(f?.teamAId).toBe('A')
  })
})
```

Create `src/components/ScoreControl.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreControl } from './ScoreControl'

const r = { setAlMeglioDi: 1 as const, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

it('inserisce un punteggio e chiama onSalva', async () => {
  const onSalva = vi.fn()
  render(<ScoreControl regole={r} setIniziali={[]} onSalva={onSalva} />)
  // porta il punteggio a 21-15 usando gli stepper (implementazione a scelta: pulsanti +)
  // ... l'implementer collega i controlli; qui verifichiamo il salvataggio
  await userEvent.click(screen.getByRole('button', { name: /salva/i }))
  expect(onSalva).toHaveBeenCalled()
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- saveResult ScoreControl`
Expected: FAIL.

- [ ] **Step 3: Implementare il service**

Create `src/services/saveResult.ts`:
```ts
import type { SetScore, RegolePunteggio } from '../engine/types'
import { db } from '../db/database'
import { applicaRisultato, propagaTabellone } from './results'

export async function salvaEProppaga(
  tournamentId: string,
  matchId: string,
  set: SetScore[],
  regole: RegolePunteggio,
): Promise<void> {
  const matches = await db.matches.where('tournamentId').equals(tournamentId).toArray()
  const target = matches.find((m) => m.id === matchId)
  if (!target) throw new Error(`Partita ${matchId} non trovata`)
  const aggiornato = applicaRisultato(target, set, regole)
  const conRisultato = matches.map((m) => (m.id === matchId ? aggiornato : m))
  const finali = propagaTabellone(conRisultato, regole)
  await db.matches.bulkPut(finali)
}
```

- [ ] **Step 4: Implementare il ScoreControl**

Create `src/components/ScoreControl.tsx` — stato locale dei set (array `{puntiA, puntiB}`), numero di set secondo `setAlMeglioDi` (1 → 1 set; 3 → fino a 3, mostrando il set successivo quando serve). Stepper +/- per ogni punteggio, numeri grandi Space Grotesk `.tnum`, set attivo bordo `--sea`, `--sand` quando `max(punti) >= puntiSet-1` (set point). Bottone "Salva" chiama `onSalva(set)`. Props: `{ regole: RegolePunteggio; setIniziali: SetScore[]; onSalva: (set: SetScore[]) => void }`. Touch-friendly (target ≥ 40px).

- [ ] **Step 5: Integrare nella BracketScreen**

Modify `MatchRow.tsx` per esporre un pulsante "Punteggio" che apre il `ScoreControl` (inline o in un dialog). Modify `BracketScreen.tsx`: alla `onSalva` chiamare `salvaEProppaga(tournamentId, match.id, set, torneo.regolePunteggio)`. Grazie a `useLiveQuery`, le viste si aggiornano da sole.

- [ ] **Step 6: Verificare passaggio**

Run: `npm test -- saveResult ScoreControl` → PASS. Intero `npm test` verde, `tsc` pulito, `npm run build` ok.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): controllo punteggio signature e salvataggio risultati"
```

---

### Task 11: Schermata Classifiche + Export JSON

**Files:**
- Create: `src/screens/StandingsScreen.tsx`
- Modify: `src/app/App.tsx` (rotta `/tornei/:id/classifiche`), `src/app/AppShell.tsx` (azione "Export JSON")
- Test: `src/screens/StandingsScreen.test.tsx`

**Interfaces:**
- Consumes: `classificaGirone` (Task 5), `groupsOf`, `matchesOf`, `teamsOf`, `getTournament`; `exportBackup` (Fase 1).
- Produces: per ogni girone una tabella classifica (via `classificaGirone`, live), colonne: squadra, giocate, vinte, quoziente set, quoziente punti; per i tabelloni lo stato di avanzamento. Azione header "Export JSON" che scarica il backup del torneo (`exportBackup` → Blob JSON → download).

- [ ] **Step 1: Scrivere il test**

Create `src/screens/StandingsScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { StandingsScreen } from './StandingsScreen'
import type { Tournament, Team, Group, Match } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
const teams: Team[] = [
  { id: 'A', tournamentId: 't1', nome: 'Alfa', stato: 'confermata', origine: 'manuale', players: [] },
  { id: 'B', tournamentId: 't1', nome: 'Beta', stato: 'confermata', origine: 'manuale', players: [] },
]
const g: Group = { id: 'g1', tournamentId: 't1', nome: 'Girone A', teamIds: ['A', 'B'] }
const m: Match = { id: 'm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' }

describe('StandingsScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t); await db.teams.bulkPut(teams); await db.groups.put(g); await db.matches.put(m)
  })

  it('mostra la classifica con la squadra in testa', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/classifiche']}>
        <Routes><Route path="/tornei/:id/classifiche" element={<StandingsScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- StandingsScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/StandingsScreen.tsx` — carica torneo/gruppi/match/squadre via `useLiveQuery`. Per ogni girone calcola `classificaGirone(group, matches, regole)` e renderizza una tabella (nomi risolti da mappa id→nome; numeri `.tnum`). Quoziente set/punti calcolati per la visualizzazione (set fatti/subiti). Per i tabelloni, mostra lo stato di avanzamento (chi è passato). Il file `saveResult`/`propagaTabellone` mantiene già l'avanzamento in db.
In `AppShell`, aggiungere l'azione "Export JSON": `const data = await exportBackup(id); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); ` + creazione di un link `download` `torneo-<nome>.json`.
Aggiungere in `App.tsx`: `<Route path="tornei/:id/classifiche" element={<StandingsScreen />} />`.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- StandingsScreen` → PASS. Intero `npm test` verde, `tsc` pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): classifiche live ed export JSON del torneo"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura design spec:** direzione visiva/token → Task 1; livello services (generazione/risultati/classifiche) → Task 3-5; shell responsive + routing → Task 6; le 6 schermate → Task 6-11; signature score control → Task 10; export JSON → Task 11; validazione tipologia 2x2/4x4 → Task 8; KotC disabilitato → Task 3+9. Debiti Fase 1 (propagazione ri-modifica risultato) → Task 4/10.
- **Placeholder:** i task logici (services) hanno codice completo e test reali; i task UI fissano contratto, comportamento, codice-chiave e un test comportamentale ciascuno, delegando la rifinitura presentazionale al design spec committato (approccio dichiarato nell'header — appropriato per UI "pulita e neutra").
- **Consistenza tipi/nomi:** `generaTorneo`→`EsitoGenerazione{groups,matches}` consumato con `replaceGenerated`; `applicaRisultato`/`propagaTabellone` consumati da `salvaEProppaga`; `classificaGirone` consumato da `StandingsScreen`; rotte coerenti tra `App.tsx` e i test (`/tornei/:id/...`).

## Note per l'esecuzione

- I test dei componenti girano in `jsdom` (configurato nel Task 1); i test motore/db restano validi.
- L'esecuzione dei task UI trae beneficio da un agente esperto React/UI che segua i token e il design spec.
- Formati avanzati (eliminazione doppia, King of the Court) e iscrizioni online restano rispettivamente Fase 4 e Fase 3.
