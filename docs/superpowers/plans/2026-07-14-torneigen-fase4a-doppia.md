# TorneiGen — Piano Fase 4a: eliminazione doppia (finale singola)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il formato eliminazione doppia (finale singola): motore `generateDoubleElimination` + propagazione `propagaDoppia`, generazione/salvataggio, opzione nel Setup e viste WB/LB/Finale nella `BracketScreen`.

**Architecture:** Il motore genera tre parti collegate — tabellone vincenti (riuso `generateSingleElimination`), tabellone perdenti (costruzione iterativa consolidamento/innesto), finale singola — con collegamenti espliciti `winnerFeeds`/`loserFeeds`. Questi link vengono persistiti sui `Match` (`vincitoreVerso`/`perdenteVerso`), così la propagazione è una funzione pura che ricalcola l'intero tabellone dai risultati registrati (le ri-modifiche si propagano). La UI mostra tre sezioni.

**Tech Stack:** TypeScript, Vitest, React (invariato).

## Global Constraints

- TypeScript strict. `src/engine/` resta puro. UI usa i servizi.
- Finale **singola** (nessun bracket reset). Schema di retrocessione LB **deterministico** (non anti-rivincita).
- Supporto robusto per **potenze di 2** (4, 8, 16 squadre); numeri non-potenza-di-2 usano bye come nel single-elim, con gestione **best-effort** (limite noto, come gli spareggi 3+ vie nelle classifiche).
- La generazione usa solo le squadre `confermata` (come gli altri formati).
- Styling solo token; nessun hex nuovo. Copy italiano.
- Commit frequenti, uno per task.

## File Structure

```
src/engine/types.ts               # + 'eliminazione_doppia', + campi Match, + DoubleBracketMatch
src/engine/doubleElimination.ts    # generateDoubleElimination
src/engine/doubleElimination.test.ts
src/services/results.ts           # + propagaDoppia
src/services/generation.ts        # ramo eliminazione_doppia
src/services/saveResult.ts        # sceglie propagaDoppia per la doppia
src/screens/SetupScreen.tsx       # opzione formato
src/screens/BracketScreen.tsx     # tre sezioni WB/LB/Finale
```

---

### Task 1: Tipi (formato, campi Match, DoubleBracketMatch)

**Files:**
- Modify: `src/engine/types.ts`

**Interfaces:**
- Produces: `Formato` include `'eliminazione_doppia'`; `Match` ha `tabelloneTipo?`, `vincitoreVerso?`, `perdenteVerso?`; nuovo tipo `DoubleBracketMatch`.

- [ ] **Step 1: Aggiornare i tipi**

In `src/engine/types.ts`:
```ts
export type Formato =
  | 'gironi_eliminazione'
  | 'eliminazione_diretta'
  | 'eliminazione_doppia'
  | 'girone_italiana'
  | 'king_of_the_court'
```
Aggiungere a `Match` (campi opzionali, i formati esistenti non li usano):
```ts
  tabelloneTipo?: 'vincenti' | 'perdenti' | 'finale'
  vincitoreVerso?: { matchId: string; slot: 'A' | 'B' } | null
  perdenteVerso?: { matchId: string; slot: 'A' | 'B' } | null
```
Aggiungere il tipo:
```ts
export interface DoubleBracketMatch {
  id: string
  tabelloneTipo: 'vincenti' | 'perdenti' | 'finale'
  round: number
  index: number
  teamAId: string | null
  teamBId: string | null
  winnerFeeds: { matchId: string; slot: 'A' | 'B' } | null
  loserFeeds: { matchId: string; slot: 'A' | 'B' } | null
}
```

- [ ] **Step 2: Verificare compilazione**

