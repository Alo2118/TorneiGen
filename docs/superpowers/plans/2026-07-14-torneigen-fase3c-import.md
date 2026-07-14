# TorneiGen — Piano Fase 3c: import iscrizioni + conferma + filtro generazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere la Fase 3: l'organizzatore **scarica** le iscrizioni ricevute, le importa come squadre (`origine: online`, `stato: in_attesa`) con dedup, le **conferma** nella schermata Squadre, e la generazione del torneo usa **solo** le squadre confermate.

**Architecture:** Un servizio `import` mappa `Iscrizione` → `Team` e deduplica per nome squadra. La `RegistrationsAdminScreen` (3b) viene estesa con "Scarica iscrizioni" → elenco → selezione → import in IndexedDB. La `TeamsScreen` (Fase 2) mostra lo stato e permette la conferma. La generazione filtra alle sole squadre `confermata`.

**Tech Stack:** React, il client `registrations-api`/`config` (3a/3b), `dexie-react-hooks`, i servizi motore/teams esistenti.

## Global Constraints

- TypeScript strict. Styling **solo** con i token di `src/styles/tokens.css` (nessun hex nuovo). Riuso `Field`/`Button`. Copy in italiano, sentence case, verbi attivi.
- La UI non reimplementa logica: usa i servizi (`import`, `config`, `teams`).
- Import: crea `Team` con `origine: 'online'`, `stato: 'in_attesa'`. Dedup per **nome squadra** (case-insensitive, trim) verso le squadre già presenti nel torneo.
- La **generazione** (`generaTorneo`) deve usare **solo** le squadre `stato === 'confermata'`; le squadre `in_attesa` non entrano nel torneo finché non confermate.
- Commit frequenti, uno per task.

## File Structure

```
src/services/import.ts          # iscrizioneATeam + nuoveIscrizioni (dedup)
src/services/import.test.ts
src/screens/RegistrationsAdminScreen.tsx  # esteso: scarica + import
src/screens/TeamsScreen.tsx     # esteso: stato + Conferma
src/screens/BracketScreen.tsx   # generazione filtra confermata
```

---

### Task 1: Servizio import (mappatura + dedup)

**Files:**
- Create: `src/services/import.ts`
- Create: `src/services/import.test.ts`

**Interfaces:**
- Consumes: `Iscrizione` da `../types/registrations`; `Team` da `../engine/types`; `newId`.
- Produces:
  - `iscrizioneATeam(iscr: Iscrizione, tournamentId: string): Team` — mappa un'iscrizione in una squadra `origine:'online'`, `stato:'in_attesa'`.
  - `nuoveIscrizioni(iscrizioni: Iscrizione[], teamsEsistenti: Team[]): Iscrizione[]` — scarta le iscrizioni il cui nome squadra è già presente (case-insensitive, trim).

- [ ] **Step 1: Scrivere i test**

Create `src/services/import.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { iscrizioneATeam, nuoveIscrizioni } from './import'
import type { Iscrizione } from '../types/registrations'
import type { Team } from '../engine/types'

const iscr = (nomeSquadra: string): Iscrizione => ({
  id: 'i-' + nomeSquadra, codice: 'ABC', nomeSquadra, createdAt: '',
  giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }],
})

describe('import', () => {
  it('iscrizioneATeam crea una squadra online in attesa', () => {
    const t = iscrizioneATeam(iscr('Squali'), 't1')
    expect(t.tournamentId).toBe('t1')
    expect(t.nome).toBe('Squali')
    expect(t.origine).toBe('online')
    expect(t.stato).toBe('in_attesa')
    expect(t.players).toHaveLength(2)
    expect(t.players[0]).toEqual({ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' })
  })

  it('nuoveIscrizioni scarta i nomi già presenti (case-insensitive)', () => {
    const esistenti: Team[] = [{ id: 'x', tournamentId: 't1', nome: 'squali', players: [], stato: 'confermata', origine: 'manuale' }]
    const out = nuoveIscrizioni([iscr('Squali'), iscr('Delfini')], esistenti)
    expect(out.map((i) => i.nomeSquadra)).toEqual(['Delfini'])
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- services/import`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/services/import.ts`:
```ts
import type { Iscrizione } from '../types/registrations'
import type { Team } from '../engine/types'
import { newId } from '../engine/id'

export function iscrizioneATeam(iscr: Iscrizione, tournamentId: string): Team {
  return {
    id: newId(),
    tournamentId,
    nome: iscr.nomeSquadra,
    players: iscr.giocatori.map((g) => ({ nome: g.nome, cognome: g.cognome, email: g.email, telefono: g.telefono })),
    stato: 'in_attesa',
    origine: 'online',
  }
}

