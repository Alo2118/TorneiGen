# TorneiGen — Cognomi nel flusso iscrizioni online (2x2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel flusso iscrizioni online, nel 2x2 identificare le coppie coi cognomi dei giocatori (nome squadra facoltativo nel form, Worker che accetta nome vuoto, schermata Iscrizioni e deduplica per cognomi); 4x4 invariato.

**Architecture:** Un helper puro `etichettaIscrizione` (che condivide il nucleo con `etichettaSquadra`) deriva l'etichetta da un'iscrizione. La deduplica `nuoveIscrizioni` confronta per etichetta invece che per nome. Il form pubblico rende opzionale il nome per il 2x2 e il Worker non lo richiede più per il 2x2 (legge la tipologia dal Riepilogo salvato).

**Tech Stack:** Vite + React 18 + TypeScript strict, Vitest + @testing-library/react, Cloudflare Worker (handler puro + fakeKV). Nessuna nuova dipendenza.

## Global Constraints

- TypeScript **strict**: nessun `any`, nessun errore `tsc --noEmit`.
- Copy in **italiano**; solo design token; **motore di torneo invariato**.
- Solo **cognomi** come identità pubblica della coppia; email/telefono/nomi propri restano privati.
- **Verifica su WSL**: suite vitest completa inaffidabile → run mirati (`npm test -- <file>`), `npx tsc --noEmit`, `npx vite build`. Worker: `npm test -- worker/src/handler.test.ts`.
- Tipi: `Iscrizione { id, codice, nomeSquadra, giocatori: GiocatoreIscrizione[], createdAt }`; `GiocatoreIscrizione { nome, cognome, email, telefono }` (in `src/types/registrations.ts`). `Team`, `Tipologia` in `src/engine/types`. `Riepilogo` (in `registrations.ts`) contiene `tipologia`.
- Etichetta 2x2 = cognomi non vuoti uniti da `" / "` (ordine di inserimento); fallback `nome`→`id`. 4x4 = `nome`→`id`.

---

## File Structure

- **Modify** `src/services/teams.ts` — refactor a nucleo condiviso + `etichettaIscrizione`.
- **Modify** `src/services/teams.test.ts` — test di `etichettaIscrizione`.
- **Modify** `src/services/import.ts` — `nuoveIscrizioni(…, tipologia)` per etichetta.
- **Modify** `src/services/import.test.ts` — test deduplica per etichetta.
- **Modify** `src/screens/RiepilogoScreen.tsx`, `src/screens/RegistrationsAdminScreen.tsx` — passano `torneo.tipologia` a `nuoveIscrizioni`.
- **Modify** `worker/src/handler.ts` — POST iscrizioni: nome opzionale per 2x2.
- **Modify** `worker/src/handler.test.ts` — test 2x2/4x4.
- **Modify** `src/screens/RegistrationScreen.tsx` — campo nome opzionale per 2x2.
- **Modify** `src/screens/RegistrationsAdminScreen.tsx` — etichetta coi cognomi nell'elenco.
- **Modify** `src/screens/RegistrationScreen.test.tsx`, `src/screens/RegistrationsAdminScreen.test.tsx` — test.

---

## Task 1: Helper `etichettaIscrizione` + deduplica per etichetta

**Files:**
- Modify: `src/services/teams.ts`, `src/services/import.ts`
- Modify: `src/services/teams.test.ts`, `src/services/import.test.ts`
- Modify: `src/screens/RiepilogoScreen.tsx`, `src/screens/RegistrationsAdminScreen.tsx` (solo la chiamata a `nuoveIscrizioni`)

**Interfaces:**
- Produces:
  - `etichettaIscrizione(iscr: Iscrizione, tipologia: Tipologia): string`
  - `nuoveIscrizioni(iscrizioni: Iscrizione[], teamsEsistenti: Team[], tipologia: Tipologia): Iscrizione[]`
  - `etichettaSquadra` invariata nel comportamento (refactor interno).

- [ ] **Step 1: Scrivi i test (falliscono)**

