# TorneiGen — Calendario a griglia orari × campi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrare il calendario come griglia orari × campi (una per giornata: righe = orari, colonne = campi), sostituendo la lista cronologica, sia nel calendario dell'organizzatore sia nella vista pubblica.

**Architecture:** Una funzione pura `buildCalendarGrid(matches)` costruisce, per ogni giornata, righe (orari) × colonne (campi) con le partite in ogni cella. Un componente `<CalendarGrid>` la rende come tabella (colonna orari sticky, scroll orizzontale su mobile), cliccabile nell'organizzatore (`onSeleziona`) e read-only nel pubblico. Lo scheduler non cambia.

**Tech Stack:** Vite + React 18 + TypeScript strict, Vitest + @testing-library/react. Nessuna nuova dipendenza.

## Global Constraints

- TypeScript **strict**: nessun `any`, nessun errore `tsc --noEmit`.
- **Solo design token** in `src/styles/tokens.css` (`--paper --surface --ink --muted --line --sea --sand --win --danger --radius --space --font-*`); nessun colore hardcoded nuovo; CSS in coda al file.
- Copy in **italiano**.
- **Scheduler / assegnazione campo-orario invariati**: solo visualizzazione. Le uniche aggiunte al motore sono funzioni **pure di presentazione**.
- **Verifica su WSL**: suite vitest completa inaffidabile (timeout worker) → run mirati (`npm test -- <file>`), `npx tsc --noEmit`, `npx vite build`.
- Modello dati (invariato): `Match` ha `orario?: string` (formato `YYYY-MM-DDTHH:mm`) e `campo?: string`. Solo le partite con `orario` compaiono nel calendario.
- Mostrare **solo i campi effettivamente presenti** nei dati (non 1…`numeroCampi` a prescindere). Un `campo` mancante/vuoto → colonna **"Da definire"**.

---

## File Structure

- **Create** `src/engine/calendarGrid.ts` — `buildCalendarGrid` + tipi + `CAMPO_VUOTO`.
- **Create** `src/engine/calendarGrid.test.ts`.
- **Create** `src/components/CalendarGrid.tsx` — tabella orari × campi.
- **Create** `src/components/CalendarGrid.test.tsx`.
- **Modify** `src/styles/tokens.css` — CSS della griglia (in coda).
- **Modify** `src/screens/CalendarScreen.tsx` — usa `<CalendarGrid onSeleziona={apriSposta}>`.
- **Modify** `src/components/PublicCalendar.tsx` — wrapper su `<CalendarGrid>` read-only.
- **Modify** `src/components/PublicCalendar.test.tsx` — aggiorna al nuovo markup.

---

## Task 1: `buildCalendarGrid` (funzione pura)

**Files:**
- Create: `src/engine/calendarGrid.ts`
- Test: `src/engine/calendarGrid.test.ts`

**Interfaces:**
- Consumes: `Match` da `src/engine/types`.
- Produces:
  - `export const CAMPO_VUOTO = 'Da definire'`
  - `export interface CellaGriglia { orario: string; campo: string; partite: Match[] }`
  - `export interface GiornataGriglia { data: string; campi: string[]; orari: string[]; celle: CellaGriglia[] }`
  - `export function buildCalendarGrid(matches: Match[]): GiornataGriglia[]`

- [ ] **Step 1: Scrivi i test (falliscono)**

