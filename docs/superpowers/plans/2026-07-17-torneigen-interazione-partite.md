# Interazione partite (punteggio diretto + punteggio da calendario + drag-and-drop) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Inserire i punti digitandoli, segnare i risultati anche dal calendario, e spostare le partite con drag-and-drop (mouse + touch).

**Architecture:** `ScoreControl` passa da +/- a campi numerici. `CalendarGrid` mostra il risultato e (con callback) i pulsanti Punteggio/Sposta; `CalendarScreen` riusa la modale `ScoreControl` per segnare. Un hook `usePointerDrag` (eventi puntatore, niente librerie) rende le partite trascinabili sulle celle della griglia.

**Tech Stack:** TypeScript strict, React 18, Dexie, Vitest + @testing-library/react.

## Global Constraints

- TypeScript strict; copy italiano.
- **NB ambiente:** `npx tsc --noEmit` alla root è NO-OP (tsconfig references-only) → usa `npx tsc -b` (quello di `npm run build`). Niente `npm test` (flaky su WSL): run mirati + `tsc -b` + `npm run build`.
- Retro-compatibilità di `CalendarGrid`: senza callback (vista pubblica `PublicCalendar`) resta sola-lettura, ma ora mostra i risultati.
- Le scritture su DB nel calendario chiamano già `notificaModificaOrg` — mantienilo.
- Ogni commit termina con: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `ScoreControl` con campi digitabili

**Files:**
- Modify: `src/components/ScoreControl.tsx`
- Test: `src/components/ScoreControl.test.tsx`

**Interfaces:**
- Consumes: `RegolePunteggio, SetScore` (invariati). Props invariate (`regole`, `setIniziali`, `onSalva`).
- Produces: nessun cambio di firma; solo la UI interna cambia.

- [ ] **Step 1: Aggiorna i test (falliscono)**

Leggi `src/components/ScoreControl.test.tsx`. Sostituisci le interazioni sui pulsanti +/− con la digitazione nei campi. Casi (riusa il render/fixture già presenti nel file):

```tsx
it('salva i set digitati', () => {
  const onSalva = vi.fn()
  render(<ScoreControl regole={{ setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }} setIniziali={[]} onSalva={onSalva} />)
  fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Punteggio squadra B, set 1'), { target: { value: '18' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
  expect(onSalva).toHaveBeenCalledWith([{ puntiA: 21, puntiB: 18 }])
})

it('rivela il set successivo quando il primo set è vinto (best of 3)', () => {
  render(<ScoreControl regole={{ setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }} setIniziali={[]} onSalva={vi.fn()} />)
  expect(screen.queryByLabelText('Punteggio squadra A, set 2')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Punteggio squadra B, set 1'), { target: { value: '10' } })
  expect(screen.getByLabelText('Punteggio squadra A, set 2')).toBeInTheDocument()
})

it('non accetta valori negativi (li porta a 0)', () => {
  const onSalva = vi.fn()
  render(<ScoreControl regole={{ setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }} setIniziali={[]} onSalva={onSalva} />)
  fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '-5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
  expect(onSalva).toHaveBeenCalledWith([{ puntiA: 0, puntiB: 0 }])
})
```

Rimuovi i test che cliccavano i pulsanti +/− (non esistono più). Mantieni eventuali test sulla logica di rivelazione già presenti se compatibili.

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/components/ScoreControl.test.tsx`
Expected: FAIL (i campi non esistono ancora / vecchi selettori).

- [ ] **Step 3: Implementa i campi numerici**

In `src/components/ScoreControl.tsx`, sostituisci la funzione `step` con `setPunto`:

```ts
  function setPunto(index: number, squadra: 'puntiA' | 'puntiB', raw: string) {
    const val = Math.max(0, Math.floor(Number(raw) || 0))
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, [squadra]: val } : s)))
  }
```

E sostituisci i due blocchi `score-control-team` (i due `<button>` stepper + `<span>` valore) con un solo input per squadra. La struttura interna di `score-control-teams` diventa:

```tsx
              <div className="score-control-teams">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="score-control-input tnum"
                  aria-label={`Punteggio squadra A, set ${i + 1}`}
                  value={s.puntiA}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPunto(i, 'puntiA', e.target.value)}
                />
                <span className="score-control-sep">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="score-control-input tnum"
                  aria-label={`Punteggio squadra B, set ${i + 1}`}
                  value={s.puntiB}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPunto(i, 'puntiB', e.target.value)}
                />
              </div>
