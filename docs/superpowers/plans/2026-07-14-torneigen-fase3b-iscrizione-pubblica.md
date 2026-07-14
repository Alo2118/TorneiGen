# TorneiGen — Piano Fase 3b: impostazioni + apri/chiudi iscrizioni + form pubblico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere usabile l'API 3a dalla UI: configurazione (URL API + token) lato organizzatore, azioni "Apri/Chiudi iscrizioni" che pubblicano il riepilogo e mostrano il link pubblico, e il **form pubblico** `/iscrizione/:codice` con cui i partecipanti si iscrivono.

**Architecture:** Un servizio `config` risolve l'URL base dell'API (default di build `VITE_API_BASE_URL`, sovrascrivibile in localStorage) e il token privato (solo localStorage), e fabbrica il client `registrations-api`. Le azioni organizzatore usano il token; il form pubblico usa solo l'URL base (i partecipanti non hanno token). La rotta pubblica è **fuori** dalla shell organizzatore.

**Tech Stack:** React, react-router-dom, il client `registrations-api` (3a), `dexie-react-hooks`, localStorage.

## Global Constraints

- TypeScript strict. Styling **solo** con i token di `src/styles/tokens.css` (nessun hex nuovo). Riuso `Field`/`Button`. Copy in italiano, sentence case, verbi attivi.
- La UI non reimplementa logica di dominio: usa i servizi (`config`, `registrations-api`, `teams`).
- L'URL base API: `localStorage.apiBaseUrl` se presente, altrimenti `import.meta.env.VITE_API_BASE_URL`, altrimenti `http://localhost:8787` (mock in dev). Il **token** sta solo in `localStorage.readToken` e non è mai esposto nel form pubblico.
- Il form pubblico (`/iscrizione/:codice`) ha layout **autonomo** (senza `AppShell`), è per i partecipanti.
- Validazione giocatori del form pubblico tramite `src/services/teams.ts` (2x2 = 2; 4x4 = 4..8; campi obbligatori).
- Quality floor: responsive, focus visibile, `prefers-reduced-motion` (già globali).
- Commit frequenti, uno per task.

## File Structure

```
src/services/config.ts            # URL base + token + getClient()
src/services/config.test.ts
src/screens/SettingsScreen.tsx     # /impostazioni (organizzatore)
src/screens/RegistrationsAdminScreen.tsx  # /tornei/:id/iscrizioni (apri/chiudi + link)
src/screens/RegistrationScreen.tsx # /iscrizione/:codice (pubblico, standalone)
```

---

### Task 1: Servizio config (URL API + token + client)

**Files:**
- Create: `src/services/config.ts`
- Create: `src/services/config.test.ts`

**Interfaces:**
- Consumes: `creaClient` da `./registrations-api`.
- Produces:
  - `getApiBaseUrl(): string`, `setApiBaseUrl(v: string): void`
  - `getReadToken(): string | undefined`, `setReadToken(v: string): void`
  - `getClient(): RegistrationsClient` — costruisce il client con URL base + token correnti.

- [ ] **Step 1: Scrivere i test**

Create `src/services/config.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getApiBaseUrl, setApiBaseUrl, getReadToken, setReadToken } from './config'

describe('config', () => {
  beforeEach(() => localStorage.clear())

  it('usa il default quando localStorage è vuoto', () => {
    // in test import.meta.env.VITE_API_BASE_URL è undefined -> fallback localhost:8787
    expect(getApiBaseUrl()).toBe('http://localhost:8787')
  })

  it('salva e rilegge apiBaseUrl', () => {
    setApiBaseUrl('https://api.esempio.dev')
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
  })

  it('token assente di default, poi salvato', () => {
    expect(getReadToken()).toBeUndefined()
    setReadToken('tok')
    expect(getReadToken()).toBe('tok')
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- services/config`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/services/config.ts`:
```ts
import { creaClient, type RegistrationsClient } from './registrations-api'