Aggiungi a `src/services/teams.test.ts` (aggiungi l'import `etichettaIscrizione` a quello esistente da `./teams`, e `import type { Iscrizione } from '../types/registrations'`):

```ts
function iscr(id: string, nomeSquadra: string, cognomi: string[]): Iscrizione {
  return { id, codice: 'ABC', nomeSquadra, createdAt: '',
    giocatori: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })) }
}
describe('etichettaIscrizione', () => {
  it('2x2: unisce i cognomi', () => {
    expect(etichettaIscrizione(iscr('a', 'Squali', ['Rossi', 'Bianchi']), '2x2')).toBe('Rossi / Bianchi')
  })
  it('2x2: senza cognomi ripiega sul nome squadra', () => {
    expect(etichettaIscrizione(iscr('a', 'Squali', ['', '']), '2x2')).toBe('Squali')
  })
  it('4x4: usa il nome squadra', () => {
    expect(etichettaIscrizione(iscr('a', 'Squali', ['Rossi', 'Bianchi', 'Verdi', 'Neri']), '4x4')).toBe('Squali')
  })
})
```

Aggiungi/aggiorna in `src/services/import.test.ts` (il file esiste; aggiungi l'import di `Tipologia` se serve e adatta le fixture al pattern del file):

```ts
import { nuoveIscrizioni } from './import'
import type { Iscrizione } from '../types/registrations'
import type { Team } from '../engine/types'

function isc(id: string, nomeSquadra: string, cognomi: string[]): Iscrizione {
  return { id, codice: 'ABC', nomeSquadra, createdAt: '',
    giocatori: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })) }
}
function tm(id: string, nome: string, cognomi: string[]): Team {
  return { id, tournamentId: 't', nome, stato: 'confermata', origine: 'online',
    players: cognomi.map((c) => ({ nome: 'X', cognome: c, email: 'x@x.it', telefono: '1' })) }
}

describe('nuoveIscrizioni: deduplica per etichetta', () => {
  it('2x2: due coppie con nome vuoto ma cognomi diversi NON vengono fuse', () => {
    const nuove = nuoveIscrizioni(
      [isc('1', '', ['Rossi', 'Bianchi']), isc('2', '', ['Verdi', 'Neri'])],
      [],
      '2x2',
    )
    expect(nuove.map((i) => i.id)).toEqual(['1', '2'])
  })
  it('2x2: scarta l\'iscrizione la cui etichetta (cognomi) coincide con una squadra esistente', () => {
    const nuove = nuoveIscrizioni(
      [isc('1', '', ['Rossi', 'Bianchi']), isc('2', '', ['Verdi', 'Neri'])],
      [tm('t1', 'Qualcosa', ['Rossi', 'Bianchi'])],
      '2x2',
    )
    expect(nuove.map((i) => i.id)).toEqual(['2'])
  })
})
```

Se `import.test.ts` ha già test per `nuoveIscrizioni` con la vecchia firma a 2 argomenti, aggiornali passando la tipologia (`'2x2'` o `'4x4'`) senza indebolire le asserzioni.

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/services/teams.test.ts src/services/import.test.ts`
Expected: FAIL — `etichettaIscrizione` non esiste; `nuoveIscrizioni` ha una firma diversa / dedup per nome.

- [ ] **Step 3: Implementa in `src/services/teams.ts`**

Rifattorizza a un nucleo condiviso e aggiungi `etichettaIscrizione`. Aggiungi l'import del tipo in cima:
```ts
import type { Iscrizione } from '../types/registrations'
```
Sostituisci `etichettaSquadra` con:
```ts
function etichettaCore(cognomi: string[], nome: string, id: string, tipologia: Tipologia): string {
  if (tipologia === '2x2') {
    const c = cognomi.map((x) => x.trim()).filter(Boolean)
    if (c.length > 0) return c.join(' / ')
  }
  return nome.trim() || id
}

export function etichettaSquadra(team: Team, tipologia: Tipologia): string {
  return etichettaCore(team.players.map((p) => p.cognome), team.nome, team.id, tipologia)
}

export function etichettaIscrizione(iscr: Iscrizione, tipologia: Tipologia): string {
  return etichettaCore(iscr.giocatori.map((g) => g.cognome), iscr.nomeSquadra, iscr.id, tipologia)
}
```
(Lascia `numeroGiocatori`, `mappaEtichette`, `validaSquadra` invariati.)

- [ ] **Step 4: Implementa in `src/services/import.ts`**

Sostituisci l'intero contenuto di `nuoveIscrizioni` e aggiungi gli import necessari:
```ts
import type { Iscrizione } from '../types/registrations'
import type { Team, Tipologia } from '../engine/types'
import { newId } from '../engine/id'
import { etichettaSquadra, etichettaIscrizione } from './teams'
```
(`iscrizioneATeam` resta invariata.) Sostituisci `nuoveIscrizioni` con:
```ts
export function nuoveIscrizioni(
  iscrizioni: Iscrizione[],
  teamsEsistenti: Team[],
  tipologia: Tipologia,
): Iscrizione[] {
  const chiavi = new Set(teamsEsistenti.map((t) => etichettaSquadra(t, tipologia).trim().toLowerCase()))
  return iscrizioni.filter((i) => !chiavi.has(etichettaIscrizione(i, tipologia).trim().toLowerCase()))
}
```

- [ ] **Step 5: Aggiorna i due chiamanti (per far compilare)**

In `src/screens/RiepilogoScreen.tsx`, la chiamata `nuoveIscrizioni(tutte, esistenti)` → `nuoveIscrizioni(tutte, esistenti, torneo.tipologia)` (`torneo` è già disponibile nello screen).
In `src/screens/RegistrationsAdminScreen.tsx`, la chiamata `const nuove = nuoveIscrizioni(tutte, esistenti)` → `const nuove = nuoveIscrizioni(tutte, esistenti, torneo.tipologia)` (`torneo` è già disponibile).

- [ ] **Step 6: Esegui i test + typecheck**

Run: `npm test -- src/services/teams.test.ts src/services/import.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add src/services/teams.ts src/services/teams.test.ts src/services/import.ts src/services/import.test.ts src/screens/RiepilogoScreen.tsx src/screens/RegistrationsAdminScreen.tsx
git commit -m "feat(services): etichettaIscrizione + deduplica iscrizioni per etichetta (2x2)"
```

---

## Task 2: Worker — nome squadra opzionale per il 2x2

**Files:**
- Modify: `worker/src/handler.ts`
- Test: `worker/src/handler.test.ts`

**Interfaces:**
- Consumes: `Riepilogo.tipologia` (già nello snapshot `torneo:${codice}`).

- [ ] **Step 1: Scrivi i test (falliscono)**

Aggiungi in `worker/src/handler.test.ts` (usa gli helper esistenti `req`, `env`, `riepilogo`; il `riepilogo()` di default è `tipologia: '2x2'`):

```ts
  const giocatori2 = [
    { nome: 'A', cognome: 'Rossi', email: 'a@x.it', telefono: '1' },
    { nome: 'B', cognome: 'Bianchi', email: 'b@x.it', telefono: '2' },
  ]

  it('POST iscrizione 2x2 SENZA nomeSquadra -> 201 e salva', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '2x2' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { giocatori: giocatori2 } }), e)
    expect(r.status).toBe(201)
    const { keys } = await e.KV.list({ prefix: 'iscr:ABC:' })
    expect(keys.length).toBe(1)
  })

  it('POST iscrizione 4x4 SENZA nomeSquadra -> 400', async () => {
    const e = env({ 'torneo:ABC': riepilogo({ tipologia: '4x4' }) })
    const r = await handle(req('POST', '/api/iscrizioni/ABC', { body: { giocatori: giocatori2 } }), e)
    expect(r.status).toBe(400)
  })
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: FAIL — la POST 2x2 senza nomeSquadra oggi ritorna 400.

