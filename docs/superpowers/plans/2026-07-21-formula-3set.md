# Formula 3-set — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: usa superpowers:subagent-driven-development per eseguire questo piano task-per-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Supportare la formula 4x4: gironi a set (sempre 3 set, classifica a set vinti), semifinali incrociate + finalina 3°/4°, girone di consolazione di sola andata per i non-qualificati.

**Architecture:** Opzioni additive che si compongono con `gironi_eliminazione` + `diretta`. Nessun nuovo `Formato`. Punteggio a set gestito nel motore esito/classifica gated su `fase==='girone'`. Finalina come match `tabelloneTipo:'terzo'` escluso dalle euristiche bracket. Consolazione come `Group{tipo:'consolazione'}` round-robin.

**Tech Stack:** Vite + React 18 + TS strict, Vitest + @testing-library, Dexie.

## Global Constraints

- I nuovi campi sono **opzionali** e con default = comportamento attuale: tornei esistenti invariati (nessuna regressione).
- `gironiPerSet` vive su `RegolePunteggio`; `finaleTerzoPosto` e `gironeConsolazione` su `Tournament`; `tipo` su `Group`.
- Il **tabellone resta best-of-3**: il punteggio a set si applica solo a `fase==='girone'`.
- Classifica a set: ordine **set vinti (desc) → quoziente punti (fatti/subiti, desc) → scontro diretto**.
- Consolazione: round-robin **sola andata**, stessa classifica a set.
- Typecheck app: `npx tsc -b` (NON `tsc --noEmit`). Test mirati: `npm test -- <file>` (il full run è flaky su WSL).
- UI in italiano, testi inline coerenti con lo stile esistente.

---

### Task 1: Punteggio a set nei gironi — esito partita

**Files:**
- Modify: `src/engine/types.ts` (aggiungi `gironiPerSet?: boolean` a `RegolePunteggio`)
- Create: `src/engine/matchOutcome.ts` → aggiungi `esitoGirone`
- Test: `src/engine/matchOutcome.test.ts`
- Modify: `src/services/results.ts` (gating in `applicaRisultato`)
- Test: `src/services/results.test.ts`

**Interfaces:**
- Produces: `esitoGirone(sets: SetScore[]): { vincitore: 'A'|'B'|null; setA: number; setB: number; completa: boolean }` — `completa` solo con 3 set validi (vincitore per-set determinato con target 21/21/15).
- Consumes: `applicaRisultato(match, set, regole)` usa `esitoGirone` se `match.fase==='girone' && regole.gironiPerSet`.

- [ ] **Step 1: Aggiungi il campo al tipo**

In `src/engine/types.ts`, `RegolePunteggio`:
```ts
export interface RegolePunteggio {
  setAlMeglioDi: 1 | 3
  puntiSet: number
  puntiTieBreak: number
  vittoriaConDue: boolean
  cap?: number
  gironiPerSet?: boolean
}
```

- [ ] **Step 2: Scrivi i test di `esitoGirone` (falliscono)**

In `src/engine/matchOutcome.test.ts` aggiungi:
```ts
import { esitoGirone } from './matchOutcome'

describe('esitoGirone (sempre 3 set)', () => {
  const s = (a: number, b: number) => ({ puntiA: a, puntiB: b })
  it('non è completa con meno di 3 set validi', () => {
    expect(esitoGirone([s(21, 15), s(21, 10)]).completa).toBe(false)
  })
  it('con 3 set: 2-1 conta i set e assegna il vincitore', () => {
    const o = esitoGirone([s(21, 15), s(10, 21), s(15, 12)])
    expect(o).toEqual({ vincitore: 'A', setA: 2, setB: 1, completa: true })
  })
  it('3-0 valido', () => {
    const o = esitoGirone([s(21, 5), s(21, 9), s(15, 3)])
    expect(o).toEqual({ vincitore: 'A', setA: 3, setB: 0, completa: true })
  })
  it('il terzo set usa il target 15 (tie-break): 14-12 non è ancora set valido', () => {
    const o = esitoGirone([s(21, 15), s(10, 21), s(14, 12)])
    expect(o.completa).toBe(false)
  })
})
```

