# TorneiGen — Piano Fase 6a: golden set nella doppia eliminazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il golden set alla doppia eliminazione: se in finale vince il campione del tabellone perdenti, si gioca un set secco (best-of-1) per il titolo.

**Architecture:** `tabelloneTipo` guadagna `'golden'`. `generateDoubleElimination` crea una partita `golden` dopo la finale. `propagaDoppia` la attiva quando la finale è vinta dallo slot B (campione perdenti). Il golden è valutato best-of-1 al salvataggio. La UI mostra il golden e calcola il campione.

**Tech Stack:** TypeScript, Vitest, React (invariati).

## Global Constraints

- TypeScript strict. `src/engine/` puro. UI usa i servizi. Styling solo token; nessun hex nuovo. Copy italiano.
- Golden set = **un set unico** (best-of-1) a punteggio normale, vittoria a 2 di scarto.
- Convenzione esistente: in finale (`gf`) lo slot **A** = campione tabellone vincenti, slot **B** = campione tabellone perdenti.
- Commit frequenti, uno per task.

---

### Task 1: Tipo 'golden' + generazione della partita golden

**Files:**
- Modify: `src/engine/types.ts` (`tabelloneTipo` e `DoubleBracketMatch` includono `'golden'`)
- Modify: `src/engine/doubleElimination.ts` (aggiunge la partita `golden`)
- Modify: `src/engine/doubleElimination.test.ts` (aggiornare i conteggi + nuovo caso)

**Interfaces:**
- Produces: `generateDoubleElimination` ritorna, oltre a WB/LB/finale, una partita
  `{ id: 'golden', tabelloneTipo: 'golden', round: 1, index: 0, teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null }`.

- [ ] **Step 1: Estendere i tipi**

In `src/engine/types.ts`, in `Match.tabelloneTipo` e in `DoubleBracketMatch.tabelloneTipo` cambiare l'union in:
```ts
'vincenti' | 'perdenti' | 'finale' | 'golden'
```

- [ ] **Step 2: Aggiornare i test della generazione**

In `doubleElimination.test.ts`: i conteggi totali aumentano di 1 (la partita golden). Aggiornare i due
casi esistenti (4 squadre: totale ora **7**; 8 squadre: totale ora **15**) e aggiungere:
```ts
it('genera anche la partita golden', () => {
  const b = generateDoubleElimination(['A', 'B', 'C', 'D'])
  const golden = b.filter((m) => m.tabelloneTipo === 'golden')
  expect(golden).toHaveLength(1)
  expect(golden[0].id).toBe('golden')
})
```
(Aggiornare gli `expect(b).toHaveLength(14)` → 15, e i conteggi a 4 squadre se asseriti sul totale.)

- [ ] **Step 3: Verificare fallimento**

Run: `npm test -- doubleElimination`
Expected: FAIL (nessuna partita golden ancora).

- [ ] **Step 4: Implementare**

In `src/engine/doubleElimination.ts`, dopo la creazione di `gf` e prima del `return`, aggiungere:
```ts
  const golden: DoubleBracketMatch = {
    id: 'golden', tabelloneTipo: 'golden', round: 1, index: 0,
    teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null,
  }
```
e cambiare il return in:
```ts
  return [...wb, ...lb, gf, golden]
```

- [ ] **Step 5: Verificare passaggio**