- [ ] **Step 3: Implementa in `worker/src/handler.ts`**

Nel blocco `POST /api/iscrizioni/:codice`, sostituisci la lettura del riepilogo e il controllo del nome. Trova:
```ts
    const raw = await env.KV.get(`torneo:${p2}`)
    if (!raw) return json({ error: 'torneo non trovato' }, 404)
    if ((JSON.parse(raw) as Riepilogo).chiuso) return json({ error: 'iscrizioni chiuse' }, 403)
```
Sostituisci con:
```ts
    const raw = await env.KV.get(`torneo:${p2}`)
    if (!raw) return json({ error: 'torneo non trovato' }, 404)
    const rip = JSON.parse(raw) as Riepilogo
    if (rip.chiuso) return json({ error: 'iscrizioni chiuse' }, 403)
```
Poi trova:
```ts
    if (!b.nomeSquadra?.trim() || !Array.isArray(b.giocatori) || b.giocatori.length === 0) return json({ error: 'iscrizione incompleta' }, 400)
```
Sostituisci con:
```ts
    if (!Array.isArray(b.giocatori) || b.giocatori.length === 0) return json({ error: 'iscrizione incompleta' }, 400)
    // nel 2x2 il nome squadra è facoltativo (identità = cognomi dei giocatori)
    if (rip.tipologia !== '2x2' && !b.nomeSquadra?.trim()) return json({ error: 'iscrizione incompleta' }, 400)
```
Infine, dove si costruisce l'iscrizione, trova:
```ts
    const iscr: Iscrizione = { id, codice: p2, nomeSquadra: b.nomeSquadra, giocatori: b.giocatori, createdAt: new Date().toISOString() }
```
Sostituisci con (salva stringa vuota se assente):
```ts
    const iscr: Iscrizione = { id, codice: p2, nomeSquadra: b.nomeSquadra ?? '', giocatori: b.giocatori, createdAt: new Date().toISOString() }
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npm test -- worker/src/handler.test.ts`
Expected: PASS (inclusi i preesistenti).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add worker/src/handler.ts worker/src/handler.test.ts
git commit -m "feat(worker): nomeSquadra facoltativo nelle iscrizioni 2x2"
```

---

## Task 3: UI — form pubblico + elenco iscrizioni

**Files:**
- Modify: `src/screens/RegistrationScreen.tsx`, `src/screens/RegistrationsAdminScreen.tsx`
- Test: `src/screens/RegistrationScreen.test.tsx`, `src/screens/RegistrationsAdminScreen.test.tsx`

**Interfaces:**
- Consumes: `etichettaIscrizione` (Task 1).

- [ ] **Step 1: RegistrationScreen — campo nome opzionale per 2x2**

In `src/screens/RegistrationScreen.tsx`, sostituisci:
```tsx
        <Field label="Nome squadra" id="nome-squadra" value={nome} onChange={(e) => setNome(e.target.value)} required />
