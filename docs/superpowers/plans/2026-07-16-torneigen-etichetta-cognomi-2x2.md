# TorneiGen — Etichetta squadre coi cognomi nel 2x2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nei tornei 2x2 identificare le coppie coi cognomi dei due giocatori (es. "Rossi / Bianchi") ovunque si mostrano le squadre, rendendo il "Nome squadra" facoltativo; il 4x4 resta col nome-squadra.

**Architecture:** Un helper puro `etichettaSquadra(team, tipologia)` deriva l'etichetta (cognomi per il 2x2, nome per il 4x4, con fallback), e `mappaEtichette` centralizza la costruzione della mappa `id→etichetta` usata da tabellone/classifiche/calendario/elenco. `buildSnapshot` mette l'etichetta nel campo `nome` dello snapshot, così la vista pubblica mostra i cognomi. `validaSquadra` e il form rendono il nome opzionale per il 2x2.

**Tech Stack:** Vite + React 18 + TypeScript strict, Vitest + @testing-library/react. Nessuna nuova dipendenza.

## Global Constraints

- TypeScript **strict**: nessun `any`, nessun errore `tsc --noEmit`.
- Copy in **italiano**; solo design token (nessun colore hardcoded nuovo).
- **Motore di torneo invariato**: solo helper puri di presentazione + UI + snapshot.
- **Verifica su WSL**: suite vitest completa inaffidabile → run mirati (`npm test -- <file>`), `npx tsc --noEmit`, `npx vite build`.
- Tipi: `Team { id, tournamentId, nome: string, players: Player[], testaDiSerie?, stato, origine }`; `Player { nome, cognome, email, telefono }`; `Tipologia = '2x2' | '4x4'`.
- Etichetta 2x2 = cognomi non vuoti uniti da `" / "` (ordine di inserimento); fallback `nome`→`id`. 4x4 = `nome`→`id`.
- Si pubblicano solo i **cognomi** (identità pubblica della coppia); email/telefono/nomi propri restano fuori dallo snapshot.

---

## File Structure

- **Modify** `src/services/teams.ts` — `etichettaSquadra`, `mappaEtichette`, `validaSquadra` (nome opzionale 2x2).
- **Modify** `src/services/teams.test.ts` — test dei nuovi helper + validazione.
- **Modify** `src/services/pubblicazione.ts` — `buildSnapshot` usa `etichettaSquadra`.
- **Modify** `src/services/pubblicazione.test.ts` — aggiorna il test snapshot alle etichette derivate.
- **Modify** `src/screens/BracketScreen.tsx`, `src/screens/StandingsScreen.tsx`, `src/screens/CalendarScreen.tsx` — mappa via `mappaEtichette`.
- **Modify** `src/screens/TeamsScreen.tsx` — nome opzionale per 2x2 + elenco con etichetta.
- **Modify** `src/screens/TeamsScreen.test.tsx` — salvataggio 2x2 senza nome + elenco con cognomi.

---

## Task 1: Helper `etichettaSquadra`/`mappaEtichette` + validazione

**Files:**
- Modify: `src/services/teams.ts`
- Test: `src/services/teams.test.ts`

**Interfaces:**
- Consumes: `Team`, `Tipologia` da `../engine/types`.
- Produces:
  - `export function etichettaSquadra(team: Team, tipologia: Tipologia): string`
  - `export function mappaEtichette(teams: Team[], tipologia: Tipologia): Record<string, string>`
  - `validaSquadra` invariata nella firma; per `2x2` NON richiede più il nome.

- [ ] **Step 1: Scrivi i test (falliscono)**

Aggiungi in fondo a `src/services/teams.test.ts` (mantieni gli import esistenti; se manca, aggiungi `import { etichettaSquadra, mappaEtichette } from './teams'` accanto agli altri import da `./teams`):