```ts
// src/engine/calendarGrid.test.ts
import { describe, it, expect } from 'vitest'
import { buildCalendarGrid, CAMPO_VUOTO } from './calendarGrid'
import type { Match } from './types'

function m(p: Partial<Match> & { id: string }): Match {
  return { tournamentId: 't', fase: 'girone', round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata', ...p }
}

describe('buildCalendarGrid', () => {
  it('esclude le partite senza orario', () => {
    const g = buildCalendarGrid([m({ id: '1' })])
    expect(g).toEqual([])
  })

  it('raggruppa per giornata, ordinate per data', () => {
    const g = buildCalendarGrid([
      m({ id: '2', orario: '2026-07-21T09:00', campo: '1' }),
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
    ])
    expect(g.map((x) => x.data)).toEqual(['2026-07-20', '2026-07-21'])
  })

  it('colonne = campi distinti in ordine numerico; righe = orari ordinati', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:30', campo: '2' }),
      m({ id: '2', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '3', orario: '2026-07-20T09:00', campo: '2' }),
    ])
    expect(g[0].campi).toEqual(['1', '2'])
    expect(g[0].orari).toEqual(['09:00', '09:30'])
  })

  it('mette la partita nella cella (orario, campo) giusta; celle vuote senza partite', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:30', campo: '2' }),
    ])
    const cella = (o: string, c: string) => g[0].celle.find((x) => x.orario === o && x.campo === c)!
    expect(cella('09:00', '1').partite.map((p) => p.id)).toEqual(['1'])
    expect(cella('09:00', '2').partite).toEqual([])
    expect(cella('09:30', '2').partite.map((p) => p.id)).toEqual(['2'])
  })

  it('campo mancante -> colonna "Da definire", ordinata per ultima', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:00' }),
    ])
    expect(g[0].campi).toEqual(['1', CAMPO_VUOTO])
  })

  it('collisione: due partite sullo stesso incrocio stanno nella stessa cella', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:00', campo: '1' }),
    ])
    const cella = g[0].celle.find((x) => x.orario === '09:00' && x.campo === '1')!
    expect(cella.partite.map((p) => p.id)).toEqual(['1', '2'])
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/engine/calendarGrid.test.ts`
Expected: FAIL — "Failed to resolve import './calendarGrid'".

- [ ] **Step 3: Implementa `calendarGrid.ts`**

```ts
// src/engine/calendarGrid.ts
import type { Match } from './types'

export const CAMPO_VUOTO = 'Da definire'

export interface CellaGriglia {
  orario: string
  campo: string
  partite: Match[]
}
export interface GiornataGriglia {
  data: string
  campi: string[]
  orari: string[]
  celle: CellaGriglia[]
}

function ordinaCampi(campi: string[]): string[] {
  return [...campi].sort((a, b) => {
    if (a === CAMPO_VUOTO) return 1
    if (b === CAMPO_VUOTO) return -1
    const na = Number(a)
    const nb = Number(b)
    const aNum = a.trim() !== '' && !Number.isNaN(na)
    const bNum = b.trim() !== '' && !Number.isNaN(nb)
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return a.localeCompare(b)
  })
}

export function buildCalendarGrid(matches: Match[]): GiornataGriglia[] {
  const programmate = matches.filter((m): m is Match & { orario: string } => !!m.orario)
  const perData = new Map<string, Match[]>()
  for (const m of programmate) {
    const data = m.orario.slice(0, 10)
    const lista = perData.get(data) ?? []
    lista.push(m)
    perData.set(data, lista)
  }

  const campoDi = (m: Match): string => (m.campo && m.campo.trim() !== '' ? m.campo : CAMPO_VUOTO)
  const oraDi = (m: Match): string => m.orario!.slice(11, 16)

  return [...perData.keys()]
    .sort()
    .map((data) => {
      const ms = perData.get(data)!
      const campi = ordinaCampi([...new Set(ms.map(campoDi))])
      const orari = [...new Set(ms.map(oraDi))].sort()
      const celle: CellaGriglia[] = []
      for (const orario of orari) {
        for (const campo of campi) {
          celle.push({ orario, campo, partite: ms.filter((m) => oraDi(m) === orario && campoDi(m) === campo) })
        }
      }
      return { data, campi, orari, celle }
    })
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npm test -- src/engine/calendarGrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: nessun errore.

```bash
git add src/engine/calendarGrid.ts src/engine/calendarGrid.test.ts
git commit -m "feat(engine): buildCalendarGrid (griglia orari × campi, pura)"
```

---

## Task 2: Componente `CalendarGrid`

**Files:**
- Create: `src/components/CalendarGrid.tsx`
- Test: `src/components/CalendarGrid.test.tsx`
- Modify: `src/styles/tokens.css` (in coda)

**Interfaces:**
- Consumes: `buildCalendarGrid`, `CAMPO_VUOTO`, `CellaGriglia` da `../engine/calendarGrid`; `Match` da `../engine/types`.
- Produces: `export function CalendarGrid(props: { matches: Match[]; teamNames: Record<string,string>; onSeleziona?: (m: Match) => void }): JSX.Element | null`

- [ ] **Step 1: Scrivi i test (falliscono)**

```tsx
// src/components/CalendarGrid.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarGrid } from './CalendarGrid'
import type { Match } from '../engine/types'