```

Lascia invariati `seed`, `targetSet`, `setDaMostrare`, il calcolo di `visibili`/`setAttivo`, le classi del set (attivo/set-point) e il blocco `score-control-actions` con **Salva**.

- [ ] **Step 4: Stile del campo**

In `src/styles/tokens.css`, aggiungi (accanto agli stili `.score-control-*` esistenti):

```css
.score-control-input {
  width: 3.5rem;
  text-align: center;
  font-size: 1.25rem;
  padding: var(--space);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--ink);
}
```

- [ ] **Step 5: Verifica che i test passino**

Run: `npx vitest run src/components/ScoreControl.test.tsx`
Expected: PASS. Poi `npx tsc -b` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScoreControl.tsx src/components/ScoreControl.test.tsx src/styles/tokens.css
git commit -m "feat: punteggio digitabile in ScoreControl (niente +/-)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Risultato + Punteggio dal calendario

**Files:**
- Modify: `src/components/CalendarGrid.tsx`
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/styles/tokens.css`
- Test: `src/components/CalendarGrid.test.tsx`, `src/screens/CalendarScreen.test.tsx`

**Interfaces:**
- Consumes: `Match`, `salvaEProppaga`, `ScoreControl`, `Modal`.
- Produces: `CalendarGrid` props: `onPunteggio?: (m: Match) => void`, `onSposta?: (m: Match) => void` (sostituiscono `onSeleziona`). Mostra sempre il risultato compatto.

- [ ] **Step 1: Scrivi/aggiorna i test (falliscono)**

In `src/components/CalendarGrid.test.tsx` (leggi il file per riusare i fixture): la prop `onSeleziona` non esiste più → **aggiorna/rimuovi** i test esistenti che la usavano o che cliccavano la partita come `<button>` (ora la partita è un contenitore con i pulsanti «Punteggio»/«Sposta»). Poi aggiungi:

```tsx
it('mostra il risultato compatto quando ci sono set', () => {
  const matches = [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: 'a', teamBId: 'b', orario: '2026-07-20T19:00', campo: '1', set: [{ puntiA: 21, puntiB: 18 }, { puntiA: 15, puntiB: 12 }], stato: 'conclusa', vincitoreId: 'a' }] as Match[]
  render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} />)
  expect(screen.getByText('21–18 15–12')).toBeInTheDocument()
})

it('mostra i pulsanti Punteggio/Sposta solo con le callback', () => {
  const matches = [{ id: 'm1', tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: 'a', teamBId: 'b', orario: '2026-07-20T19:00', campo: '1', set: [], stato: 'programmata' }] as Match[]
  const { rerender } = render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} />)
  expect(screen.queryByRole('button', { name: 'Punteggio' })).not.toBeInTheDocument()
  rerender(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa', b: 'Beta' }} onPunteggio={() => {}} onSposta={() => {}} />)
  expect(screen.getByRole('button', { name: 'Punteggio' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sposta' })).toBeInTheDocument()
})

it('nasconde Punteggio se una squadra non è definita', () => {
  const matches = [{ id: 'm1', tournamentId: 't', fase: 'tabellone', round: 1, teamAId: 'a', teamBId: null, orario: '2026-07-20T19:00', campo: '1', set: [], stato: 'programmata' }] as Match[]
  render(<CalendarGrid matches={matches} teamNames={{ a: 'Alfa' }} onPunteggio={() => {}} onSposta={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Punteggio' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sposta' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Verifica RED**

Run: `npx vitest run src/components/CalendarGrid.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Aggiorna `CalendarGrid`**

In `src/components/CalendarGrid.tsx`: cambia le props e la resa della partita.

Props:
```ts
interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  onPunteggio?: (m: Match) => void
  onSposta?: (m: Match) => void
}
export function CalendarGrid({ matches, teamNames, onPunteggio, onSposta }: Props) {
```

Sostituisci il blocco `partite.map((mm) => { ... onSeleziona ... })` con:

```tsx
                          {partite.map((mm) => {
                            const testo = `${nome(mm.teamAId, teamNames)} — ${nome(mm.teamBId, teamNames)}`
                            const risultato = mm.set.length > 0 ? mm.set.map((s) => `${s.puntiA}–${s.puntiB}`).join(' ') : null
                            const interattiva = Boolean(onPunteggio || onSposta)
                            return (
                              <div key={mm.id} className="calendar-grid-match">
                                <span className="calendar-grid-match-teams">{testo}</span>
                                {risultato && <span className="calendar-grid-match-score tnum">{risultato}</span>}
                                {interattiva && (
                                  <div className="calendar-grid-match-actions">
                                    {onPunteggio && mm.teamAId && mm.teamBId && (
                                      <button type="button" className="calendar-grid-action" onClick={() => onPunteggio(mm)}>Punteggio</button>
                                    )}
                                    {onSposta && (
                                      <button type="button" className="calendar-grid-action" onClick={() => onSposta(mm)}>Sposta</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
```