Run: `npx tsc --noEmit -p tsconfig.app.json` → pulito.
Run: `npm test` → tutta la suite ancora verde (nessun test rotto dai campi opzionali).

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(engine): tipi per eliminazione doppia (formato, campi Match, DoubleBracketMatch)"
```

---

### Task 2: Motore `generateDoubleElimination`

**Files:**
- Create: `src/engine/doubleElimination.ts`
- Test: `src/engine/doubleElimination.test.ts`

**Interfaces:**
- Consumes: `generateSingleElimination` (`./bracket`), `DoubleBracketMatch` (`./types`).
- Produces: `generateDoubleElimination(teamIds: string[]): DoubleBracketMatch[]` — WB (`vincenti`) + LB (`perdenti`) + finale (`finale`), con `winnerFeeds`/`loserFeeds`. `teamIds` ordinato per testa di serie.

- [ ] **Step 1: Scrivere i test**

Create `src/engine/doubleElimination.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateDoubleElimination } from './doubleElimination'

describe('generateDoubleElimination', () => {
  it('4 squadre: WB 3 match, LB 2 match, 1 finale', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    expect(b.filter((m) => m.tabelloneTipo === 'vincenti')).toHaveLength(3)
    expect(b.filter((m) => m.tabelloneTipo === 'perdenti')).toHaveLength(2)
    expect(b.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
  })

  it('8 squadre: WB 7, LB 6, finale 1 (totale 14 = 2N-2)', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(b.filter((m) => m.tabelloneTipo === 'vincenti')).toHaveLength(7)
    expect(b.filter((m) => m.tabelloneTipo === 'perdenti')).toHaveLength(6)
    expect(b.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
    expect(b).toHaveLength(14)
  })

  it('il perdente del WB round 1 finisce in uno slot LB', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    const wb1 = b.filter((m) => m.tabelloneTipo === 'vincenti' && m.round === 1)
    expect(wb1.every((m) => m.loserFeeds && m.loserFeeds.matchId.startsWith('lb-'))).toBe(true)
  })

  it('il vincitore del WB finale e del LB finale vanno alla finale', () => {
    const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
    const wbFin = b.find((m) => m.tabelloneTipo === 'vincenti' && m.winnerFeeds?.matchId === 'gf')
    const lbFin = b.find((m) => m.tabelloneTipo === 'perdenti' && m.winnerFeeds?.matchId === 'gf')
    expect(wbFin).toBeTruthy()
    expect(lbFin).toBeTruthy()
    expect(wbFin!.winnerFeeds!.slot).toBe('A')
    expect(lbFin!.winnerFeeds!.slot).toBe('B')
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- doubleElimination`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/doubleElimination.ts`:
```ts
import type { DoubleBracketMatch } from './types'
import { generateSingleElimination } from './bracket'

export function generateDoubleElimination(teamIds: string[]): DoubleBracketMatch[] {
  if (teamIds.length < 2) return []
  const wbRaw = generateSingleElimination(teamIds)
  const R = Math.max(...wbRaw.map((m) => m.round))
  const wbId = (id: string) => id.replace(/^m-/, 'wb-')

  const wb: DoubleBracketMatch[] = wbRaw.map((m) => ({
    id: wbId(m.id),
    tabelloneTipo: 'vincenti',
    round: m.round,
    index: m.index,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerFeeds: m.feedsMatchId ? { matchId: wbId(m.feedsMatchId), slot: m.feedsSlot as 'A' | 'B' } : null,
    loserFeeds: null,
  }))
  const wbRound = (r: number) => wb.filter((m) => m.round === r).sort((a, b) => a.index - b.index)

  const lb: DoubleBracketMatch[] = []
  const mkLb = (round: number, index: number): DoubleBracketMatch => {
    const m: DoubleBracketMatch = {
      id: `lb-r${round}-i${index}`, tabelloneTipo: 'perdenti', round, index,
      teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null,
    }
    lb.push(m)
    return m
  }

  let lbRound = 0
  let prev: DoubleBracketMatch[] = []

  for (let r = 1; r <= R - 1; r++) {
    // fase dispari: r===1 primo innesto (perdenti WB R1 a coppie); r>1 consolidamento (prev a coppie)
    lbRound++
    const dispari: DoubleBracketMatch[] = []
    if (r === 1) {
      const wb1 = wbRound(1)
      for (let j = 0; j < wb1.length / 2; j++) {
        const m = mkLb(lbRound, j); dispari.push(m)
        wb1[2 * j].loserFeeds = { matchId: m.id, slot: 'A' }
        wb1[2 * j + 1].loserFeeds = { matchId: m.id, slot: 'B' }
      }
    } else {
      for (let j = 0; j < prev.length / 2; j++) {
        const m = mkLb(lbRound, j); dispari.push(m)
        prev[2 * j].winnerFeeds = { matchId: m.id, slot: 'A' }
        prev[2 * j + 1].winnerFeeds = { matchId: m.id, slot: 'B' }
      }
    }
    prev = dispari

    // fase pari: innesto dei perdenti del WB round (r+1) contro i sopravvissuti LB
    lbRound++
    const pari: DoubleBracketMatch[] = []
    const drop = wbRound(r + 1)
    for (let j = 0; j < prev.length; j++) {
      const m = mkLb(lbRound, j); pari.push(m)
      prev[j].winnerFeeds = { matchId: m.id, slot: 'A' }
      drop[j].loserFeeds = { matchId: m.id, slot: 'B' }
    }
    prev = pari
  }

  // finale singola
  const gf: DoubleBracketMatch = {
    id: 'gf', tabelloneTipo: 'finale', round: 1, index: 0,
    teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null,
  }
  const wbFinal = wb.find((m) => m.round === R)!
  wbFinal.winnerFeeds = { matchId: 'gf', slot: 'A' }
  if (prev.length > 0) prev[0].winnerFeeds = { matchId: 'gf', slot: 'B' }

  return [...wb, ...lb, gf]
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- doubleElimination`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/doubleElimination.ts src/engine/doubleElimination.test.ts
git commit -m "feat(engine): generazione eliminazione doppia (WB+LB+finale con link)"
```

---

### Task 3: Propagazione `propagaDoppia`

**Files:**
- Modify: `src/services/results.ts`
- Test: `src/services/results.test.ts` (aggiungere casi)

**Interfaces:**
- Consumes: `matchOutcome` (`../engine/matchOutcome`), `Match`, `RegolePunteggio`.
- Produces: `propagaDoppia(matches: Match[], regole: RegolePunteggio): Match[]` — ricalcola da zero il tabellone doppio dai risultati usando `vincitoreVerso`/`perdenteVerso`. Ordine: `vincenti` (round asc) → `perdenti` (round asc) → `finale`. Azzera gli slot alimentati prima di ricalcolare (ri-modifiche gestite).

- [ ] **Step 1: Scrivere i test**

Aggiungere a `src/services/results.test.ts`:
```ts
import { propagaDoppia } from './results'

function doppia(id: string, tipo: 'vincenti' | 'perdenti' | 'finale', round: number, index: number, a: string | null, b: string | null, vinc?: { matchId: string; slot: 'A' | 'B' } | null, perd?: { matchId: string; slot: 'A' | 'B' } | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', tabelloneTipo: tipo, round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata', vincitoreVerso: vinc ?? null, perdenteVerso: perd ?? null }
}

describe('propagaDoppia', () => {
  it('il perdente di un match WB scende nello slot LB indicato', () => {
    const wb = { ...doppia('wb-r1-i0', 'vincenti', 1, 0, 'A', 'B', { matchId: 'wb-r2-i0', slot: 'A' }, { matchId: 'lb-r1-i0', slot: 'A' }), set: [{ puntiA: 21, puntiB: 10 }] }
    const lb = doppia('lb-r1-i0', 'perdenti', 1, 0, null, null)
    const wbf = doppia('wb-r2-i0', 'vincenti', 2, 0, null, null)
    const out = propagaDoppia([wb, lb, wbf], r)
    expect(out.find((m) => m.id === 'lb-r1-i0')!.teamAId).toBe('B') // B ha perso -> LB
    expect(out.find((m) => m.id === 'wb-r2-i0')!.teamAId).toBe('A') // A ha vinto -> WB
  })

  it('ri-modifica: cambiando il risultato, vincitore e perdente si ricollocano', () => {
    const wb = { ...doppia('wb-r1-i0', 'vincenti', 1, 0, 'A', 'B', { matchId: 'wb-r2-i0', slot: 'A' }, { matchId: 'lb-r1-i0', slot: 'A' }), set: [{ puntiA: 10, puntiB: 21 }] }
    const lb = { ...doppia('lb-r1-i0', 'perdenti', 1, 0, 'A', null), }
    const wbf = { ...doppia('wb-r2-i0', 'vincenti', 2, 0, 'A', null) }
    const out = propagaDoppia([wb, lb, wbf], r)
    expect(out.find((m) => m.id === 'lb-r1-i0')!.teamAId).toBe('A') // ora A ha perso
    expect(out.find((m) => m.id === 'wb-r2-i0')!.teamAId).toBe('B') // ora B ha vinto
  })
})
```
(`r` è la `RegolePunteggio` già definita nel file di test.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- results`
Expected: FAIL — `propagaDoppia` non esportata.

- [ ] **Step 3: Implementare**

Aggiungere a `src/services/results.ts`:
```ts
export function propagaDoppia(matches: Match[], regole: RegolePunteggio): Match[] {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  if (tab.length === 0) return matches
  const byId = new Map(tab.map((m) => [m.id, { ...m }]))

  // slot alimentati da un feed (da azzerare prima del ricalcolo)
  const target = new Set<string>()
  for (const m of byId.values()) {
    if (m.vincitoreVerso) target.add(`${m.vincitoreVerso.matchId}:${m.vincitoreVerso.slot}`)
    if (m.perdenteVerso) target.add(`${m.perdenteVerso.matchId}:${m.perdenteVerso.slot}`)
  }
  for (const m of byId.values()) {
    if (target.has(`${m.id}:A`)) m.teamAId = null
    if (target.has(`${m.id}:B`)) m.teamBId = null
  }

  const peso = (m: Match) =>
    (m.tabelloneTipo === 'vincenti' ? 0 : m.tabelloneTipo === 'perdenti' ? 1 : 2) * 100000 +
    (m.round ?? 0) * 1000 + (m.posizioneTabellone ?? 0)
  const lista = [...byId.values()].sort((a, b) => peso(a) - peso(b))

  const metti = (ref: { matchId: string; slot: 'A' | 'B' } | null | undefined, team: string | null) => {
    if (!ref || !team) return
    const t = byId.get(ref.matchId)
    if (!t) return
    if (ref.slot === 'A') t.teamAId = team
    else t.teamBId = team
  }

  for (const m of lista) {
    const o = matchOutcome(m.set, regole)
    if (!o.completa) continue
    const vincitore = o.vincitore === 'A' ? m.teamAId : m.teamBId
    const perdente = o.vincitore === 'A' ? m.teamBId : m.teamAId
    metti(m.vincitoreVerso, vincitore)
    metti(m.perdenteVerso, perdente)
  }

  const agg = new Map([...byId.values()].map((m) => [m.id, m]))
  return matches.map((m) => agg.get(m.id) ?? m)
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- results`
Expected: PASS (inclusi i nuovi casi e quelli esistenti).

- [ ] **Step 5: Commit**

```bash
git add src/services/results.ts src/services/results.test.ts
git commit -m "feat(services): propagaDoppia (avanzamento WB + retrocessione LB + finale)"
```

---

### Task 4: Generazione del formato eliminazione_doppia

**Files:**
- Modify: `src/services/generation.ts`
- Test: `src/services/generation.test.ts` (aggiungere un caso)

**Interfaces:**
- Consumes: `generateDoubleElimination` (Task 2).
- Produces: nel `generaTorneo`, ramo `case 'eliminazione_doppia'` che ordina le squadre per `testaDiSerie`, chiama `generateDoubleElimination`, e mappa i `DoubleBracketMatch` in `Match` (`fase:'tabellone'`, `tabelloneTipo`, `round`, `posizioneTabellone=index`, `vincitoreVerso=winnerFeeds`, `perdenteVerso=loserFeeds`).

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/services/generation.test.ts`:
```ts
it('eliminazione doppia: crea match WB, LB e finale con i tipi', () => {
  const t = { ...base, formato: 'eliminazione_doppia' as const }
  const teams = [team('S1', 1), team('S2', 2), team('S3', 3), team('S4', 4)]
  const { matches } = generaTorneo(t, teams)
  expect(matches.some((m) => m.tabelloneTipo === 'vincenti')).toBe(true)
  expect(matches.some((m) => m.tabelloneTipo === 'perdenti')).toBe(true)
  expect(matches.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
  // i link sono persistiti
  const wb1 = matches.find((m) => m.tabelloneTipo === 'vincenti' && m.round === 1)!
  expect(wb1.perdenteVerso).toBeTruthy()
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- generation`
Expected: FAIL.

- [ ] **Step 3: Implementare**

In `src/services/generation.ts`, importare `generateDoubleElimination` e aggiungere nello switch:
```ts
case 'eliminazione_doppia':
  return eliminazioneDoppia(torneo, teams)
```
e la funzione:
```ts
function eliminazioneDoppia(t: Tournament, teams: Team[]): EsitoGenerazione {
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const bracket = generateDoubleElimination(ids)
  const matches: Match[] = bracket.map((bm) => ({
    id: bm.id, tournamentId: t.id, fase: 'tabellone', tabelloneTipo: bm.tabelloneTipo,
    round: bm.round, posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
    set: [], stato: 'programmata',
    vincitoreVerso: bm.winnerFeeds, perdenteVerso: bm.loserFeeds,
  }))
  return { groups: [], matches }
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- generation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/generation.ts src/services/generation.test.ts
git commit -m "feat(services): generazione del formato eliminazione doppia"
```

---

### Task 5: Salvataggio risultato usa `propagaDoppia` per la doppia

**Files:**
- Modify: `src/services/saveResult.ts`
- Test: `src/services/saveResult.test.ts` (aggiungere un caso)

**Interfaces:**
- Consumes: `applicaRisultato`, `propagaTabellone`, `propagaDoppia` (da `./results`).
- Produces: `salvaEProppaga` sceglie `propagaDoppia` quando i match del torneo hanno `tabelloneTipo` (doppia eliminazione), altrimenti `propagaTabellone` (single-elim), preservando l'avanzamento del girone (nessuno).

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/services/saveResult.test.ts`:
```ts
it('doppia: salvare un risultato WB fa scendere il perdente nel LB', async () => {
  await db.matches.bulkPut([
    { id: 'wb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata', vincitoreVerso: { matchId: 'wb-r2-i0', slot: 'A' }, perdenteVerso: { matchId: 'lb-r1-i0', slot: 'A' } },
    { id: 'lb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata', vincitoreVerso: null, perdenteVerso: null },
    { id: 'wb-r2-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 2, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata', vincitoreVerso: null, perdenteVerso: null },
  ])
  await salvaEProppaga('t1', 'wb-r1-i0', [{ puntiA: 21, puntiB: 10 }], r)
  expect((await db.matches.get('lb-r1-i0'))?.teamAId).toBe('B')
  expect((await db.matches.get('wb-r2-i0'))?.teamAId).toBe('A')
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- saveResult`
Expected: FAIL (usa ancora solo propagaTabellone → il perdente non scende).

- [ ] **Step 3: Implementare**

In `src/services/saveResult.ts`, importare `propagaDoppia` e scegliere la propagazione:
```ts
import { applicaRisultato, propagaTabellone, propagaDoppia } from './results'
// ...
const conRisultato = matches.map((m) => (m.id === matchId ? aggiornato : m))
const doppia = matches.some((m) => m.tabelloneTipo !== undefined)
const finali = doppia ? propagaDoppia(conRisultato, regole) : propagaTabellone(conRisultato, regole)
await db.matches.bulkPut(finali)
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- saveResult`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/saveResult.ts src/services/saveResult.test.ts
git commit -m "feat(services): salvataggio usa propagaDoppia per l'eliminazione doppia"
```

---

### Task 6: Opzione formato nel Setup

**Files:**
- Modify: `src/screens/SetupScreen.tsx`
- Test: `src/screens/SetupScreen.test.tsx` (adeguare/estendere se il selettore formato è testato)

**Interfaces:**
- Produces: il selettore `formato` include l'opzione **Eliminazione doppia** (`eliminazione_doppia`).

- [ ] **Step 1: Implementare**

In `SetupScreen.tsx`, aggiungere l'opzione al `<select>` del formato (etichetta "Eliminazione doppia", valore `eliminazione_doppia`), accanto a "Eliminazione diretta". Nessun'altra modifica di logica.

- [ ] **Step 2: Verificare**

Run: `npm test -- SetupScreen` → PASS (i test esistenti non si rompono).
Run: `npm test` intera suite verde; `npx tsc --noEmit -p tsconfig.app.json` pulito; `npm run build` ok.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SetupScreen.tsx src/screens/SetupScreen.test.tsx
git commit -m "feat(ui): opzione eliminazione doppia nel setup"
```

---

### Task 7: Viste WB/LB/Finale nella BracketScreen

**Files:**
- Modify: `src/screens/BracketScreen.tsx`
- Test: `src/screens/BracketScreen.test.tsx` (aggiungere un caso)

**Interfaces:**
- Consumes: match con `tabelloneTipo`.
- Produces: per i tornei a eliminazione doppia, tre sezioni — **Tabellone vincenti** (`tabelloneTipo==='vincenti'`, per round), **Tabellone perdenti** (`'perdenti'`, per round), **Finale** (`'finale'`) — usando `MatchRow` e l'inserimento punteggi esistente. Gli altri formati restano invariati.

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/BracketScreen.test.tsx`:
```ts
it('eliminazione doppia: mostra le sezioni vincenti/perdenti/finale', async () => {
  // torneo t1 impostato a eliminazione_doppia nel beforeEach o creato qui
  await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
  await db.matches.bulkPut([
    { id: 'wb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' },
    { id: 'lb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
  ])
  render(
    <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
      <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText(/tabellone vincenti/i)).toBeInTheDocument()
  expect(screen.getByText(/tabellone perdenti/i)).toBeInTheDocument()
  expect(screen.getByText(/finale/i)).toBeInTheDocument()
})
```
(Adeguare al `beforeEach` esistente della BracketScreen; il torneo `t1` deve avere squadre confermate e formato doppia.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- BracketScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

In `BracketScreen.tsx`, quando ci sono match con `tabelloneTipo` (torneo doppia), renderizzare tre blocchi: "Tabellone vincenti" (match `vincenti`, raggruppati per round come già si fa per il tabellone), "Tabellone perdenti" (`perdenti`, per round), "Finale" (`finale`). Riusare `MatchRow` e il flusso di inserimento punteggi (`salvaEProppaga`, già presente). Il ramo esistente (girone/tabellone singolo) resta invariato quando non c'è `tabelloneTipo`. Stile con token; intestazioni di sezione con classi esistenti.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- BracketScreen` → PASS (tutti i casi). Intera suite verde, tsc pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/BracketScreen.test.tsx
git commit -m "feat(ui): viste tabellone vincenti/perdenti/finale per la doppia"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (4a):** tipi/formato → Task 1; motore WB+LB+finale → Task 2; propagazione avanzamento+retrocessione → Task 3; generazione → Task 4; salvataggio con propagaDoppia → Task 5; opzione Setup → Task 6; viste 3 sezioni → Task 7.
- **Placeholder:** motore e propagazione con codice completo e test reali (4 e 8 squadre; retrocessione; ri-modifica); task UI con contratto, codice-chiave e test.
- **Consistenza:** `DoubleBracketMatch.winnerFeeds/loserFeeds` → persistiti come `Match.vincitoreVerso/perdenteVerso` → letti da `propagaDoppia`; `saveResult` sceglie propagaDoppia quando c'è `tabelloneTipo`; `generaTorneo` usa `generateDoubleElimination`.

## Note per l'esecuzione

- Limite noto: gestione bye per numeri non-potenza-di-2 in doppia eliminazione è best-effort; i test coprono 4 e 8 squadre (potenze di 2).
- Verifica manuale end-to-end: crea un torneo a eliminazione doppia con 4 squadre confermate, genera, inserisci risultati e osserva la retrocessione dei perdenti nel tabellone perdenti fino alla finale.

## Prossimo piano

- **Fase 4b — King of the Court** (multi-campo salita/discesa): disegno e piano successivi.