```
con:
```tsx
        <Field
          label={riepilogo.tipologia === '2x2' ? 'Nome squadra (facoltativo)' : 'Nome squadra'}
          id="nome-squadra"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required={riepilogo.tipologia !== '2x2'}
        />
```
(Il client `validaSquadra` accetta già nome vuoto nel 2x2; nessun'altra logica cambia.)

- [ ] **Step 2: RegistrationsAdminScreen — etichetta coi cognomi**

In `src/screens/RegistrationsAdminScreen.tsx`, aggiungi l'import:
```ts
import { etichettaIscrizione } from '../services/teams'
```
e sostituisci nella lista delle iscrizioni:
```tsx
                    <span className="field-label">{i.nomeSquadra}</span>
```
con:
```tsx
                    <span className="field-label">{etichettaIscrizione(i, torneo.tipologia)}</span>
```
(`torneo` è garantito non-null: lo screen fa `if (!id || !torneo) return null`. La riga sotto che mostra i nomi completi dei giocatori resta invariata.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Test**

`RegistrationScreen.test.tsx` (esiste; mocka `getClient`): aggiungi un test in cui il torneo è **2x2** e, compilando solo i 2 giocatori (coi cognomi) e **lasciando vuoto** il nome squadra, il submit chiama `inviaIscrizione` con `nomeSquadra: ''`. Adatta le query al pattern del file esistente (lo screen carica il `Riepilogo` via `getClient().getRiepilogo`, quindi il mock deve restituire `tipologia: '2x2'`). Esempio dell'asserzione chiave:
```tsx
    await userEvent.click(screen.getByRole('button', { name: /invia iscrizione/i }))
    await waitFor(() => expect(inviaIscrizione).toHaveBeenCalledWith('ABC', expect.objectContaining({ nomeSquadra: '' })))
```

`RegistrationsAdminScreen.test.tsx` (esiste): aggiungi/aggiorna un test che, con un'iscrizione **2x2** in attesa (giocatori coi cognomi Rossi/Bianchi, `nomeSquadra: ''`), dopo "Scarica iscrizioni" mostra **"Rossi / Bianchi"** nell'elenco. Adatta ai mock esistenti del file (`elencaIscrizioni`). Se il file non ha ancora test per l'elenco, seguine il pattern di setup (torneo 2x2 via `saveTournament`, mock del client).

Se un test esistente asseriva `nomeSquadra` dove ora compare l'etichetta, aggiornalo al minimo senza indebolirlo e mostra la modifica nel report.

- [ ] **Step 5: Esegui i test coinvolti**

Run: `npm test -- src/screens/RegistrationScreen.test.tsx src/screens/RegistrationsAdminScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/RegistrationScreen.tsx src/screens/RegistrationsAdminScreen.tsx src/screens/RegistrationScreen.test.tsx src/screens/RegistrationsAdminScreen.test.tsx
git commit -m "feat(ui): iscrizioni 2x2 col nome facoltativo + elenco coi cognomi"
```

---

## Task 4: Verifica finale

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati dei file toccati**

Run: `npm test -- src/services/teams.test.ts src/services/import.test.ts worker/src/handler.test.ts src/screens/RegistrationScreen.test.tsx src/screens/RegistrationsAdminScreen.test.tsx`
Expected: tutti verdi. (NON usare la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione**

Run: `npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore: verifica finale cognomi iscrizioni 2x2"
```

---

## Note di esecuzione

- **Ordine:** Task 1 → 2 → 3 → 4 (dipendenza lineare).
- **Modelli (subagent-driven):** Task 1–2 codice completo → transcription (modello economico); Task 3 tocca 2 screen + 2 test da adattare (integrazione, modello standard). Review per task + whole-branch.
- **Fuori scope:** validazione giocatori (cognome resta obbligatorio); etichetta 4x4 (usa il nome).