export function nuoveIscrizioni(iscrizioni: Iscrizione[], teamsEsistenti: Team[]): Iscrizione[] {
  const nomi = new Set(teamsEsistenti.map((t) => t.nome.trim().toLowerCase()))
  return iscrizioni.filter((i) => !nomi.has(i.nomeSquadra.trim().toLowerCase()))
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- services/import`
Expected: PASS.
Run: `npm test` intera suite verde; `npx tsc --noEmit -p tsconfig.app.json` pulito.

- [ ] **Step 5: Commit**

```bash
git add src/services/import.ts src/services/import.test.ts
git commit -m "feat(services): mappatura e dedup iscrizioni -> squadre"
```

---

### Task 2: Scarica + importa iscrizioni (RegistrationsAdminScreen)

**Files:**
- Modify: `src/screens/RegistrationsAdminScreen.tsx`
- Test: `src/screens/RegistrationsAdminScreen.test.tsx` (aggiungere un caso)

**Interfaces:**
- Consumes: `getClient` (3b), `nuoveIscrizioni`/`iscrizioneATeam` (Task 1), `teamsOf` + `db.teams`, `useLiveQuery`.
- Produces: nella schermata iscrizioni, un pulsante **"Scarica iscrizioni"** che chiama `getClient().elencaIscrizioni(codice)`, filtra con `nuoveIscrizioni(...)` verso le squadre già presenti, mostra l'elenco delle nuove iscrizioni con checkbox; **"Importa selezionate"** crea le squadre (`iscrizioneATeam` → `db.teams.bulkPut`). Feedback su quante importate. Errori in `role="alert"`.

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/RegistrationsAdminScreen.test.tsx` un test:
```tsx
it('scarica le iscrizioni e importa le squadre selezionate', async () => {
  const risposte = [
    // prima chiamata: elencaIscrizioni
    { status: 200, body: { iscrizioni: [{ id: '1', codice: 'ABC123', nomeSquadra: 'Squali', createdAt: '', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] }] } },
  ]
  let i = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = risposte[Math.min(i, risposte.length - 1)]; i++
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }))
  render(
    <MemoryRouter initialEntries={['/tornei/t1/iscrizioni']}>
      <Routes><Route path="/tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} /></Routes>
    </MemoryRouter>,
  )
  await userEvent.click(await screen.findByRole('button', { name: /scarica iscrizioni/i }))
  expect(await screen.findByText('Squali')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /importa/i }))
  const teams = await db.teams.where('tournamentId').equals('t1').toArray()
  expect(teams.some((t) => t.nome === 'Squali' && t.origine === 'online' && t.stato === 'in_attesa')).toBe(true)
})
```
(Assicurarsi che il `beforeEach` esistente pulisca `db.teams` e imposti `readToken`.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- RegistrationsAdminScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

Estendere `RegistrationsAdminScreen.tsx`: aggiungere stato per l'elenco scaricato e le selezioni. **"Scarica iscrizioni"**: `const tutte = await getClient().elencaIscrizioni(codice); const esistenti = await teamsOf(id); setDaImportare(nuoveIscrizioni(tutte, esistenti))`. Rendere una lista con checkbox (selezionate di default). **"Importa selezionate"**: `await db.teams.bulkPut(selezionate.map((i) => iscrizioneATeam(i, id)))`, poi svuota la lista e mostra "N squadre importate". Se `elencaIscrizioni` fallisce (token errato → 401) mostrare l'errore. Se non ci sono nuove iscrizioni, messaggio "Nessuna nuova iscrizione". Stile con token, `Field`/`Button`.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- RegistrationsAdminScreen` → PASS (tutti i casi). Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/RegistrationsAdminScreen.tsx src/screens/RegistrationsAdminScreen.test.tsx
git commit -m "feat(ui): scarica e importa iscrizioni come squadre in attesa"
```

---

### Task 3: Stato squadre + conferma (TeamsScreen)

**Files:**
- Modify: `src/screens/TeamsScreen.tsx`
- Test: `src/screens/TeamsScreen.test.tsx` (aggiungere un caso)

**Interfaces:**
- Consumes: `db.teams`, `useLiveQuery`, `teamsOf`.
- Produces: nella lista squadre, mostra un badge di **stato** (`In attesa` / `Confermata`) e, per le squadre `in_attesa`, un pulsante **"Conferma"** che imposta `stato: 'confermata'` (`db.teams.update`/`put`). Distinguere visivamente (badge con token colore) le squadre online in attesa.

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/TeamsScreen.test.tsx`:
```tsx
it('conferma una squadra in attesa', async () => {
  await db.teams.put({ id: 'w', tournamentId: 't1', nome: 'Online', stato: 'in_attesa', origine: 'online', players: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] })
  render(
    <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
      <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
    </MemoryRouter>,
  )
  await userEvent.click(await screen.findByRole('button', { name: /conferma/i }))
  const t = await db.teams.get('w')
  expect(t?.stato).toBe('confermata')
})
```
(Il `beforeEach` esistente crea il torneo `t1` e pulisce `db.teams`.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- TeamsScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

In `TeamsScreen.tsx`, per ogni squadra nella lista: mostrare un badge stato (`In attesa`/`Confermata`) usando classi token (es. `.badge` con accento `--sand` per in_attesa, `--win` per confermata). Per le squadre `stato === 'in_attesa'` aggiungere un pulsante **"Conferma"** con handler `await db.teams.update(team.id, { stato: 'confermata' })` (o `put` con lo spread). Grazie a `useLiveQuery` la lista si aggiorna. Non cambiare la logica di aggiunta manuale (che resta `confermata`).

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- TeamsScreen` → PASS (tutti i casi). Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TeamsScreen.tsx src/screens/TeamsScreen.test.tsx
git commit -m "feat(ui): stato squadre e conferma delle iscrizioni online"
```

---

### Task 4: Generazione solo con squadre confermate

**Files:**
- Modify: `src/screens/BracketScreen.tsx`
- Test: `src/screens/BracketScreen.test.tsx` (aggiungere un caso)

**Interfaces:**
- Consumes: `generaTorneo` (che riceve le squadre), `teamsOf`, `useLiveQuery`.
- Produces: in `handleGenera`, filtrare le squadre a `stato === 'confermata'` prima di chiamare `generaTorneo`; se esistono squadre `in_attesa`, mostrare una nota ("N squadre in attesa non incluse — confermale nella schermata Squadre"). Non generare se meno di 2 squadre confermate (messaggio chiaro).

- [ ] **Step 1: Scrivere il test**

Aggiungere a `src/screens/BracketScreen.test.tsx`:
```tsx
it('genera usando solo le squadre confermate', async () => {
  // 3 confermate + 1 in attesa
  await db.teams.bulkPut([
    { id: 'A', tournamentId: 't1', nome: 'A', stato: 'confermata', origine: 'manuale', players: [] },
    { id: 'B', tournamentId: 't1', nome: 'B', stato: 'confermata', origine: 'manuale', players: [] },
    { id: 'C', tournamentId: 't1', nome: 'C', stato: 'confermata', origine: 'manuale', players: [] },
    { id: 'D', tournamentId: 't1', nome: 'D', stato: 'in_attesa', origine: 'online', players: [] },
  ])
  render(
    <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
      <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
    </MemoryRouter>,
  )
  await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
  await waitFor(async () => {
    const matches = await db.matches.where('tournamentId').equals('t1').toArray()
    // 3 squadre confermate a girone all'italiana = 3 partite (D esclusa)
    expect(matches.length).toBe(3)
  })
})
```
(Il torneo `t1` del `beforeEach` esistente è `girone_italiana`. Adeguare se diverso.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- BracketScreen`
Expected: FAIL (attualmente includerebbe anche D → più partite, o comunque la squadra in attesa).

- [ ] **Step 3: Implementare**

In `BracketScreen.tsx`, nel punto in cui si generano le partite: `const confermate = teams.filter((t) => t.stato === 'confermata')`. Chiamare `generaTorneo(torneo, confermate)`. Se `confermate.length < 2`, mostrare un messaggio e non generare. Se `teams.some((t) => t.stato === 'in_attesa')`, mostrare una nota informativa con il numero di squadre in attesa escluse e il rimando alla schermata Squadre. Mantenere la conferma di rigenerazione esistente.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- BracketScreen` → PASS (tutti i casi). Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/BracketScreen.test.tsx
git commit -m "feat(ui): la generazione usa solo le squadre confermate"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (3c):** mappatura+dedup → Task 1; scarica+importa (in_attesa) → Task 2; stato+conferma squadre → Task 3; filtro generazione a confermata (debito Fase 2 chiuso) → Task 4.
- **Placeholder:** import service con codice completo e test reali; task UI con contratto, comportamento, codice-chiave e test comportamentale.
- **Consistenza:** `iscrizioneATeam` crea `Team` con `origine:'online'`/`stato:'in_attesa'`; `TeamsScreen` conferma → `confermata`; `BracketScreen` genera solo con `confermata`. `nuoveIscrizioni` dedup per nome coerente col dedup import.

## Note per l'esecuzione

- Test manuale end-to-end (mock): `npm run mock:api` + `npm run dev`; token `dev-token` in Impostazioni; apri iscrizioni, iscriviti dal link pubblico, poi scarica+importa+conferma+genera.
- Con la Fase 3 completa, per andare online serve solo il **deploy** (Worker su Cloudflare + PWA su GitHub Pages), passo finale separato e guidato.