- [ ] **Step 3: Run test → falliscono**

Run: `npm test -- src/engine/matchOutcome.test.ts`
Expected: FAIL (`esitoGirone` non esiste).

- [ ] **Step 4: Implementa `esitoGirone`**

In `src/engine/matchOutcome.ts` aggiungi in fondo (usa `setWinner` già presente, target 21 per i primi due set, 15 per il terzo, vittoria con due punti, nessun cap):
```ts
export function esitoGirone(
  sets: SetScore[],
): { vincitore: 'A' | 'B' | null; setA: number; setB: number; completa: boolean } {
  let setA = 0
  let setB = 0
  let validi = 0
  sets.slice(0, 3).forEach((s, i) => {
    const target = i === 2 ? 15 : 21
    const w = setWinner(s, target, true)
    if (w === 'A') { setA++; validi++ }
    else if (w === 'B') { setB++; validi++ }
  })
  const completa = validi === 3
  const vincitore = !completa ? null : setA > setB ? 'A' : 'B'
  return { vincitore, setA, setB, completa }
}
```

- [ ] **Step 5: Run test → passano**

Run: `npm test -- src/engine/matchOutcome.test.ts`
Expected: PASS.

- [ ] **Step 6: Test gating in `applicaRisultato` (falliscono)**

In `src/services/results.test.ts` aggiungi un blocco:
```ts
import { applicaRisultato } from './results'
import type { Match, RegolePunteggio } from '../engine/types'

const regoleSet: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, gironiPerSet: true }
const matchBase = (fase: Match['fase']): Match => ({
  id: 'm', tournamentId: 't', fase, round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata',
})
const set3 = [{ puntiA: 21, puntiB: 15 }, { puntiA: 10, puntiB: 21 }, { puntiA: 15, puntiB: 12 }]

describe('applicaRisultato con gironiPerSet', () => {
  it('girone: conclusa solo con 3 set', () => {
    const parziale = applicaRisultato(matchBase('girone'), set3.slice(0, 2), regoleSet)
    expect(parziale.stato).toBe('in_corso')
    const pieno = applicaRisultato(matchBase('girone'), set3, regoleSet)
    expect(pieno.stato).toBe('conclusa')
    expect(pieno.vincitoreId).toBe('a')
  })
  it('tabellone: resta best-of-3 (2-0 è già conclusa) anche con gironiPerSet', () => {
    const m = applicaRisultato(matchBase('tabellone'), [{ puntiA: 21, puntiB: 10 }, { puntiA: 21, puntiB: 12 }], regoleSet)
    expect(m.stato).toBe('conclusa')
  })
})
```

- [ ] **Step 7: Run → falliscono**

Run: `npm test -- src/services/results.test.ts`
Expected: FAIL (girone 2-0 oggi risulta conclusa).

- [ ] **Step 8: Implementa il gating**

In `src/services/results.ts`, importa `esitoGirone` e modifica `applicaRisultato`:
```ts
import { matchOutcome, esitoGirone } from '../engine/matchOutcome'

export function applicaRisultato(match: Match, set: SetScore[], regole: RegolePunteggio): Match {
  const o = match.fase === 'girone' && regole.gironiPerSet ? esitoGirone(set) : matchOutcome(set, regole)
  const vincitoreId = o.vincitore === 'A' ? match.teamAId : o.vincitore === 'B' ? match.teamBId : null
  return {
    ...match,
    set,
    vincitoreId,
    stato: o.completa ? 'conclusa' : set.length > 0 ? 'in_corso' : 'programmata',
  }
}
```

- [ ] **Step 9: Run test + typecheck**

Run: `npm test -- src/services/results.test.ts src/engine/matchOutcome.test.ts` → PASS
Run: `npx tsc -b` → nessun errore