```ts
import { etichettaSquadra, mappaEtichette } from './teams'
import type { Team } from '../engine/types'

function sq(id: string, nome: string, cognomi: string[]): Team {
  return {
    id, tournamentId: 't', nome, stato: 'confermata', origine: 'manuale',
    players: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })),
  }
}

describe('etichettaSquadra', () => {
  it('2x2: unisce i due cognomi con " / "', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', 'Bianchi']), '2x2')).toBe('Rossi / Bianchi')
  })
  it('2x2: usa solo i cognomi presenti', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', '']), '2x2')).toBe('Rossi')
  })
  it('2x2: senza cognomi ripiega sul nome squadra', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['', '']), '2x2')).toBe('Squali')
  })
  it('2x2: senza cognomi e senza nome ripiega sull\'id', () => {
    expect(etichettaSquadra(sq('a', '', []), '2x2')).toBe('a')
  })
  it('4x4: usa il nome squadra', () => {
    expect(etichettaSquadra(sq('a', 'Squali', ['Rossi', 'Bianchi', 'Verdi', 'Neri']), '4x4')).toBe('Squali')
  })
})

describe('mappaEtichette', () => {
  it('costruisce la mappa id -> etichetta', () => {
    const teams = [sq('a', 'Squali', ['Rossi', 'Bianchi']), sq('b', 'Onde', ['Verdi', 'Neri'])]
    expect(mappaEtichette(teams, '2x2')).toEqual({ a: 'Rossi / Bianchi', b: 'Verdi / Neri' })
  })
})

describe('validaSquadra: nome opzionale nel 2x2', () => {
  it('2x2 senza nome è valida (se i giocatori sono completi)', () => {
    expect(validaSquadra(sq('a', '', ['Rossi', 'Bianchi']), '2x2')).toBeNull()
  })
  it('4x4 senza nome NON è valida', () => {
    expect(validaSquadra(sq('a', '', ['Rossi', 'Bianchi', 'Verdi', 'Neri']), '4x4')).toBe('Il nome squadra è obbligatorio')
  })
})
```

Nota: `validaSquadra` e `describe`/`it`/`expect` sono già importati/disponibili nel file esistente; aggiungi solo gli import mancanti (`etichettaSquadra`, `mappaEtichette`, `Team`) se non presenti.

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/services/teams.test.ts`
Expected: FAIL — `etichettaSquadra`/`mappaEtichette` non esistono; il test "2x2 senza nome è valida" fallisce (oggi richiede il nome).

- [ ] **Step 3: Implementa in `src/services/teams.ts`**

Aggiungi le due funzioni e modifica il controllo del nome in `validaSquadra`:

```ts
export function etichettaSquadra(team: Team, tipologia: Tipologia): string {
  if (tipologia === '2x2') {
    const cognomi = team.players.map((p) => p.cognome.trim()).filter(Boolean)
    if (cognomi.length > 0) return cognomi.join(' / ')
  }
  return team.nome.trim() || team.id
}

export function mappaEtichette(teams: Team[], tipologia: Tipologia): Record<string, string> {
  return Object.fromEntries(teams.map((t) => [t.id, etichettaSquadra(t, tipologia)]))
}
```

In `validaSquadra`, sostituisci la riga:
```ts
  if (!team.nome.trim()) return 'Il nome squadra è obbligatorio'
```
con:
```ts
  if (tipologia !== '2x2' && !team.nome.trim()) return 'Il nome squadra è obbligatorio'
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npm test -- src/services/teams.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add src/services/teams.ts src/services/teams.test.ts
git commit -m "feat(services): etichettaSquadra/mappaEtichette + nome opzionale 2x2"
```

---

## Task 2: `buildSnapshot` usa l'etichetta derivata

**Files:**
- Modify: `src/services/pubblicazione.ts`
- Test: `src/services/pubblicazione.test.ts`

**Interfaces:**
- Consumes: `etichettaSquadra` (Task 1).

- [ ] **Step 1: Aggiorna il test dello snapshot (fallisce)**

In `src/services/pubblicazione.test.ts`, il torneo di test è `2x2` e ogni squadra ha un giocatore con
`cognome: 'Rossi'`. Rendi i cognomi distinti e verifica le etichette. Modifica la factory `team` così
(dà un cognome diverso per id):

Trova:
```ts
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
    players: [{ nome: 'Mario', cognome: 'Rossi', email: 'mario@x.it', telefono: '3330000000' }] }
}
```
Sostituisci con:
```ts
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: `Team ${id}`, stato: 'confermata', origine: 'manuale',
    players: [{ nome: 'Mario', cognome: `Cognome${id}`, email: 'mario@x.it', telefono: '3330000000' }] }
}
```

E aggiorna l'asserzione del test "riduce le squadre a id+nome SENZA dati personali": trova
```ts
    expect(s.teams).toEqual([
      { id: 'a', nome: 'Team a' },
      { id: 'b', nome: 'Team b' },
    ])
