# TorneiGen — Piano Fase 5A: rifinitura UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere l'app più guidata e chiara: sistema di notifiche (toast), schermata Riepilogo torneo con "prossimo passo", Impostazioni più chiare con "Verifica connessione", e sincronizzazione automatica delle iscrizioni all'apertura del torneo.

**Architecture:** Un contesto React `ToastProvider` fornisce toast effimeri usati in tutta l'app. Una nuova schermata `RiepilogoScreen` (landing del torneo) calcola lo "stato + prossimo passo" da dati locali (`useLiveQuery`). Un servizio `verificaConnessione` prova l'API Cloudflare. L'auto-sync riusa `getClient`/`nuoveIscrizioni`/`iscrizioneATeam` (Fase 3).

**Tech Stack:** React, react-router-dom, dexie-react-hooks (invariati).

## Global Constraints

- TypeScript strict. Styling **solo** con i token di `src/styles/tokens.css` (nessun hex nuovo). Riuso `Field`/`Button`. Copy italiano, sentence case, verbi attivi.
- La UI usa i servizi; nessuna logica di dominio nei componenti.
- Auto-import iscrizioni ≠ auto-conferma (nuove squadre come `in_attesa`).
- Commit frequenti, uno per task.

## File Structure

```
src/components/Toast.tsx           # ToastProvider + useToast + Toaster
src/services/verifica.ts           # verificaConnessione
src/services/verifica.test.ts
src/services/prossimoPasso.ts       # calcolo stato/azione consigliata (puro)
src/services/prossimoPasso.test.ts
src/screens/RiepilogoScreen.tsx     # hub del torneo
src/screens/SettingsScreen.tsx      # + verifica connessione
src/screens/RegistrationsAdminScreen.tsx  # + conferma tutte (già ha download/import)
src/app/App.tsx, AppShell.tsx, main.tsx   # rotta + nav + provider
```

---

### Task 1: Sistema toast (notifiche di conferma)

**Files:**
- Create: `src/components/Toast.tsx`
- Modify: `src/main.tsx` (avvolgere l'app con `ToastProvider` + montare `Toaster`)
- Test: `src/components/Toast.test.tsx`

**Interfaces:**
- Produces: `ToastProvider` (context), `useToast(): (msg: string, tipo?: 'successo' | 'errore') => void`, `Toaster` (renderizza i toast attivi). I toast scompaiono da soli dopo ~3s.

- [ ] **Step 1: Scrivere il test**

Create `src/components/Toast.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, Toaster, useToast } from './Toast'

function Demo() {
  const toast = useToast()
  return <button onClick={() => toast('Salvato')}>fai</button>
}

describe('Toast', () => {
  it('mostra un toast quando invocato', async () => {
    render(<ToastProvider><Demo /><Toaster /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: /fai/i }))
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- Toast`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/components/Toast.tsx` — `ToastProvider` con stato lista toast `{id, msg, tipo}`; `useToast` ritorna una funzione che aggiunge un toast e lo rimuove dopo 3000ms (`setTimeout`); `Toaster` renderizza i toast in un contenitore fisso (`role="status"`), con classi token (`--surface`, `--line`, `--sea` per successo, `--danger` per errore). Nessun hex nuovo.

- [ ] **Step 4: Cablare il provider**

In `src/main.tsx`, avvolgere `<App/>` con `<ToastProvider>` (dentro `<BrowserRouter>`) e montare `<Toaster/>`.

- [ ] **Step 5: Verificare passaggio**

Run: `npm test -- Toast` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 6: Commit**

```bash
git add src/components/Toast.tsx src/components/Toast.test.tsx src/main.tsx
git commit -m "feat(ui): sistema di notifiche toast"
```

---

### Task 2: Calcolo "prossimo passo" (servizio puro)

**Files:**
- Create: `src/services/prossimoPasso.ts`
- Test: `src/services/prossimoPasso.test.ts`

**Interfaces:**
- Consumes: `Tournament`, `Team`, `Match` da `../engine/types`.
- Produces: `prossimoPasso(t: Tournament, teams: Team[], matches: Match[]): { testo: string; azione: 'squadre' | 'conferma' | 'genera' | 'calendario' | 'punteggi' | 'nessuno'; rotta: string }` — azione consigliata dato lo stato.

- [ ] **Step 1: Scrivere i test**

Create `src/services/prossimoPasso.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prossimoPasso } from './prossimoPasso'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-01', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
}
const team = (id: string, stato: 'in_attesa' | 'confermata'): Team => ({ id, tournamentId: 't1', nome: id, players: [], stato, origine: 'manuale' })