- [ ] **Step 4: Aggiorna `CalendarScreen`**

In `src/screens/CalendarScreen.tsx`:
- aggiungi gli import: `import { ScoreControl } from '../components/ScoreControl'`, `import { salvaEProppaga } from '../services/saveResult'`, e nel type import aggiungi `SetScore` (`import type { Match, Team, SetScore } from '../engine/types'`).
- aggiungi lo stato accanto agli altri `useState` (prima del `return null`): `const [matchInPunteggio, setMatchInPunteggio] = useState<Match | null>(null)`.
- aggiungi l'handler (accanto a `handleSalvaSposta`):

```ts
  async function handleSalvaPunteggio(set: SetScore[]) {
    if (!matchInPunteggio || !torneo) return
    await salvaEProppaga(torneo.id, matchInPunteggio.id, set, torneo.regolePunteggio)
    toast('Punteggio salvato')
    setMatchInPunteggio(null)
  }
```

- cambia la chiamata a `<CalendarGrid ... onSeleziona={apriSposta} />` in:
```tsx
        <CalendarGrid matches={matches} teamNames={teamNames} onPunteggio={(m) => setMatchInPunteggio(m)} onSposta={apriSposta} />
```

- aggiungi la modale punteggio (dopo la modale `inSpostamento`, prima della chiusura `</section>`):
```tsx
      {matchInPunteggio && (
        <Modal
          open
          titolo={`${nomeSquadra(matchInPunteggio.teamAId, teamNames)} vs ${nomeSquadra(matchInPunteggio.teamBId, teamNames)}`}
          onClose={() => setMatchInPunteggio(null)}
        >
          <ScoreControl regole={torneo.regolePunteggio} setIniziali={matchInPunteggio.set} onSalva={handleSalvaPunteggio} />
        </Modal>
      )}
```

- [ ] **Step 5: Stili griglia**

In `src/styles/tokens.css`, sostituisci/estendi le regole `.calendar-grid-match` esistenti con:

```css
.calendar-grid-match { display: flex; flex-direction: column; gap: 2px; }
.calendar-grid-match-teams { font-size: 0.9rem; }
.calendar-grid-match-score { font-size: 0.85rem; color: var(--muted); }
.calendar-grid-match-actions { display: flex; gap: var(--space); margin-top: 2px; }
.calendar-grid-action { font-size: 0.75rem; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); cursor: pointer; }
```

Se esisteva già una regola `.calendar-grid-match` (era su un button/span), adattala per non entrare in conflitto (ora è un contenitore flex).

- [ ] **Step 6: Test CalendarScreen (apertura modale punteggio)**

In `src/screens/CalendarScreen.test.tsx` (leggi il file per riusare il setup con torneo+partite programmate): se un test esistente apriva lo spostamento cliccando la partita, ora deve cliccare il pulsante «Sposta» (la partita non è più un unico bottone) → **aggiornalo**. Poi aggiungi un test che: renderizza lo screen con almeno una partita programmata con entrambe le squadre, clicca il pulsante «Punteggio», e verifica che compaia il campo del punteggio (`screen.getByLabelText('Punteggio squadra A, set 1')`). Usa lo stesso pattern di seed/render degli altri test del file.

- [ ] **Step 7: Verifica**

Run: `npx vitest run src/components/CalendarGrid.test.tsx src/screens/CalendarScreen.test.tsx src/components/PublicCalendar.test.tsx`
Expected: PASS (la vista pubblica resta verde: nessuna callback → nessun pulsante). Poi `npx tsc -b` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarGrid.tsx src/screens/CalendarScreen.tsx src/styles/tokens.css src/components/CalendarGrid.test.tsx src/screens/CalendarScreen.test.tsx
git commit -m "feat: risultato in griglia + punteggio dal calendario (pulsanti Punteggio/Sposta)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hook `usePointerDrag` + helper `nuovaCollocazione`