```
e sostituisci con (per il 2x2 l'etichetta è il cognome):
```ts
    expect(s.teams).toEqual([
      { id: 'a', nome: 'Cognomea' },
      { id: 'b', nome: 'Cognomeb' },
    ])
```
Lascia invariate le altre asserzioni dello stesso test (`not.toContain('mario@x.it')`, `not.toContain('players')`).

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `npm test -- src/services/pubblicazione.test.ts`
Expected: FAIL — lo snapshot produce ancora `nome: 'Team a'` (non l'etichetta).

- [ ] **Step 3: Implementa in `src/services/pubblicazione.ts`**

Aggiungi l'import in cima (accanto agli altri):
```ts
import { etichettaSquadra } from './teams'
```
In `buildSnapshot`, sostituisci:
```ts
    teams: teams.map((x) => ({ id: x.id, nome: x.nome })),
```
con:
```ts
    teams: teams.map((x) => ({ id: x.id, nome: etichettaSquadra(x, t.tipologia) })),
```
(`t` è il torneo già caricato in `buildSnapshot`.)

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `npm test -- src/services/pubblicazione.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add src/services/pubblicazione.ts src/services/pubblicazione.test.ts
git commit -m "feat(services): snapshot pubblico usa l'etichetta squadra (cognomi 2x2)"
```

---

## Task 3: Applicare l'etichetta nelle schermate

**Files:**
- Modify: `src/screens/BracketScreen.tsx`, `src/screens/StandingsScreen.tsx`, `src/screens/CalendarScreen.tsx`
- Modify: `src/screens/TeamsScreen.tsx`
- Test: `src/screens/TeamsScreen.test.tsx`

**Interfaces:**
- Consumes: `mappaEtichette`, `etichettaSquadra` (Task 1).

- [ ] **Step 1: BracketScreen / StandingsScreen / CalendarScreen usano `mappaEtichette`**

In ciascuno dei tre file, aggiungi l'import:
```ts
import { mappaEtichette } from '../services/teams'
```
e sostituisci la riga:
```ts
  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))
```
con:
```ts
  const teamNames: Record<string, string> = mappaEtichette(teams, torneo.tipologia)
```
(In tutti e tre gli screen il torneo è nella variabile `torneo`, garantita non-null dopo l'early return.)

- [ ] **Step 2: TeamsScreen — nome opzionale per 2x2 + elenco con etichetta**

In `src/screens/TeamsScreen.tsx`:
- aggiungi l'import:
```ts
import { numeroGiocatori, validaSquadra, etichettaSquadra } from '../services/teams'
```
(unifica con l'import esistente da `../services/teams` — non duplicare `numeroGiocatori`/`validaSquadra`.)

- nell'elenco squadre, sostituisci:
```tsx
                <h3>{team.nome}</h3>
```
con:
```tsx
                <h3>{etichettaSquadra(team, tipologia)}</h3>
```

- rendi il campo "Nome squadra" opzionale per il 2x2. Sostituisci:
```tsx
        <Field label="Nome squadra" value={nome} onChange={(e) => setNome(e.target.value)} required />
```
con:
```tsx
        <Field
          label={tipologia === '2x2' ? 'Nome squadra (facoltativo)' : 'Nome squadra'}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required={tipologia !== '2x2'}
        />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Aggiorna/aggiungi i test di TeamsScreen**

Apri `src/screens/TeamsScreen.test.tsx`. Aggiungi un test che, in un torneo **2x2**, salva una squadra
**senza nome** (solo i 2 giocatori coi cognomi) e verifica che l'elenco mostri l'etichetta coi cognomi.
Usa lo stesso pattern di render degli altri test del file (MemoryRouter + rotta `/tornei/:id/squadre`,
`db` seed del torneo 2x2). Esempio di corpo del test (adatta i nomi degli helper/campi a quelli già
usati nel file):