describe('prossimoPasso', () => {
  it('nessuna squadra → aggiungi squadre', () => {
    expect(prossimoPasso(t, [], []).azione).toBe('squadre')
  })
  it('squadre in attesa → conferma', () => {
    expect(prossimoPasso(t, [team('a', 'in_attesa')], []).azione).toBe('conferma')
  })
  it('abbastanza confermate, nessun match → genera', () => {
    expect(prossimoPasso(t, [team('a', 'confermata'), team('b', 'confermata')], []).azione).toBe('genera')
  })
  it('match presenti → punteggi', () => {
    const m = { id: 'm', tournamentId: 't1', fase: 'girone' as const, round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata' as const }
    expect(prossimoPasso(t, [team('a', 'confermata'), team('b', 'confermata')], [m]).azione).toBe('punteggi')
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- prossimoPasso`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/services/prossimoPasso.ts`:
```ts
import type { Tournament, Team, Match } from '../engine/types'

export function prossimoPasso(
  t: Tournament,
  teams: Team[],
  matches: Match[],
): { testo: string; azione: 'squadre' | 'conferma' | 'genera' | 'calendario' | 'punteggi' | 'nessuno'; rotta: string } {
  const inAttesa = teams.filter((x) => x.stato === 'in_attesa').length
  const confermate = teams.filter((x) => x.stato === 'confermata').length
  const r = (suffix: string) => `/tornei/${t.id}/${suffix}`

  if (matches.length > 0) {
    return { testo: 'Inserisci i risultati delle partite.', azione: 'punteggi', rotta: r('tabellone') }
  }
  if (teams.length === 0) {
    return { testo: 'Aggiungi le squadre o apri le iscrizioni online.', azione: 'squadre', rotta: r('squadre') }
  }
  if (inAttesa > 0) {
    return { testo: `Conferma ${inAttesa} squadr${inAttesa === 1 ? 'a' : 'e'} in attesa.`, azione: 'conferma', rotta: r('squadre') }
  }
  if (confermate >= 2) {
    return { testo: 'Genera il tabellone del torneo.', azione: 'genera', rotta: r('tabellone') }
  }
  return { testo: 'Aggiungi almeno 2 squadre confermate.', azione: 'squadre', rotta: r('squadre') }
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- prossimoPasso`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/prossimoPasso.ts src/services/prossimoPasso.test.ts
git commit -m "feat(services): calcolo del prossimo passo consigliato"
```

---

### Task 3: Servizio "verifica connessione"

**Files:**
- Create: `src/services/verifica.ts`
- Test: `src/services/verifica.test.ts`

**Interfaces:**
- Consumes: `getApiBaseUrl`, `getReadToken` (da `./config`).
- Produces: `verificaConnessione(): Promise<{ ok: boolean; messaggio: string }>` — prova l'API: fetch raw a `${base}/api/torneo/__verifica__` (URL raggiungibile se risponde, anche 404), e a `${base}/api/iscrizioni/__verifica__` con Bearer token (401 = token errato). Ritorna esito leggibile.

- [ ] **Step 1: Scrivere i test**

Create `src/services/verifica.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { verificaConnessione } from './verifica'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function fetchMap(map: Record<string, number>) {
  return vi.fn(async (url: string) => {
    const status = url.includes('/iscrizioni/') ? map.iscrizioni : map.torneo
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } })
  })
}

describe('verificaConnessione', () => {
  it('URL raggiungibile + token valido → ok', async () => {
    localStorage.setItem('readToken', 'tok')
    vi.stubGlobal('fetch', fetchMap({ torneo: 404, iscrizioni: 404 }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(true)
  })
  it('token errato (401) → non ok', async () => {
    localStorage.setItem('readToken', 'tok')
    vi.stubGlobal('fetch', fetchMap({ torneo: 404, iscrizioni: 401 }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/token/i)
  })
  it('URL irraggiungibile (fetch fallisce) → non ok', async () => {
    localStorage.setItem('readToken', 'tok')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/raggiung/i)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- verifica`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/services/verifica.ts`:
```ts
import { getApiBaseUrl, getReadToken } from './config'

export async function verificaConnessione(): Promise<{ ok: boolean; messaggio: string }> {
  const base = getApiBaseUrl().replace(/\/+$/, '')
  const token = getReadToken()
  // 1) URL raggiungibile?
  try {
    await fetch(`${base}/api/torneo/__verifica__`)
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  // 2) token valido?
  if (!token) return { ok: false, messaggio: 'Token mancante: impostalo nelle Impostazioni.' }
  try {
    const res = await fetch(`${base}/api/iscrizioni/__verifica__`, { headers: { authorization: `Bearer ${token}` } })
    if (res.status === 401) return { ok: false, messaggio: 'Token non valido: controlla le Impostazioni.' }
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  return { ok: true, messaggio: 'Connesso: URL e token corretti.' }
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- verifica`
Expected: PASS.

- [ ] **Step 5: Aggiungere il bottone nelle Impostazioni**

In `src/screens/SettingsScreen.tsx`: aggiungere testo esplicativo (URL API = il tuo Worker; Token = chiave privata del tuo deploy, si imposta una volta, non condividerla) e un bottone **"Verifica connessione"** che chiama `verificaConnessione()` e mostra l'esito in un `role="status"`/`role="alert"` (✓/✗ con messaggio). Salvare prima i valori correnti o usarli dai campi. Stile token.

- [ ] **Step 6: Verificare**

Run: `npm test -- verifica SettingsScreen` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 7: Commit**

```bash
git add src/services/verifica.ts src/services/verifica.test.ts src/screens/SettingsScreen.tsx
git commit -m "feat(ui): verifica connessione nelle impostazioni"
```

---

### Task 4: Schermata Riepilogo (hub del torneo)

**Files:**
- Create: `src/screens/RiepilogoScreen.tsx`
- Modify: `src/app/App.tsx` (rotta `/tornei/:id`), `src/app/AppShell.tsx` (voce nav "Riepilogo"), `src/screens/HomeScreen.tsx` (le card puntano a `/tornei/:id` invece di `/squadre`)
- Test: `src/screens/RiepilogoScreen.test.tsx`

**Interfaces:**
- Consumes: `getTournament`, `teamsOf`, `matchesOf` (repositories), `useLiveQuery`, `prossimoPasso` (Task 2).
- Produces: hub che mostra stato + conteggi + "prossimo passo" con bottone che naviga alla `rotta` consigliata.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/RiepilogoScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { RiepilogoScreen } from './RiepilogoScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'Coppa Estate', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-01',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'ABC',
}

describe('RiepilogoScreen', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.teams.clear(), db.matches.clear()]); await saveTournament(t) })

  it('mostra il nome e un prossimo passo (aggiungi squadre)', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1']}>
        <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Coppa Estate')).toBeInTheDocument()
    expect(await screen.findByText(/aggiungi le squadre/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- RiepilogoScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/RiepilogoScreen.tsx` — `useParams().id`; `useLiveQuery` per torneo/squadre/match; mostra nome + badge (tipologia/formato/stato), conteggi (confermate/in attesa), stato iscrizioni. Calcola `prossimoPasso(torneo, teams, matches)` e mostra un riquadro con `testo` + un `<Link>`/`Button` alla `rotta`. Stile token, riuso `Badge`/`Button`.
Aggiornare `App.tsx`: `<Route path="tornei/:id" element={<RiepilogoScreen />} />` (index del torneo). In `AppShell` aggiungere la voce nav "Riepilogo" per il torneo attivo (prima di Squadre). In `HomeScreen`, le card del torneo puntano a `/tornei/${t.id}` (era `/squadre`).

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- RiepilogoScreen` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): schermata riepilogo torneo con prossimo passo"
```

---

### Task 5: Iscrizioni auto-sync + conferma tutte

**Files:**
- Modify: `src/screens/RiepilogoScreen.tsx` (auto-sync all'apertura) o `src/screens/RegistrationsAdminScreen.tsx` (Aggiorna + Conferma tutte)
- Test: aggiornare i test relativi

**Interfaces:**
- Consumes: `getClient`, `getReadToken` (config), `nuoveIscrizioni`/`iscrizioneATeam` (import), `teamsOf`, `db.teams`, `useToast` (Task 1).
- Produces:
  - **Auto-sync**: all'apertura del Riepilogo, se `getReadToken()` è presente, chiama `getClient().elencaIscrizioni(codice)`, filtra con `nuoveIscrizioni` verso le squadre esistenti, importa le nuove come `in_attesa` (`db.teams.bulkPut`), e mostra un toast "N nuove iscrizioni" (nessun toast se 0). Errori silenziati (non bloccare l'apertura) tranne un avviso discreto se il token è errato.
  - **Conferma tutte**: bottone (nel Riepilogo o in Squadre) che imposta `stato: 'confermata'` su tutte le squadre `in_attesa` del torneo, con toast.

- [ ] **Step 1: Scrivere il test dell'auto-sync**

Aggiungere a `RiepilogoScreen.test.tsx`:
```tsx
it('auto-importa le nuove iscrizioni come squadre in attesa', async () => {
  localStorage.setItem('readToken', 'tok')
  const f = vi.fn(async () => new Response(JSON.stringify({ iscrizioni: [{ id: '1', codice: 'ABC', nomeSquadra: 'Squali', createdAt: '', giocatori: [{ nome: 'A', cognome: 'B', email: 'a@x.it', telefono: '1' }, { nome: 'C', cognome: 'D', email: 'c@x.it', telefono: '2' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', f)
  render(
    <MemoryRouter initialEntries={['/tornei/t1']}>
      <ToastProvider>
        <Routes><Route path="/tornei/:id" element={<RiepilogoScreen />} /></Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  await screen.findByText('Coppa Estate')
  await vi.waitFor(async () => {
    const teams = await db.teams.where('tournamentId').equals('t1').toArray()
    expect(teams.some((t) => t.nome === 'Squali' && t.stato === 'in_attesa')).toBe(true)
  })
})
```
(Avvolgere il render con `ToastProvider`; importare `vi`, `ToastProvider`.)

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- RiepilogoScreen`
Expected: FAIL sul nuovo caso.

- [ ] **Step 3: Implementare**

In `RiepilogoScreen.tsx`: un `useEffect` al mount (dipendente da `id` e presenza torneo) che, se `getReadToken()` è presente, esegue l'auto-sync (elenca → `nuoveIscrizioni` vs `teamsOf(id)` → `db.teams.bulkPut(iscrizioneATeam(...))`) e mostra un toast col numero di nuove iscrizioni (via `useToast`). Guard contro doppie esecuzioni/unmount. Errori: catch silenzioso (non bloccare); se 401, toast d'errore "token non valido". Aggiungere un pulsante **"Aggiorna iscrizioni"** che rilancia lo stesso sync manualmente.
Aggiungere **"Conferma tutte"** (dove ci sono squadre in attesa): `await db.teams.where({tournamentId:id, stato:'in_attesa'}).modify({stato:'confermata'})` (o iterazione con `update`), con toast.

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- RiepilogoScreen` → PASS. Intera suite verde, tsc pulito, build ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): auto-sync iscrizioni all'apertura e conferma tutte"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (A):** toast → Task 1; prossimo passo (logica) → Task 2; verifica connessione → Task 3; Riepilogo hub → Task 4; auto-sync + conferma tutte → Task 5.
- **Placeholder:** servizi (prossimoPasso, verifica) con codice completo e test; Toast con codice-chiave + test; task UI con contratto, comportamento e test.
- **Consistenza:** `prossimoPasso` consumato dal Riepilogo; `useToast` usato da auto-sync e altrove; `verificaConnessione` usa `config`; auto-sync riusa `import`/`getClient` (Fase 3), import come `in_attesa` (coerente col filtro generazione confermate).

## Prossimo piano

- **Piano B — Calendario**: config (giornate/campi/durata) nel Setup; motore `pianifica` (TDD); azione "Programma calendario" + vista calendario; spostamento manuale.