const DEFAULT_BASE = 'http://localhost:8787'

export function getApiBaseUrl(): string {
  const saved = localStorage.getItem('apiBaseUrl')
  if (saved) return saved
  const env = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  return env || DEFAULT_BASE
}

export function setApiBaseUrl(v: string): void {
  localStorage.setItem('apiBaseUrl', v.trim())
}

export function getReadToken(): string | undefined {
  return localStorage.getItem('readToken') ?? undefined
}

export function setReadToken(v: string): void {
  localStorage.setItem('readToken', v.trim())
}

export function getClient(): RegistrationsClient {
  return creaClient({ baseUrl: getApiBaseUrl(), token: getReadToken() })
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- services/config`
Expected: PASS.
Run: `npm test` intera suite verde; `npx tsc --noEmit -p tsconfig.app.json` pulito.

- [ ] **Step 5: Commit**

```bash
git add src/services/config.ts src/services/config.test.ts
git commit -m "feat(services): config URL API e token con client factory"
```

---

### Task 2: Schermata Impostazioni

**Files:**
- Create: `src/screens/SettingsScreen.tsx`
- Modify: `src/app/App.tsx` (rotta `/impostazioni`), `src/app/AppShell.tsx` (link a Impostazioni)
- Test: `src/screens/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `getApiBaseUrl/setApiBaseUrl/getReadToken/setReadToken` (Task 1).
- Produces: form per URL API e token, salva in localStorage; rotta `/impostazioni` sotto `AppShell`; link "Impostazioni" nella nav (visibile sempre, es. in fondo al rail / accessibile dalla Home).

- [ ] **Step 1: Scrivere il test**

Create `src/screens/SettingsScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsScreen } from './SettingsScreen'
import { getApiBaseUrl, getReadToken } from '../services/config'

describe('SettingsScreen', () => {
  beforeEach(() => localStorage.clear())

  it('salva URL API e token', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/url api/i), 'https://api.esempio.dev')
    await userEvent.type(screen.getByLabelText(/token/i), 'segreto')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
    expect(getReadToken()).toBe('segreto')
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- SettingsScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/SettingsScreen.tsx` — form controllato inizializzato da `getApiBaseUrl()`/`getReadToken()`; alla submit chiama `setApiBaseUrl`/`setReadToken` e mostra un feedback "Salvato". Etichette: "URL API", "Token di lettura" (con nota: "serve solo a te per scaricare le iscrizioni; non condividerlo"). Usa `Field`/`Button` e token di stile.
Aggiungere in `App.tsx` (sotto `AppShell`): `<Route path="impostazioni" element={<SettingsScreen />} />`.
In `AppShell.tsx` aggiungere un link "Impostazioni" (es. in fondo al rail, sempre visibile).

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- SettingsScreen` → PASS. Intera suite verde, tsc pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): schermata impostazioni (URL API e token)"
```

---

### Task 3: Apri/Chiudi iscrizioni + link pubblico

**Files:**
- Create: `src/screens/RegistrationsAdminScreen.tsx`
- Modify: `src/app/App.tsx` (rotta `/tornei/:id/iscrizioni`), `src/app/AppShell.tsx` (voce nav "Iscrizioni" per torneo attivo)
- Test: `src/screens/RegistrationsAdminScreen.test.tsx`

**Interfaces:**
- Consumes: `getClient` (Task 1), `getTournament`/`saveTournament` (repositories), `useLiveQuery`.
- Produces: schermata che mostra lo stato iscrizioni del torneo; **Apri iscrizioni** → `getClient().pubblicaRiepilogo({ codice, nome, tipologia, formato, chiuso: false, updatedAt })` e mostra il **link pubblico** `${location.origin}/iscrizione/<codice>` con bottone "Copia"; **Chiudi iscrizioni** → ripubblica con `chiuso: true`. Gestione errori (token/URL mancanti → messaggio che rimanda a Impostazioni). Nota: questa schermata verrà estesa in 3c con l'elenco/importazione.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/RegistrationsAdminScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { RegistrationsAdminScreen } from './RegistrationsAdminScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-14',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'ABC123',
}