```tsx
  it('2x2: salva una coppia senza nome squadra e la mostra coi cognomi', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/squadre']}>
        <Routes><Route path="/tornei/:id/squadre" element={<TeamsScreen />} /></Routes>
      </MemoryRouter>,
    )
    // compila i 2 giocatori (nome/cognome/email/telefono) lasciando vuoto "Nome squadra"
    const cognomi = await screen.findAllByLabelText('Cognome')
    await userEvent.type(cognomi[0], 'Rossi')
    await userEvent.type(cognomi[1], 'Bianchi')
    const nomi = screen.getAllByLabelText('Nome')
    const email = screen.getAllByLabelText('Email')
    const tel = screen.getAllByLabelText('Telefono')
    for (let i = 0; i < 2; i++) {
      await userEvent.type(nomi[i], `G${i}`)
      await userEvent.type(email[i], `g${i}@x.it`)
      await userEvent.type(tel[i], '3330000000')
    }
    await userEvent.click(screen.getByRole('button', { name: /aggiungi squadra|salva/i }))
    expect(await screen.findByText('Rossi / Bianchi')).toBeTruthy()
  })
```

Se le label o il testo del bottone nel file differiscono (es. label degli input giocatore, o il numero
di input "Nome" perché include anche il nome-squadra), adatta le query di conseguenza — l'importante è
compilare i due giocatori coi cognomi Rossi/Bianchi, lasciare vuoto il nome squadra, salvare, e
asserire che compare **"Rossi / Bianchi"**. Il torneo di test deve essere `tipologia: '2x2'` (come già
nei test esistenti del file; se non lo è, seed un torneo 2x2 con `saveTournament`).

- [ ] **Step 5: Esegui i test coinvolti**

Run: `npm test -- src/screens/TeamsScreen.test.tsx src/screens/BracketScreen.test.tsx src/screens/StandingsScreen.test.tsx src/screens/CalendarScreen.test.tsx`
Expected: PASS. I test esistenti che usano squadre con `players: []` ripiegano su `nome` → restano verdi. Se qualcuno cercava `team.nome` in un contesto ora reso con l'etichetta, aggiornalo al minimo senza indebolirlo e mostra la modifica nel report.

- [ ] **Step 6: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/StandingsScreen.tsx src/screens/CalendarScreen.tsx src/screens/TeamsScreen.tsx src/screens/TeamsScreen.test.tsx
git commit -m "feat(ui): squadre 2x2 mostrate coi cognomi + nome facoltativo"
```

---

## Task 4: Verifica finale

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati dei file toccati**

Run: `npm test -- src/services/teams.test.ts src/services/pubblicazione.test.ts src/screens/TeamsScreen.test.tsx src/screens/BracketScreen.test.tsx src/screens/StandingsScreen.test.tsx src/screens/CalendarScreen.test.tsx`
Expected: tutti verdi. (NON usare la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione**

Run: `npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: Verifica visiva (opzionale ma consigliata)**

Riusa il flusso screenshot headless: inietta il torneo demo in IndexedDB, apri Tabellone/Classifiche e
verifica che le squadre 2x2 appaiano coi cognomi (i demo team hanno `players` con `cognome` "Rossi"/"Bianchi").
Nota: il torneo demo usa nomi-squadra fantasiosi (Squali del Molo…) ma i giocatori hanno cognome
"Rossi"/"Bianchi" per tutti, quindi le etichette potrebbero risultare uguali — per una verifica chiara
crea al volo un paio di squadre con cognomi distinti dalla TeamsScreen.

- [ ] **Step 5: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore: verifica finale etichetta cognomi 2x2"
```

---

## Note di esecuzione

- **Ordine:** Task 1 → 2 → 3 → 4 (dipendenza lineare).
- **Modelli (subagent-driven):** Task 1–2 hanno codice completo → transcription (modello economico); Task 3 tocca 4 screen + un test da adattare (integrazione, modello standard). Review per task + review whole-branch.
- **Fuori scope:** interruttore per-torneo; obbligo cognomi; seeding coi cognomi.