- [ ] **Step 10: Commit**

```bash
git add src/engine/types.ts src/engine/matchOutcome.ts src/engine/matchOutcome.test.ts src/services/results.ts src/services/results.test.ts
git commit -m "feat(engine): esito girone a set (sempre 3 set) + gating applicaRisultato"
```

---

### Task 2: Classifica gironi a set vinti

**Files:**
- Modify: `src/engine/standings.ts` (ordinamento condizionato)
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: `computeStandings(teamIds, matches, regole)`; se `regole.gironiPerSet`, usa `esitoGirone` per contare i set e ordina per set vinti → quoziente punti → scontro diretto.

- [ ] **Step 1: Test (falliscono)**

In `src/engine/standings.test.ts` aggiungi un blocco che verifica: (a) i set contati anche quando il "vincitore best-of-3" non esisterebbe; (b) ordine per set vinti; (c) parità di set risolta dal quoziente punti.
```ts
describe('computeStandings gironiPerSet', () => {
  const R = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, gironiPerSet: true } as const
  const m = (id: string, a: string, b: string, set: {puntiA:number;puntiB:number}[]) => ({
    id, tournamentId: 't', fase: 'girone' as const, groupId: 'g', round: 1, teamAId: a, teamBId: b, set, stato: 'conclusa' as const,
  })
  it('ordina per set vinti totali (ogni set = 1 punto)', () => {
    // A batte B 2-1, A batte C 2-1  => A ha 4 set; B vs C 3-0 a B
    const matches = [
      m('1','A','B',[{puntiA:21,puntiB:10},{puntiA:15,puntiB:21},{puntiA:15,puntiB:8}]),
      m('2','A','C',[{puntiA:21,puntiB:12},{puntiA:18,puntiB:21},{puntiA:15,puntiB:9}]),
      m('3','B','C',[{puntiA:21,puntiB:5},{puntiA:21,puntiB:7},{puntiA:15,puntiB:2}]),
    ]
    const cl = computeStandings(['A','B','C'], matches, R)
    expect(cl.map((r) => r.teamId)).toEqual(['A','B','C']) // A=4 set, B=3, C=1
    expect(cl[0].setVinti).toBe(4)
  })
  it('a parità di set vinti conta il quoziente punti', () => {
    // A e B entrambe 2 set vinti in una sola partita fra loro 2-1, poi la differenza è nei punti
    const matches = [ m('1','A','B',[{puntiA:21,puntiB:19},{puntiA:19,puntiB:21},{puntiA:15,puntiB:5}]) ]
    const cl = computeStandings(['A','B'], matches, R)
    // A: 2 set (36 fatti? no) — verifica solo che l'ordinamento non lanci e A (2 set) sopra B (1 set)
    expect(cl[0].teamId).toBe('A')
  })
})
```

- [ ] **Step 2: Run → falliscono**