Run: `npm test -- doubleElimination` → PASS. Intera suite: `npm test` verde; `npx tsc --noEmit -p tsconfig.app.json` pulito.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/doubleElimination.ts src/engine/doubleElimination.test.ts
git commit -m "feat(engine): partita golden nella doppia eliminazione"
```

---

### Task 2: Attivazione del golden in `propagaDoppia`

**Files:**
- Modify: `src/services/results.ts` (`propagaDoppia`)
- Modify: `src/services/results.test.ts` (nuovi casi)

**Interfaces:**
- Produces: `propagaDoppia` popola il golden con i due finalisti quando la finale (`gf`) è conclusa e
  vinta dallo slot **B** (campione perdenti); altrimenti lascia il golden vuoto (ricalcolo idempotente).

- [ ] **Step 1: Scrivere i test**

Aggiungere a `src/services/results.test.ts` (usa gli helper `doppia`/`r` già presenti):
```ts
describe('propagaDoppia golden', () => {
  it('se il perdenti (slot B) vince la finale, si attiva il golden coi due finalisti', () => {
    const gf = { ...doppia('gf', 'finale', 1, 0, 'W', 'L'), set: [{ puntiA: 10, puntiB: 21 }] } // vince B (L, dal perdenti)
    const golden = doppia('golden', 'golden', 1, 0, null, null)
    const out = propagaDoppia([gf, golden], r)
    const g = out.find((m) => m.id === 'golden')!
    expect(g.teamAId).toBe('W')
    expect(g.teamBId).toBe('L')
  })
  it('se il vincenti (slot A) vince la finale, il golden resta vuoto', () => {
    const gf = { ...doppia('gf', 'finale', 1, 0, 'W', 'L'), set: [{ puntiA: 21, puntiB: 10 }] } // vince A (W)
    const golden = { ...doppia('golden', 'golden', 1, 0, 'X', 'Y') } // stato precedente sporco
    const out = propagaDoppia([gf, golden], r)
    const g = out.find((m) => m.id === 'golden')!
    expect(g.teamAId).toBeNull()
    expect(g.teamBId).toBeNull()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- results`
Expected: FAIL sui nuovi casi.

- [ ] **Step 3: Implementare**

In `propagaDoppia` (`src/services/results.ts`), **prima del return finale** (dopo il loop principale),
aggiungere la gestione del golden:
```ts
  // golden set: si gioca solo se la finale la vince il campione perdenti (slot B)
  const gf = byId.get('gf')
  const golden = byId.get('golden')
  if (gf && golden) {
    golden.teamAId = null
    golden.teamBId = null
    const oGf = matchOutcome(gf.set, regole)
    if (oGf.completa && oGf.vincitore === 'B') {
      golden.teamAId = gf.teamAId
      golden.teamBId = gf.teamBId
    }
  }
```
(`byId` è la mappa dei match `tabellone` clonati già usata dalla funzione; `matchOutcome` è già importato.)

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- results` → PASS (nuovi + esistenti). Intera suite verde, tsc pulito.

- [ ] **Step 5: Commit**

```bash
git add src/services/results.ts src/services/results.test.ts
git commit -m "feat(services): propagaDoppia attiva il golden se vince il perdenti"
```

---

### Task 3: Golden valutato best-of-1 al salvataggio

**Files:**
- Modify: `src/services/saveResult.ts` (`salvaEProppaga`)
- Modify: `src/services/saveResult.test.ts` (nuovo caso)

**Interfaces:**
- Produces: quando la partita salvata ha `tabelloneTipo === 'golden'`, l'esito si calcola con
  `{ ...regole, setAlMeglioDi: 1 }` (un solo set decide), anche se il torneo è al meglio di 3.

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/services/saveResult.test.ts`:
```ts
it('il golden set è deciso da un solo set anche se il torneo è al meglio di 3', async () => {
  const bo3 = { setAlMeglioDi: 3 as const, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
  await db.matches.put({ id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: 'W', teamBId: 'L', set: [], stato: 'programmata' })
  await salvaEProppaga('t1', 'golden', [{ puntiA: 21, puntiB: 15 }], bo3)
  const g = await db.matches.get('golden')
  expect(g?.stato).toBe('conclusa')
  expect(g?.vincitoreId).toBe('W')
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- saveResult`
Expected: FAIL (con bo3 un solo set non conclude → stato non 'conclusa').

- [ ] **Step 3: Implementare**

In `salvaEProppaga` (`src/services/saveResult.ts`), quando si applica il risultato al match target,
usare regole best-of-1 se è il golden:
```ts
const regoleMatch = target.tabelloneTipo === 'golden' ? { ...regole, setAlMeglioDi: 1 as const } : regole
const aggiornato = applicaRisultato(target, set, regoleMatch)
```
(Il resto — `propagaDoppia`/`propagaTabellone` sui match rimanenti — resta con `regole` normali; il
golden non alimenta altri match.)

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- saveResult` → PASS. Intera suite verde, tsc pulito.

- [ ] **Step 5: Commit**

```bash
git add src/services/saveResult.ts src/services/saveResult.test.ts
git commit -m "feat(services): il golden set è deciso da un solo set (best-of-1)"
```

---

### Task 4: UI — golden set e campione nella BracketScreen

**Files:**
- Modify: `src/screens/BracketScreen.tsx`
- Modify: `src/screens/BracketScreen.test.tsx` (nuovo caso)

**Interfaces:**
- Produces: nella sezione finale della doppia, la `BracketScreen` mostra il **Golden set** (partita
  `tabelloneTipo === 'golden'`) — con nota "si gioca solo se il tabellone perdenti vince la finale" —
  e determina il **campione** con la logica: golden vinto → campione golden; altrimenti finale vinta
  dallo slot A (vincenti) → campione; altrimenti in attesa.

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/BracketScreen.test.tsx` un caso che, per un torneo doppia con match finale +
golden, mostra la sezione "Golden set". Adeguare al `beforeEach` esistente:
```ts
it('doppia: mostra la sezione Golden set', async () => {
  await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
  await db.matches.bulkPut([
    { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' },
    { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
  ])
  render(
    <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
      <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText(/golden set/i)).toBeInTheDocument()
})
```
(Se `BracketScreen` usa il `ToastProvider`/altri wrapper, avvolgere come negli altri test.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- BracketScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

In `BracketScreen.tsx` (ramo doppia, dove si rendono le sezioni vincenti/perdenti/finale): aggiungere
la resa della partita `tabelloneTipo === 'golden'` in una sottosezione **"Golden set"** dentro/dopo la
Finale, con una nota che si gioca solo se il tabellone perdenti vince la finale, riusando `MatchRow` e
l'inserimento punteggi (`salvaEProppaga`). Aggiornare la logica del **campione**:
- se il match `golden` ha `vincitoreId` (concluso) → campione = vincitore golden;
- altrimenti se la finale (`gf`) è conclusa e il vincitore è lo slot A (`gf.teamAId`) → campione = quello;
- altrimenti nessun campione ancora.
Stile con token.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- BracketScreen` → PASS (tutti i casi). Intera suite verde, tsc pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/BracketScreen.test.tsx
git commit -m "feat(ui): golden set e campione nella doppia eliminazione"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (6a):** tipo `'golden'` + generazione → Task 1; attivazione in propagaDoppia → Task 2;
  best-of-1 al salvataggio → Task 3; UI golden + campione → Task 4.
- **Placeholder:** motore/servizi con codice completo e test reali; UI con contratto, comportamento, test.
- **Consistenza:** slot A = vincenti, slot B = perdenti (coerente con `generateDoubleElimination`);
  `propagaDoppia` attiva il golden su vittoria slot B; `salvaEProppaga` best-of-1 per il golden; UI
  calcola il campione da golden/finale.

## Prossimo piano

- **Piano 6b — Gironi→fase finale**: config (faseFinale/qualificatiPerGirone), servizio `generaFaseFinale`
  (classifiche→qualificati→tabellone diretto/doppio, con guard potenza-di-2 per la doppia), UI
  "Genera fase finale".