**Files:**
- Create: `src/services/usePointerDrag.ts`
- Modify: `src/engine/calendarGrid.ts` (aggiunge `nuovaCollocazione`)
- Test: `src/services/usePointerDrag.test.tsx`, `src/engine/calendarGrid.test.ts`

**Interfaces:**
- Produces:
  - `usePointerDrag(opz?): { trascinando: boolean; handlers: { onPointerDown: (e: React.PointerEvent) => void } }` con `opz = { soglia?: number; onInizio?: () => void; onMuovi?: (x: number, y: number) => void; onRilascia?: (x: number, y: number) => void }`.
  - `nuovaCollocazione(data: string, orario: string, campo: string): { orario: string; campo: string }`.

- [ ] **Step 1: Scrivi i test (falliscono)**

Create `src/services/usePointerDrag.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { usePointerDrag } from './usePointerDrag'

function Prova({ onRilascia, onInizio }: { onRilascia: (x: number, y: number) => void; onInizio: () => void }) {
  const { trascinando, handlers } = usePointerDrag({ soglia: 6, onInizio, onRilascia })
  return <div data-testid="drag" data-trascinando={trascinando} {...handlers}>drag</div>
}

describe('usePointerDrag', () => {
  it('non inizia il drag sotto la soglia', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 3, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 3, clientY: 0 })
    expect(onInizio).not.toHaveBeenCalled()
    expect(onRilascia).not.toHaveBeenCalled()
  })

  it('inizia il drag oltre la soglia e rilascia con le coordinate', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 5 })
    expect(onInizio).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('drag').getAttribute('data-trascinando')).toBe('true')
    fireEvent.pointerUp(window, { clientX: 30, clientY: 40 })
    expect(onRilascia).toHaveBeenCalledWith(30, 40)
  })
})
```

Nota: se in questo ambiente jsdom `fireEvent.pointer*` non propaga `clientX/Y` o non esiste `PointerEvent`, aggiungi un piccolo shim in `src/db/test-setup.ts` (es. `if (!window.PointerEvent) window.PointerEvent = MouseEvent as unknown as typeof PointerEvent`) e usa `fireEvent.pointerDown/Move/Up`. Documenta nel report cosa hai fatto.

In `src/engine/calendarGrid.test.ts` aggiungi:

```ts
import { nuovaCollocazione, CAMPO_VUOTO } from './calendarGrid'

describe('nuovaCollocazione', () => {
  it('compone orario giorno+ora e tiene il campo', () => {
    expect(nuovaCollocazione('2026-07-20', '19:00', '2')).toEqual({ orario: '2026-07-20T19:00', campo: '2' })
  })
  it('mappa la colonna "Da definire" a campo vuoto', () => {
    expect(nuovaCollocazione('2026-07-20', '19:00', CAMPO_VUOTO)).toEqual({ orario: '2026-07-20T19:00', campo: '' })
  })
})
```

- [ ] **Step 2: Verifica RED**

Run: `npx vitest run src/services/usePointerDrag.test.tsx src/engine/calendarGrid.test.ts`
Expected: FAIL (moduli/funzioni mancanti).

- [ ] **Step 3: Implementa l'hook**

Create `src/services/usePointerDrag.ts`:

```ts
import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface Opzioni {
  soglia?: number
  onInizio?: () => void
  onMuovi?: (x: number, y: number) => void
  onRilascia?: (x: number, y: number) => void
}

export function usePointerDrag(opz: Opzioni = {}): {
  trascinando: boolean
  handlers: { onPointerDown: (e: ReactPointerEvent) => void }
} {
  const { soglia = 6 } = opz
  const [trascinando, setTrascinando] = useState(false)
  const stato = useRef<{ x0: number; y0: number; attivo: boolean } | null>(null)
  const opzRef = useRef(opz)
  opzRef.current = opz

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      stato.current = { x0: e.clientX, y0: e.clientY, attivo: false }

      const muovi = (ev: PointerEvent) => {
        const s = stato.current
        if (!s) return
        if (!s.attivo) {
          if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < soglia) return
          s.attivo = true
          setTrascinando(true)
          opzRef.current.onInizio?.()
        }
        opzRef.current.onMuovi?.(ev.clientX, ev.clientY)
      }
      const rilascia = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', muovi)
        window.removeEventListener('pointerup', rilascia)
        const s = stato.current
        stato.current = null
        if (s?.attivo) {
          setTrascinando(false)
          opzRef.current.onRilascia?.(ev.clientX, ev.clientY)
        }
      }
      window.addEventListener('pointermove', muovi)
      window.addEventListener('pointerup', rilascia)
    },
    [soglia],
  )

  return { trascinando, handlers: { onPointerDown } }
}
```