describe('RegistrationsAdminScreen', () => {
  beforeEach(async () => { localStorage.clear(); await db.tournaments.clear(); await saveTournament(t); localStorage.setItem('readToken', 'tok') })
  afterEach(() => vi.restoreAllMocks())

  it('apre le iscrizioni pubblicando il riepilogo e mostra il link', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ codice: 'ABC123', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', chiuso: false, updatedAt: '' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', f)
    render(
      <MemoryRouter initialEntries={['/tornei/t1/iscrizioni']}>
        <Routes><Route path="/tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /apri iscrizioni/i }))
    expect(await screen.findByText(/iscrizione\/ABC123/i)).toBeInTheDocument()
    // ha chiamato POST /api/torneo con auth
    const call = f.mock.calls.find((c) => String(c[0]).endsWith('/api/torneo'))
    expect(call).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- RegistrationsAdminScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/RegistrationsAdminScreen.tsx` — carica il torneo (`useParams().id` + `useLiveQuery(getTournament)`). Se manca il token o l'URL (verifica `getReadToken()`), mostra un avviso con link a `/impostazioni`. Bottone **Apri iscrizioni**: costruisce il `Riepilogo` dal torneo e chiama `getClient().pubblicaRiepilogo(...)`; in caso di successo memorizza lo stato "aperte" (può ripubblicare `chiuso:true/false`) e mostra il link pubblico `${window.location.origin}/iscrizione/${codice}` con bottone **Copia** (`navigator.clipboard.writeText`). Bottone **Chiudi iscrizioni** → ripubblica con `chiuso:true`. Errori del client mostrati in un `role="alert"`. Stile con token, `Field`/`Button`.
Aggiungere in `App.tsx`: `<Route path="tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} />`. In `AppShell.tsx` aggiungere la voce nav "Iscrizioni" per il torneo attivo (accanto a Squadre/Tabellone/Classifiche).

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- RegistrationsAdminScreen` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): apri/chiudi iscrizioni online e link pubblico"
```

---

### Task 4: Form pubblico di iscrizione (standalone)

**Files:**
- Create: `src/screens/RegistrationScreen.tsx`
- Modify: `src/app/App.tsx` (rotta pubblica `/iscrizione/:codice`, FUORI da `AppShell`)
- Test: `src/screens/RegistrationScreen.test.tsx`

**Interfaces:**
- Consumes: `getClient` (Task 1), `numeroGiocatori`/`validaSquadra` (`src/services/teams.ts`).
- Produces: schermata pubblica autonoma che: 1) legge il riepilogo (`getClient().getRiepilogo(codice)`) per nome torneo + tipologia (numero giocatori); 2) se `chiuso` mostra "iscrizioni chiuse"; 3) form squadra + N giocatori (nome/cognome/email/telefono); 4) valida (numero giocatori per tipologia + campi); 5) invia (`getClient().inviaIscrizione(codice, { nomeSquadra, giocatori })`) e mostra conferma.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/RegistrationScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RegistrationScreen } from './RegistrationScreen'

const riepilogo = { codice: 'ABC', nome: 'Coppa Estate', tipologia: '2x2', formato: null, chiuso: false, updatedAt: '' }

function fetchSeq(responses: Array<{ status: number; body: unknown }>) {
  let i = 0
  return vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]; i++
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  })
}