function m(id: string, orario: string, campo: string, a: string, b: string): Match {
  return { id, tournamentId: 't', fase: 'girone', round: 1, teamAId: a, teamBId: b, set: [], stato: 'programmata', orario, campo }
}
const names = { a: 'Rossi', b: 'Bianchi', c: 'Verdi', d: 'Neri' }
const matches = [m('1', '2026-07-20T09:00', '1', 'a', 'b'), m('2', '2026-07-20T09:30', '2', 'c', 'd')]

describe('CalendarGrid', () => {
  it('rende le intestazioni dei campi e la colonna degli orari', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    expect(screen.getByText('Campo 1')).toBeTruthy()
    expect(screen.getByText('Campo 2')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText('09:30')).toBeTruthy()
  })
  it('mostra "—" nelle celle senza partita', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    // 2 orari × 2 campi = 4 celle, 2 piene -> 2 vuote
    expect(screen.getAllByText('—').length).toBe(2)
  })
  it('senza onSeleziona le partite non sono cliccabili', () => {
    render(<CalendarGrid matches={matches} teamNames={names} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('con onSeleziona il click su una partita chiama il callback', () => {
    const onSeleziona = vi.fn()
    render(<CalendarGrid matches={matches} teamNames={names} onSeleziona={onSeleziona} />)
    fireEvent.click(screen.getByRole('button', { name: /Rossi/ }))
    expect(onSeleziona).toHaveBeenCalledWith(matches[0])
  })
  it('non rende nulla se non ci sono partite programmate', () => {
    const { container } = render(<CalendarGrid matches={[]} teamNames={names} />)
    expect(container.querySelector('.calendar-grid')).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/components/CalendarGrid.test.tsx`
Expected: FAIL — "Failed to resolve import './CalendarGrid'".

- [ ] **Step 3: Implementa `CalendarGrid.tsx`**

```tsx
// src/components/CalendarGrid.tsx
import type { Match } from '../engine/types'
import { buildCalendarGrid, CAMPO_VUOTO } from '../engine/calendarGrid'
import type { CellaGriglia } from '../engine/calendarGrid'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  onSeleziona?: (match: Match) => void
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}
function formattaData(data: string): string {
  const d = new Date(`${data}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? data
    : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}
function etichettaCampo(campo: string): string {
  return campo === CAMPO_VUOTO ? campo : `Campo ${campo}`
}

export function CalendarGrid({ matches, teamNames, onSeleziona }: Props) {
  const giornate = buildCalendarGrid(matches)
  if (giornate.length === 0) return null

  const partiteDi = (celle: CellaGriglia[], orario: string, campo: string): Match[] =>
    celle.find((c) => c.orario === orario && c.campo === campo)?.partite ?? []

  return (
    <div className="calendar-grid">
      {giornate.map((g) => (
        <section key={g.data} className="calendar-grid-day">
          <h3 className="calendar-grid-title">{formattaData(g.data)}</h3>
          <div className="calendar-grid-scroll">
            <table className="calendar-grid-table">
              <thead>
                <tr>
                  <th className="calendar-grid-corner" scope="col"></th>
                  {g.campi.map((campo) => (
                    <th key={campo} className="calendar-grid-campo" scope="col">{etichettaCampo(campo)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.orari.map((orario) => (
                  <tr key={orario}>
                    <th className="calendar-grid-orario tnum" scope="row">{orario}</th>
                    {g.campi.map((campo) => {
                      const partite = partiteDi(g.celle, orario, campo)
                      if (partite.length === 0) {
                        return <td key={campo} className="calendar-grid-cell calendar-grid-cell-empty">—</td>
                      }
                      return (
                        <td key={campo} className={`calendar-grid-cell${partite.length > 1 ? ' calendar-grid-cell-collisione' : ''}`}>
                          {partite.length > 1 && (
                            <span className="calendar-grid-avviso" title="Più partite sullo stesso campo e orario">⚠</span>
                          )}
                          {partite.map((mm) => {
                            const testo = `${nome(mm.teamAId, teamNames)} — ${nome(mm.teamBId, teamNames)}`
                            return onSeleziona ? (
                              <button key={mm.id} type="button" className="calendar-grid-match" onClick={() => onSeleziona(mm)}>
                                {testo}
                              </button>
                            ) : (
                              <span key={mm.id} className="calendar-grid-match">{testo}</span>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Calendario a griglia orari × campi --- */
.calendar-grid { display: flex; flex-direction: column; gap: calc(var(--space) * 2); }
.calendar-grid-title { margin: 0 0 var(--space); font-size: 1rem; text-transform: capitalize; }
.calendar-grid-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.calendar-grid-table { border-collapse: collapse; width: 100%; }
.calendar-grid-table th,
.calendar-grid-table td { border: 1px solid var(--line); padding: var(--space); text-align: left; vertical-align: top; white-space: nowrap; }
.calendar-grid-campo { background: var(--paper); font-size: .85rem; color: var(--muted); font-weight: 600; }
.calendar-grid-corner { position: sticky; left: 0; background: var(--paper); z-index: 1; }
.calendar-grid-orario { position: sticky; left: 0; background: var(--surface); color: var(--ink); font-weight: 600; z-index: 1; }
.calendar-grid-cell-empty { color: var(--muted); text-align: center; }
.calendar-grid-cell-collisione { background: color-mix(in srgb, var(--danger) 8%, transparent); }
.calendar-grid-avviso { color: var(--danger); margin-right: 4px; }
.calendar-grid-match { display: block; background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; }
button.calendar-grid-match { cursor: pointer; }
button.calendar-grid-match:hover { color: var(--sea); text-decoration: underline; }
```

- [ ] **Step 5: Esegui i test (devono passare) + typecheck**

Run: `npm test -- src/components/CalendarGrid.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/components/CalendarGrid.tsx src/components/CalendarGrid.test.tsx src/styles/tokens.css
git commit -m "feat(ui): CalendarGrid (griglia orari × campi, sticky + scroll)"
```

---

## Task 3: Integrazione in CalendarScreen e PublicCalendar

**Files:**
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/components/PublicCalendar.tsx`
- Modify: `src/components/PublicCalendar.test.tsx`

**Interfaces:**
- Consumes: `CalendarGrid` (Task 2).

### CalendarScreen

- [ ] **Step 1: Aggiorna gli import**

In `src/screens/CalendarScreen.tsx` aggiungi:
```tsx
import { CalendarGrid } from '../components/CalendarGrid'
```

- [ ] **Step 2: Sostituisci la resa a lista con la griglia**

Nel corpo, la variabile `partiteProgrammate` (già presente) resta usata per l'etichetta del bottone. RIMUOVI il calcolo `giornateChiavi` / `giornate` e la funzione locale `formattaData` (ora vive in `CalendarGrid`). MANTIENI la funzione locale `nomeSquadra` (usata nel titolo della modale).

Sostituisci il blocco JSX che oggi rende `giornate.length === 0 ? <p className="empty">… : <div className="bracket-groups">…</div>` (l'intera resa a lista con `.calendar-row`) con:

```tsx
      {partiteProgrammate.length === 0 ? (
        <p className="empty">Nessuna partita programmata ancora.</p>
      ) : (
        <CalendarGrid matches={matches} teamNames={teamNames} onSeleziona={apriSposta} />
      )}
```

Nota: `matches` e `teamNames` sono già disponibili nello screen; `apriSposta(match)` è l'handler esistente che apre la modale "Sposta". Non toccare la modale né gli altri handler.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (se il progetto ha `noUnusedLocals`, rimuovi davvero `giornateChiavi`/`giornate`/`formattaData` locali).

### PublicCalendar

- [ ] **Step 4: Riscrivi `PublicCalendar` come wrapper su `CalendarGrid`**

Sostituisci l'intero contenuto di `src/components/PublicCalendar.tsx` con:

```tsx
import type { Match } from '../engine/types'
import { CalendarGrid } from './CalendarGrid'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
}

export function PublicCalendar({ matches, teamNames }: Props) {
  const haProgrammate = matches.some((m) => m.orario)
  if (!haProgrammate) return null
  return (
    <section className="public-calendar">
      <h2>Calendario</h2>
      <CalendarGrid matches={matches} teamNames={teamNames} />
    </section>
  )
}
```

- [ ] **Step 5: Aggiorna `PublicCalendar.test.tsx`**

Il markup è cambiato (griglia invece di lista, data formattata). Sostituisci il primo test così, e MANTIENI il secondo (nessuna partita → `null`) invariato:

```tsx
  it('mostra le partite programmate in griglia con orari e campi', () => {
    const matches = [
      m('1', '2026-07-20T09:00', '1', 'a', 'b'),
      m('2', '2026-07-20T10:00', '2', 'c', 'd'),
    ]
    render(<PublicCalendar matches={matches} teamNames={names} />)
    expect(screen.getByText('Calendario')).toBeTruthy()
    expect(screen.getByText('Campo 1')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText(/Rossi/)).toBeTruthy()
  })
```

(Se il file non importa già `screen`, aggiungilo all'import di `@testing-library/react`. La factory `m(...)` e `names` esistono già nel file dal test precedente.)

- [ ] **Step 6: Esegui i test coinvolti + typecheck**

Run: `npm test -- src/components/PublicCalendar.test.tsx src/screens/CalendarScreen.test.tsx src/screens/PublicViewScreen.test.tsx`
Expected: PASS. Se un test di `CalendarScreen`/`PublicViewScreen` cercava il vecchio markup a lista (`.calendar-row`, `.public-calendar-row`, o la data grezza), aggiornalo al minimo (griglia: `Campo N`, orario `HH:MM`, nomi squadra) senza indebolire le asserzioni; mostra la modifica nel report.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/components/PublicCalendar.tsx src/components/PublicCalendar.test.tsx
git commit -m "feat(ui): CalendarScreen e vista pubblica usano la griglia orari × campi"
```

---

## Task 4: Verifica finale (typecheck, build, screenshot)

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati dei file toccati**

Run: `npm test -- src/engine/calendarGrid.test.ts src/components/CalendarGrid.test.tsx src/components/PublicCalendar.test.tsx src/screens/CalendarScreen.test.tsx src/screens/PublicViewScreen.test.tsx`
Expected: tutti verdi. (NON usare la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione**

Run: `npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: Verifica visiva (screenshot headless)**

Riusa il flusso collaudato (chromium snap via CDP + `vite preview`): inietta in IndexedDB il torneo demo (`carica-demo-torneo.js`), poi **programma il calendario** (dallo screen Calendario o assegnando orari/campi alle partite dei gironi in IndexedDB), e cattura: (a) `/tornei/sim-demo/calendario` (griglia organizzatore, celle cliccabili) e (b) `/pubblico/SIMBV1` sezione Calendario (griglia read-only). Prova anche una **viewport da telefono** (es. 390px) per verificare lo scroll orizzontale con colonna orari fissa. Salva le immagini in `screenshot-simulazione/`.

- [ ] **Step 5: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore(calendario): verifica finale griglia orari × campi"
```

---

## Note di esecuzione

- **Ordine:** Task 1 → 2 → 3 → 4 (dipendenza lineare).
- **Modelli (subagent-driven):** Task 1–2 hanno codice completo → transcription (modello economico); Task 3 tocca screen esistenti (integrazione, modello standard). Review per task + review whole-branch prima del merge.
- **Fuori scope:** modifiche allo scheduler; drag-and-drop; colonne per campi non presenti nei dati.