In `src/engine/calendarGrid.ts`, aggiungi in fondo:

```ts
export function nuovaCollocazione(data: string, orario: string, campo: string): { orario: string; campo: string } {
  return { orario: `${data}T${orario}`, campo: campo === CAMPO_VUOTO ? '' : campo }
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run src/services/usePointerDrag.test.tsx src/engine/calendarGrid.test.ts`
Expected: PASS. Poi `npx tsc -b` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/usePointerDrag.ts src/services/usePointerDrag.test.tsx src/engine/calendarGrid.ts src/engine/calendarGrid.test.ts
git commit -m "feat: hook usePointerDrag + helper nuovaCollocazione (base drag-and-drop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cablaggio drag-and-drop nel calendario

**Files:**
- Modify: `src/components/CalendarGrid.tsx` (celle come drop target + partita trascinabile)
- Modify: `src/screens/CalendarScreen.tsx` (`onSpostaSuCella`)
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: `usePointerDrag`, `nuovaCollocazione`, `CAMPO_VUOTO`.
- Produces: `CalendarGrid` prop aggiuntiva `onSpostaSuCella?: (m: Match, cella: { data: string; orario: string; campo: string }) => void`.

- [ ] **Step 1: Rendi le celle drop target e la partita trascinabile**

In `src/components/CalendarGrid.tsx`:

1. Aggiungi la prop `onSpostaSuCella?: (m: Match, cella: { data: string; orario: string; campo: string }) => void` all'interfaccia e alla firma.
2. Aggiungi uno stato di evidenziazione nel componente: `const [evidenza, setEvidenza] = useState<string | null>(null)` (import `useState`).
3. Definisci una chiave cella e un risolutore (in cima al file, fuori dal componente):

```ts
const chiaveCella = (data: string, orario: string, campo: string): string => `${data}|${orario}|${campo}`

function cellaDaPunto(x: number, y: number): { data: string; orario: string; campo: string } | null {
  const el = document.elementFromPoint(x, y)
  const cella = el?.closest('[data-data]') as HTMLElement | null
  const { data, orario, campo } = cella?.dataset ?? {}
  if (!data || !orario || campo === undefined) return null
  return { data, orario, campo }
}
```

4. Su ogni `<td>` cella aggiungi gli attributi dati e la classe di evidenza:

```tsx
                    {g.campi.map((campo) => {
                      const partite = partiteDi(g.celle, orario, campo)
                      const evidenziata = evidenza === chiaveCella(g.data, orario, campo)
                      const classiCella = ['calendar-grid-cell', partite.length > 1 ? 'calendar-grid-cell-collisione' : '', partite.length === 0 ? 'calendar-grid-cell-empty' : '', evidenziata ? 'calendar-grid-cell-evidenza' : ''].filter(Boolean).join(' ')
                      return (
                        <td key={campo} className={classiCella} data-data={g.data} data-orario={orario} data-campo={campo}>
                          {partite.length === 0 ? '—' : (
                            <>
                              {partite.length > 1 && (<span className="calendar-grid-avviso" title="Più partite sullo stesso campo e orario">⚠</span>)}
                              {partite.map((mm) => (
                                <MatchCardCalendario
                                  key={mm.id}
                                  match={mm}
                                  teamNames={teamNames}
                                  onPunteggio={onPunteggio}
                                  onSposta={onSposta}
                                  onSpostaSuCella={onSpostaSuCella}
                                  onEvidenzia={setEvidenza}
                                />
                              ))}
                            </>
                          )}
                        </td>
                      )
                    })}
```

(Adatta al markup esistente: prima le celle vuote e piene erano due `return` distinti; ora unificale come sopra. Mantieni `data-*` anche sulle celle vuote — sono drop target.)

5. Estrai il rendering della partita nel componente `MatchCardCalendario` (nello stesso file), che usa il drag:

```tsx
function MatchCardCalendario({ match, teamNames, onPunteggio, onSposta, onSpostaSuCella, onEvidenzia }: {
  match: Match
  teamNames: Record<string, string>
  onPunteggio?: (m: Match) => void
  onSposta?: (m: Match) => void
  onSpostaSuCella?: (m: Match, cella: { data: string; orario: string; campo: string }) => void
  onEvidenzia: (chiave: string | null) => void
}) {
  const origine = { data: match.orario!.slice(0, 10), orario: match.orario!.slice(11, 16), campo: match.campo && match.campo.trim() !== '' ? match.campo : CAMPO_VUOTO }
  const { trascinando, handlers } = usePointerDrag({
    onMuovi: (x, y) => {
      const c = cellaDaPunto(x, y)
      onEvidenzia(c ? chiaveCella(c.data, c.orario, c.campo) : null)
    },
    onRilascia: (x, y) => {
      onEvidenzia(null)
      const c = cellaDaPunto(x, y)
      if (!c || !onSpostaSuCella) return
      if (c.data === origine.data && c.orario === origine.orario && c.campo === origine.campo) return
      onSpostaSuCella(match, c)
    },
  })
  const testo = `${nome(match.teamAId, teamNames)} — ${nome(match.teamBId, teamNames)}`
  const risultato = match.set.length > 0 ? match.set.map((s) => `${s.puntiA}–${s.puntiB}`).join(' ') : null
  const interattiva = Boolean(onPunteggio || onSposta)
  const draggabile = Boolean(onSpostaSuCella)
  return (
    <div className={`calendar-grid-match${trascinando ? ' calendar-grid-match-dragging' : ''}`}>
      <span
        className={`calendar-grid-match-teams${draggabile ? ' calendar-grid-match-drag' : ''}`}
        {...(draggabile ? handlers : {})}
      >
        {testo}
      </span>
      {risultato && <span className="calendar-grid-match-score tnum">{risultato}</span>}
      {interattiva && (
        <div className="calendar-grid-match-actions">
          {onPunteggio && match.teamAId && match.teamBId && (
            <button type="button" className="calendar-grid-action" onClick={() => onPunteggio(match)}>Punteggio</button>
          )}
          {onSposta && (
            <button type="button" className="calendar-grid-action" onClick={() => onSposta(match)}>Sposta</button>
          )}
        </div>
      )}
    </div>
  )
}
```

(Questo sostituisce il blocco inline `partite.map` del Task 2: la stessa resa ora vive in `MatchCardCalendario`. Aggiungi gli import `useState` da react e `usePointerDrag`, `CAMPO_VUOTO` è già importato.)

- [ ] **Step 2: `onSpostaSuCella` in `CalendarScreen`**

In `src/screens/CalendarScreen.tsx`:
- import: `import { nuovaCollocazione } from '../engine/calendarGrid'`.
- handler:
```ts
  async function handleSpostaSuCella(m: Match, cella: { data: string; orario: string; campo: string }) {
    const { orario, campo } = nuovaCollocazione(cella.data, cella.orario, cella.campo)
    await db.matches.update(m.id, { orario, campo })
    notificaModificaOrg(m.tournamentId)
    toast('Partita spostata')
  }
```
- passa la prop: aggiungi `onSpostaSuCella={handleSpostaSuCella}` alla `<CalendarGrid ... />`.

- [ ] **Step 3: Stili drag**

In `src/styles/tokens.css`:
```css
.calendar-grid-match-drag { cursor: grab; touch-action: none; user-select: none; }
.calendar-grid-match-dragging { opacity: 0.5; }
.calendar-grid-cell-evidenza { outline: 2px dashed var(--sea); outline-offset: -2px; }
```

- [ ] **Step 4: Verifica**

Run: `npx vitest run src/components/CalendarGrid.test.tsx src/screens/CalendarScreen.test.tsx src/components/PublicCalendar.test.tsx`
Expected: PASS (i test del Task 2 restano verdi: il markup della partita è equivalente; la vista pubblica non passa `onSpostaSuCella` → non trascinabile). Poi `npx tsc -b` → exit 0 e `npm run build` → OK.

Nota: il drag-and-drop end-to-end (con `elementFromPoint`) non è verificabile in jsdom; verifica la logica pura (Task 3) + build. Una verifica manuale/headless del trascinamento è consigliata ma non bloccante per i test.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarGrid.tsx src/screens/CalendarScreen.tsx src/styles/tokens.css
git commit -m "feat: spostamento partite con drag-and-drop nel calendario (mouse + touch)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verifica finale

- [ ] `npx tsc -b` → exit 0.
- [ ] Run mirati Vitest dei file toccati → PASS.
- [ ] `npm run build` → OK.
- [ ] (Consigliata) verifica manuale/headless: nel calendario, digitare un punteggio dal pulsante «Punteggio», e trascinare una partita su un'altra cella (mouse e, se possibile, touch emulato).