describe('RegistrationScreen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('mostra il nome torneo e invia l\'iscrizione', async () => {
    vi.stubGlobal('fetch', fetchSeq([{ status: 200, body: riepilogo }, { status: 201, body: { ok: true, id: 'x1' } }]))
    render(
      <MemoryRouter initialEntries={['/iscrizione/ABC']}>
        <Routes><Route path="/iscrizione/:codice" element={<RegistrationScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Coppa Estate/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/nome squadra/i), 'Squali')
    await userEvent.type(screen.getByLabelText(/^nome$/i, { selector: '#p0-nome' }), 'Anna')
    // ... l'implementer compila i restanti campi obbligatori dei 2 giocatori ...
    // Il test minimo verifica il rendering del torneo; la compilazione completa è nell'implementazione.
  })

  it('mostra "iscrizioni chiuse" se il torneo è chiuso', async () => {
    vi.stubGlobal('fetch', fetchSeq([{ status: 200, body: { ...riepilogo, chiuso: true } }]))
    render(
      <MemoryRouter initialEntries={['/iscrizione/ABC']}>
        <Routes><Route path="/iscrizione/:codice" element={<RegistrationScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/chiuse/i)).toBeInTheDocument()
  })
})
```
Nota: l'implementer completi il primo test compilando tutti i campi dei giocatori e cliccando "Invia iscrizione", poi asserisca il messaggio di conferma (es. `/grazie|inviata|confermata/i`). Il numero di righe giocatore deriva da `numeroGiocatori(tipologia)`.

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- RegistrationScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/RegistrationScreen.tsx` — layout **autonomo** (nessuna `AppShell`), intestazione con il nome del torneo. Al mount: `getClient().getRiepilogo(codice)` → se errore/404 "torneo non trovato"; se `chiuso` messaggio "iscrizioni chiuse". Altrimenti form: nome squadra + `numeroGiocatori(tipologia)` righe giocatore (per 2x2 fisse 2; per 4x4 da 4 fino a 8 con aggiungi/rimuovi, come `TeamsScreen`), ciascuna con nome/cognome/email/telefono. Alla submit: costruisce `{ nome, players }` e valida con `validaSquadra`; se ok chiama `getClient().inviaIscrizione(codice, { nomeSquadra, giocatori })` e mostra conferma ("Grazie! Iscrizione inviata."). Errori in `role="alert"`. Stile con token, `Field`/`Button`, responsive. Gli id dei campi giocatore `p{i}-nome` ecc. per coerenza con i test.
Aggiungere in `App.tsx` una rotta **fuori** dalla route `AppShell`:
```tsx
<Route path="/iscrizione/:codice" element={<RegistrationScreen />} />
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- RegistrationScreen` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): form pubblico di iscrizione autoconfigurato"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (3b):** config URL/token → Task 1; impostazioni → Task 2; apri/chiudi iscrizioni + link pubblico → Task 3; form pubblico autoconfigurato → Task 4. Import (scarica/dedup/squadre in_attesa), conferma squadre e filtro generazione → Piano 3c.
- **Placeholder:** config service con codice completo e test reali; task UI con contratto, comportamento, codice-chiave e test comportamentale (il form pubblico ha una nota esplicita su completare la compilazione nel test).
- **Consistenza:** `getClient` fabbrica il client 3a; le chiamate usano le rotte del client (`getRiepilogo`, `pubblicaRiepilogo`, `inviaIscrizione`); il form pubblico usa SOLO chiamate pubbliche (nessun token); tipologia→numero giocatori via `teams.ts` come in `TeamsScreen`.

## Note per l'esecuzione

- Per test manuale end-to-end: `npm run mock:api` (mock su 8787) + `npm run dev`; senza `VITE_API_BASE_URL`, il default è già `localhost:8787`. Imposta il token `dev-token` in Impostazioni.
- Il form pubblico è pensato per essere aperto senza la config dell'organizzatore: usa l'URL base di default/build, non il token.

## Prossimo piano

- **Piano 3c — Import:** estende `RegistrationsAdminScreen` con "Scarica iscrizioni" (`elencaIscrizioni`), dedup verso squadre esistenti, import come `Team` (`origine:'online'`, `stato:'in_attesa'`); conferma squadre in `TeamsScreen`; filtro `generaTorneo` alle sole squadre `confermata`.