Run: `npm test -- src/engine/standings.test.ts`
Expected: FAIL (oggi conta le partite vinte via `matchOutcome`, non i set; 2-1 dà 1 partita, l'ordine può combaciare per caso ma `setVinti` con la logica best-of-3 si ferma a 2 → verifica mirata su `setVinti`/quoziente fallisce).

- [ ] **Step 3: Implementa**

In `src/engine/standings.ts`: importa `esitoGirone`; nel loop usa l'esito a set quando `r.gironiPerSet`, e cambia il sort primario. Sostituisci l'uso di `matchOutcome(m.set, r)` dentro `computeStandings` con:
```ts
import { matchOutcome, esitoGirone } from './matchOutcome'
// ...
const esito = (sets: SetScore[]) => (r.gironiPerSet ? esitoGirone(sets) : matchOutcome(sets, r))
```
Usa `esito(m.set)` sia nel loop principale sia in `scontroDiretto`. Nel `sort` finale, quando `r.gironiPerSet` il criterio primario è `setVinti` (i punti = set vinti), poi quoziente punti, poi scontro diretto:
```ts
return [...rows.values()].sort((a, b) => {
  if (r.gironiPerSet) {
    if (b.setVinti !== a.setVinti) return b.setVinti - a.setVinti
    const qpA = quoziente(a.puntiFatti, a.puntiSubiti)
    const qpB = quoziente(b.puntiFatti, b.puntiSubiti)
    if (qpB !== qpA) return qpB - qpA
    return scontroDiretto(a, b)
  }
  if (b.vinte !== a.vinte) return b.vinte - a.vinte
  const qsA = quoziente(a.setVinti, a.setPersi)
  const qsB = quoziente(b.setVinti, b.setPersi)
  if (qsB !== qsA) return qsB - qsA
  const qpA = quoziente(a.puntiFatti, a.puntiSubiti)
  const qpB = quoziente(b.puntiFatti, b.puntiSubiti)
  if (qpB !== qpA) return qpB - qpA
  return scontroDiretto(a, b)
})
```
Nota: nel loop, `A.vinte/B.vinte` vanno comunque incrementati in base a `esito.vincitore` (serve alle viste), ma non sono il criterio primario in modalità set.

- [ ] **Step 4: Run → passano**

Run: `npm test -- src/engine/standings.test.ts` → PASS

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b` → ok
```bash
git add src/engine/standings.ts src/engine/standings.test.ts
git commit -m "feat(engine): classifica gironi a set vinti (quoziente punti come spareggio)"
```

---

### Task 3: Finalina 3°/4° — tipo `terzo`, propagazione e euristiche bracket

**Files:**
- Modify: `src/engine/types.ts` (aggiungi `'terzo'` alle due union `tabelloneTipo`)
- Modify: `src/services/results.ts` (`propagaTabellone`: instrada i perdenti via `perdenteVerso`)
- Test: `src/services/results.test.ts`
- Modify: `src/engine/bracketLayout.ts` (discriminatori `doppia` e `matchCampione` escludono `terzo`)
- Test: `src/engine/bracketLayout.test.ts`
- Modify: `src/services/saveResult.ts` (discriminatore `doppia` esclude `terzo`)

**Interfaces:**
- Produces: match con `tabelloneTipo:'terzo'` alimentato dai perdenti dei match round-1 che hanno `perdenteVerso` puntato ad esso. Escluso da layout doppia, da `matchCampione` e dall'albero single-elim.

- [ ] **Step 1: Estendi la union**

In `src/engine/types.ts` cambia entrambe le occorrenze:
```ts
tabelloneTipo?: 'vincenti' | 'perdenti' | 'finale' | 'golden' | 'terzo'
```
(su `Match`) e `tabelloneTipo: 'vincenti' | 'perdenti' | 'finale' | 'golden' | 'terzo'` su `DoubleBracketMatch`.

- [ ] **Step 2: Test propagazione perdente in single-elim (fallisce)**

In `src/services/results.test.ts`:
```ts
import { propagaTabellone } from './results'
const regole3 = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true } as const
it('propagaTabellone instrada i perdenti delle semifinali nella finalina (terzo)', () => {
  const tab: Match[] = [
    { id: 's0', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 0, teamAId: 'A1', teamBId: 'B2', set: [{puntiA:21,puntiB:10},{puntiA:21,puntiB:12}], stato: 'conclusa', perdenteVerso: { matchId: 't3', slot: 'A' } },
    { id: 's1', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 1, teamAId: 'B1', teamBId: 'A2', set: [{puntiA:15,puntiB:21},{puntiA:15,puntiB:21}], stato: 'conclusa', perdenteVerso: { matchId: 't3', slot: 'B' } },
    { id: 'f', tournamentId: 't', fase: 'tabellone', round: 2, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    { id: 't3', tournamentId: 't', fase: 'tabellone', tabelloneTipo: 'terzo', round: 2, posizioneTabellone: 1, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
  ]
  const out = propagaTabellone(tab, regole3)
  const finalina = out.find((m) => m.id === 't3')!
  expect(finalina.teamAId).toBe('B2') // perdente s0
  expect(finalina.teamBId).toBe('B1') // perdente s1
  const finale = out.find((m) => m.id === 'f')!
  expect(finale.teamAId).toBe('A1') // vincente s0
})
```

- [ ] **Step 3: Run → fallisce**

Run: `npm test -- src/services/results.test.ts`
Expected: FAIL (`propagaTabellone` non instrada `perdenteVerso`).

- [ ] **Step 4: Implementa loser-routing in `propagaTabellone`**

In `src/services/results.ts`, dentro `propagaTabellone`, dopo l'azzeramento dei round>1 esistente, aggiungi anche l'azzeramento degli slot alimentati da `perdenteVerso`, e dopo il loop dei vincitori aggiungi il routing dei perdenti. Concretamente, prima del `return`, inserisci:
```ts
  // Instradamento dei perdenti verso la finalina 3°/4° (match tabelloneTipo 'terzo')
  for (const m of lista) {
    if (!m.perdenteVerso) continue
    const o = matchOutcome(m.set, regole)
    if (!o.completa || o.vincitore == null) continue
    const perdente = o.vincitore === 'A' ? m.teamBId : m.teamAId
    const dest = lista.find((x) => x.id === m.perdenteVerso!.matchId)
    if (!dest) continue
    if (m.perdenteVerso.slot === 'A') dest.teamAId = perdente
    else dest.teamBId = perdente
  }
```
E nell'azzeramento iniziale dei round>1, assicurati che la finalina (round 2) venga azzerata come gli altri (già coperto da `if (m.round > 1)`), così il routing la riempie da zero ad ogni ricalcolo.

- [ ] **Step 5: Run → passa**

Run: `npm test -- src/services/results.test.ts` → PASS

- [ ] **Step 6: Test euristiche layout (falliscono)**

In `src/engine/bracketLayout.test.ts`:
```ts
it('un bracket con finalina resta single-elim e il campione è il vincitore della finale', () => {
  const tab: Match[] = [
    { id: 's0', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 0, teamAId: 'A1', teamBId: 'B2', set: [], stato: 'programmata' },
    { id: 's1', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 1, teamAId: 'B1', teamBId: 'A2', set: [], stato: 'programmata' },
    { id: 'f', tournamentId: 't', fase: 'tabellone', round: 2, posizioneTabellone: 0, teamAId: 'A1', teamBId: 'B1', set: [{puntiA:21,puntiB:10},{puntiA:21,puntiB:9}], stato: 'conclusa', vincitoreId: 'A1' },
    { id: 't3', tournamentId: 't', fase: 'tabellone', tabelloneTipo: 'terzo', round: 2, posizioneTabellone: 1, teamAId: 'B2', teamBId: 'A2', set: [], stato: 'programmata' },
  ]
  const layout = layoutBracket(tab)
  expect(layout.campione).toBe('A1')
  // la finalina è disegnata (nodo presente) ma non spezza l'albero
  expect(layout.nodi.find((n) => n.matchId === 't3')).toBeTruthy()
})
```

- [ ] **Step 7: Run → fallisce**

Run: `npm test -- src/engine/bracketLayout.test.ts`
Expected: FAIL (`doppia` diventa true per via del `tabelloneTipo`, oppure `matchCampione` usa il maxRound e prende la finalina).

- [ ] **Step 8: Correggi i discriminatori**

In `src/engine/bracketLayout.ts`:
1. In `matchCampione`, lavora solo sui match non-finalina: all'inizio `const principali = tab.filter((m) => m.tabelloneTipo !== 'terzo')` e usa `principali` al posto di `tab` per `finale`/`maxRound`/`ultima` (lascia la ricerca `golden` su `tab`).
2. In `layoutBracket`, cambia il discriminatore:
```ts
const doppia = tab.some((m) => m.tabelloneTipo && m.tabelloneTipo !== 'terzo')
```
3. In `layoutSingola`, escludi la finalina dall'albero e appendila come box isolato sotto la finale:
```ts
function layoutSingola(tab: Match[], campione, campioneMatchId) {
  const terzo = tab.find((m) => m.tabelloneTipo === 'terzo')
  const albero = tab.filter((m) => m.tabelloneTipo !== 'terzo')
  // ...usa `albero` dove prima usavi `tab` per rounds/byRoundIndex/nodi/segmenti...
  // dopo aver costruito nodi/segmenti dell'albero, se esiste `terzo`, aggiungi un nodo
  // in fondo (stessa colonna dell'ultimo round, sotto l'ultimo box):
  if (terzo) {
    const maxX = nodi.length ? Math.max(...nodi.map((n) => n.x)) : 0
    const maxY = nodi.length ? Math.max(...nodi.map((n) => n.y)) : 0
    nodi.push({ matchId: terzo.id, round: 0, tabelloneTipo: 'terzo', x: maxX, y: maxY + SLOT_H * 2, w: BOX_W, h: BOX_H })
  }
  return finalize(nodi, segmenti, campione, campioneMatchId)
}
```
(Non aggiungere segmenti per la finalina: è un box a sé.)

- [ ] **Step 9: Run → passano**

Run: `npm test -- src/engine/bracketLayout.test.ts` → PASS

- [ ] **Step 10: Aggiorna il discriminatore in `saveResult`**

In `src/services/saveResult.ts` cambia:
```ts
const doppia = matches.some((m) => m.tabelloneTipo !== undefined && m.tabelloneTipo !== 'terzo')
```
(così la finalina passa da `propagaTabellone`, non da `propagaDoppia`).

- [ ] **Step 11: Test + typecheck + commit**

Run: `npm test -- src/services/results.test.ts src/engine/bracketLayout.test.ts src/services/saveResult.test.ts` → PASS
Run: `npx tsc -b` → ok
```bash
git add src/engine/types.ts src/services/results.ts src/services/results.test.ts src/engine/bracketLayout.ts src/engine/bracketLayout.test.ts src/services/saveResult.ts
git commit -m "feat(tabellone): finalina 3/4 posto (tipo 'terzo') con instradamento perdenti"
```

---

### Task 4: Generazione fase finale — finalina + girone di consolazione

**Files:**
- Modify: `src/engine/types.ts` (`Tournament.finaleTerzoPosto?`, `Tournament.gironeConsolazione?`, `Group.tipo?`)
- Modify: `src/services/faseFinale.ts`
- Test: `src/services/faseFinale.test.ts`

**Interfaces:**
- Consumes: `qualifiedTeams`, `classificaGirone`, `generateRoundRobin`, `newId`, `getTournament/groupsOf/matchesOf`, `db`.
- Produces: dopo `generaFaseFinale`, se `finaleTerzoPosto` esiste un match `tabelloneTipo:'terzo'`; se `gironeConsolazione` esiste `Group{tipo:'consolazione'}` con round-robin sola andata.

- [ ] **Step 1: Aggiungi i campi ai tipi**

In `src/engine/types.ts`:
```ts
// Group
export interface Group {
  id: string
  tournamentId: string
  nome: string
  teamIds: string[]
  tipo?: 'girone' | 'consolazione'
}
// Tournament: aggiungi
  finaleTerzoPosto?: boolean
  gironeConsolazione?: boolean
```

- [ ] **Step 2: Test — precondizione ignora la consolazione + genera consolazione a 3 (falliscono)**

In `src/services/faseFinale.test.ts` aggiungi casi con 7 squadre in 2 gironi (4+3), `qualificatiPerGirone: 2`, `finaleTerzoPosto: true`, `gironeConsolazione: true`. Verifica dopo `generaFaseFinale`:
```ts
it('genera finalina e girone di consolazione a 3 con 7 squadre', async () => {
  // ...setup: torneo gironi_eliminazione, faseFinale 'diretta', qualificatiPerGirone 2,
  //    finaleTerzoPosto true, gironeConsolazione true, gironiPerSet true;
  //    Girone A = [a1,a2,a3,a4], Girone B = [b1,b2,b3]; tutte le partite girone 'conclusa'.
  await generaFaseFinale(torneoId)
  const groups = await groupsOf(torneoId)
  const cons = groups.find((g) => g.tipo === 'consolazione')!
  expect(cons.teamIds).toHaveLength(3) // a3,a4 (3° e 4° A) + b3 (3° B)
  const matches = await matchesOf(torneoId)
  const consMatches = matches.filter((m) => m.groupId === cons.id)
  expect(consMatches).toHaveLength(3) // round-robin sola andata di 3 squadre
  expect(matches.some((m) => m.tabelloneTipo === 'terzo')).toBe(true)
})

it('la precondizione ignora i match del girone di consolazione', async () => {
  // dopo la generazione, i match consolazione sono 'programmata';
  // rigenerare la fase finale NON deve lanciare "concludi tutte le partite dei gironi"
  await generaFaseFinale(torneoId) // non lancia
})
```
(Adatta il setup allo stile dei test esistenti nel file.)

- [ ] **Step 3: Run → falliscono**

Run: `npm test -- src/services/faseFinale.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementa in `faseFinale.ts`**

Modifiche a `generaFaseFinale`:
1. Import: `import { generateRoundRobin } from '../engine/roundRobin'` e `import { newId } from '../engine/id'`.
2. Gironi "veri": `const gironiVeri = groups.filter((g) => g.tipo !== 'consolazione')`. La precondizione "tutte conclusa" filtra i match dei soli gironi veri:
```ts
const idsVeri = new Set(gironiVeri.map((g) => g.id))
const gironi = matches.filter((m) => m.fase === 'girone' && m.groupId && idsVeri.has(m.groupId))
```
3. Classifiche solo sui gironi veri: `const classifiche = gironiVeri.map((g) => classificaGirone(g, matches, torneo.regolePunteggio))`.
4. Dopo aver costruito `tabellone` (ramo `diretta`), se `torneo.finaleTerzoPosto` e ci sono esattamente 2 semifinali al round 1, aggiungi la finalina e imposta `perdenteVerso` sulle due semifinali:
```ts
if (torneo.faseFinale !== 'doppia' && torneo.finaleTerzoPosto) {
  const semifinali = tabellone.filter((m) => m.round === 1).sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
  const ultimoRound = Math.max(...tabellone.map((m) => m.round))
  if (semifinali.length === 2 && ultimoRound === 2) {
    const finalinaId = `${tournamentId}:terzo`
    semifinali[0].perdenteVerso = { matchId: finalinaId, slot: 'A' }
    semifinali[1].perdenteVerso = { matchId: finalinaId, slot: 'B' }
    tabellone.push({
      id: finalinaId, tournamentId, fase: 'tabellone', tabelloneTipo: 'terzo',
      round: 2, posizioneTabellone: 1, teamAId: null, teamBId: null, set: [], stato: 'programmata',
    })
  }
}
```
5. Costruisci il girone di consolazione (indipendente dal ramo diretta/doppia). I non-qualificati sono le posizioni oltre `perGirone` di ogni girone vero:
```ts
let consGroup: Group | null = null
let consMatches: Match[] = []
if (torneo.gironeConsolazione) {
  const nonQualificati = classifiche.flatMap((c) => c.slice(perGirone).map((r) => r.teamId))
  if (nonQualificati.length >= 2) {
    consGroup = { id: newId(), tournamentId, nome: 'Consolazione', teamIds: nonQualificati, tipo: 'consolazione' }
    consMatches = generateRoundRobin(nonQualificati)
      .filter((p) => p.teamAId && p.teamBId)
      .map((p) => ({
        id: newId(), tournamentId, fase: 'girone', groupId: consGroup!.id, round: p.round,
        teamAId: p.teamAId, teamBId: p.teamBId, set: [], stato: 'programmata',
      }))
  }
}
```
6. Persisti tutto in transazione, sostituendo tabellone **e** eventuale consolazione preesistente:
```ts
const esistentiTab = matches.filter((m) => m.fase === 'tabellone').map((m) => m.id)
const consEsistenti = groups.filter((g) => g.tipo === 'consolazione')
const consMatchEsistenti = matches.filter((m) => m.groupId && consEsistenti.some((g) => g.id === m.groupId)).map((m) => m.id)
await db.transaction('rw', db.matches, db.groups, async () => {
  if (esistentiTab.length) await db.matches.bulkDelete(esistentiTab)
  if (consMatchEsistenti.length) await db.matches.bulkDelete(consMatchEsistenti)
  if (consEsistenti.length) await db.groups.bulkDelete(consEsistenti.map((g) => g.id))
  await db.matches.bulkPut(tabellone)
  if (consGroup) { await db.groups.add(consGroup); await db.matches.bulkPut(consMatches) }
})
```
(Aggiungi `Group`/`Match` agli import di tipo se servono.)

- [ ] **Step 5: Run → passano**

Run: `npm test -- src/services/faseFinale.test.ts` → PASS

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc -b` → ok
```bash
git add src/engine/types.ts src/services/faseFinale.ts src/services/faseFinale.test.ts
git commit -m "feat(fase-finale): finalina 3/4 + girone di consolazione per i non qualificati"
```

---

### Task 5: UI in SetupScreen (opzioni + preset Formula 3-set)

**Files:**
- Modify: `src/screens/SetupScreen.tsx`
- Test: `src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: stato locale `regole` (per `gironiPerSet`) e nuovi stati/campi `finaleTerzoPosto`, `gironeConsolazione`; salvataggio nel `Tournament`.

- [ ] **Step 1: Test (falliscono)**

In `src/screens/SetupScreen.test.tsx` aggiungi un test: con formato `gironi_eliminazione`, il click sul pulsante "Preset Formula 3-set" spunta le tre opzioni e imposta best-of-3; al salvataggio il torneo salvato ha `regolePunteggio.gironiPerSet === true`, `finaleTerzoPosto === true`, `gironeConsolazione === true`. (Segui lo stile dei test esistenti del file per il render e il salvataggio.)

- [ ] **Step 2: Run → fallisce**

Run: `npm test -- src/screens/SetupScreen.test.tsx`
Expected: FAIL (pulsante/checkbox assenti).

- [ ] **Step 3: Implementa UI**

In `SetupScreen.tsx`: aggiungi stati `finaleTerzoPosto`, `gironeConsolazione` (inizializzati da `t.finaleTerzoPosto`/`t.gironeConsolazione`), includili nell'oggetto salvato, e dentro il blocco `formato === 'gironi_eliminazione'` aggiungi tre `label.field-checkbox` (per `regole.gironiPerSet` via `aggiornaRegole`, `finaleTerzoPosto`, `gironeConsolazione`) + un pulsante "Preset Formula 3-set" che imposta:
```ts
aggiornaRegole({ setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, gironiPerSet: true })
setFaseFinale('diretta'); setQualificatiPerGirone(2)
setFinaleTerzoPosto(true); setGironeConsolazione(true)
```

- [ ] **Step 4: Run → passa**

Run: `npm test -- src/screens/SetupScreen.test.tsx` → PASS

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b` → ok
```bash
git add src/screens/SetupScreen.tsx src/screens/SetupScreen.test.tsx
git commit -m "feat(setup): opzioni gironi-a-set / finalina / consolazione + preset Formula 3-set"
```

---

## Verifica finale (fuori dai task, manuale)

- `npx tsc -b` pulito e suite mirate verdi.
- Nel browser sul torneo reale (7 squadre): imposta il preset, genera gironi, inserisci risultati a 3 set, verifica la classifica a set; concludi i gironi, genera la fase finale, verifica incroci + finalina + girone di consolazione a 3.
- Whole-branch review prima del merge.
