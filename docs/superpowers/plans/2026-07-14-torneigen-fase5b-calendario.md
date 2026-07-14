# TorneiGen — Piano Fase 5B: calendario (scheduler)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calendarizzare le partite su più giornate con fasce orarie per-giornata e più campi: configurazione, motore scheduler puro, azione "Programma calendario", vista calendario e spostamento manuale.

**Architecture:** Config sul `Tournament` (`giornate[]` con fascia per giornata, `numeroCampi`, `durataPartitaMin`). Un motore puro `pianifica(partite, config)` assegna a ogni match `orario` (data-ora locale `YYYY-MM-DDTHH:mm`) e `campo`, con euristica greedy (nessun doppio uso di squadra/campo, round in ordine). Un service persiste il risultato su IndexedDB. Vista calendario per giornata/campo/orario con modifica manuale.

**Tech Stack:** TypeScript, Vitest, React (invariati).

## Global Constraints

- TypeScript strict. `src/engine/` puro. UI usa servizi. Styling solo token; nessun hex nuovo. Copy italiano.
- Orari come stringhe locali `YYYY-MM-DDTHH:mm` (niente conversioni UTC): evita spostamenti di fuso.
- Scheduler euristico greedy (non ottimale); negli eliminatori gli orari dei round successivi sono stime.
- Commit frequenti, uno per task.

## File Structure

```
src/engine/types.ts               # + giornate?/numeroCampi?/durataPartitaMin? su Tournament
src/engine/scheduler.ts            # pianifica(...)
src/engine/scheduler.test.ts
src/services/calendario.ts         # programmaCalendario (persiste orario/campo)
src/services/calendario.test.ts
src/screens/SetupScreen.tsx        # config giornate/campi/durata
src/screens/CalendarScreen.tsx      # vista calendario + modifica manuale
src/app/App.tsx, AppShell.tsx
```

---

### Task 1: Config calendario (tipi + Setup)

**Files:**
- Modify: `src/engine/types.ts`, `src/screens/SetupScreen.tsx`
- Test: `src/screens/SetupScreen.test.tsx` (adeguare se necessario)

**Interfaces:**
- Produces: su `Tournament` i campi opzionali `giornate?: { data: string; inizio: string; fine: string }[]`,
  `numeroCampi?: number`, `durataPartitaMin?: number`. Nel Setup una sezione "Calendario" per impostarli
  (aggiungi/rimuovi giornata con data+inizio+fine; numero campi; durata partita).

- [ ] **Step 1: Aggiornare i tipi**

In `src/engine/types.ts`, aggiungere a `Tournament`:
```ts
  giornate?: { data: string; inizio: string; fine: string }[]
  numeroCampi?: number
  durataPartitaMin?: number
```

- [ ] **Step 2: Estendere il Setup**

In `SetupScreen.tsx` aggiungere una sezione **"Calendario"** (fieldset): lista giornate editabili (ogni
riga: data, ora inizio, ora fine; pulsanti aggiungi/rimuovi giornata), campo numerico **Numero campi**,
campo numerico **Durata partita (min)**. Salvare questi valori nel `Tournament` alla submit. Default
sensati: 1 giornata (la `data` del torneo, 19:00–23:00), `numeroCampi: 1`, `durataPartitaMin: 30`.
Riuso `Field`/`Button`, token.

- [ ] **Step 3: Verificare**

Run: `npm test -- SetupScreen` → PASS (test esistenti verdi; aggiungere un caso se utile che i valori
calendario si salvino). `npx tsc --noEmit -p tsconfig.app.json` pulito; `npm run build` ok.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/screens/SetupScreen.tsx src/screens/SetupScreen.test.tsx
git commit -m "feat(ui): configurazione calendario nel setup (giornate/campi/durata)"
```

---

### Task 2: Motore scheduler `pianifica`

**Files:**
- Create: `src/engine/scheduler.ts`
- Test: `src/engine/scheduler.test.ts`

**Interfaces:**
- Consumes: `Match` da `./types`.
- Produces:
  - `interface CalendarioConfig { giornate: { data: string; inizio: string; fine: string }[]; numeroCampi: number; durataMin: number }`
  - `pianifica(partite: Match[], config: CalendarioConfig): Match[]` — ritorna i match con `orario`
    (`YYYY-MM-DDTHH:mm` locale) e `campo` assegnati; euristica greedy con vincoli squadra/campo e ordine
    per round. Le partite che non entrano restano senza orario.

- [ ] **Step 1: Scrivere i test**

Create `src/engine/scheduler.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pianifica, type CalendarioConfig } from './scheduler'
import type { Match } from './types'

function m(id: string, a: string | null, b: string | null, round = 1): Match {
  return { id, tournamentId: 't1', fase: 'girone', round, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}
const cfg = (over: Partial<CalendarioConfig> = {}): CalendarioConfig => ({
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataMin: 30, ...over,
})

describe('pianifica', () => {
  it('assegna orario e campo alle partite', () => {
    const out = pianifica([m('1', 'A', 'B'), m('2', 'C', 'D')], cfg())
    expect(out.every((x) => x.orario && x.campo)).toBe(true)
  })

  it('non mette la stessa squadra in due partite allo stesso orario', () => {
    // A gioca in 2 partite: devono avere orari diversi
    const out = pianifica([m('1', 'A', 'B'), m('2', 'A', 'C')], cfg({ numeroCampi: 2 }))
    const p1 = out.find((x) => x.id === '1')!, p2 = out.find((x) => x.id === '2')!
    expect(p1.orario).not.toBe(p2.orario)
  })

  it('non mette due partite sullo stesso campo allo stesso orario', () => {
    const out = pianifica([m('1', 'A', 'B'), m('2', 'C', 'D')], cfg({ numeroCampi: 1 }))
    const p1 = out.find((x) => x.id === '1')!, p2 = out.find((x) => x.id === '2')!
    // stesso campo (1) → orari diversi
    expect(`${p1.orario}#${p1.campo}`).not.toBe(`${p2.orario}#${p2.campo}`)
  })

  it('riempie la prima giornata e passa alla seconda', () => {
    // 3 partite, 1 campo, fascia 19:00–20:00 (2 slot da 30) → la 3ª va al giorno dopo
    const out = pianifica(
      [m('1', 'A', 'B'), m('2', 'C', 'D'), m('3', 'E', 'F')],
      cfg({ giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '20:00' }, { data: '2026-09-05', inizio: '19:00', fine: '20:00' }], numeroCampi: 1 }),
    )
    const g = out.map((x) => x.orario!.slice(0, 10))
    expect(g).toContain('2026-09-05')
  })

  it('rispetta l\'ordine dei round (round 1 prima del round 2)', () => {
    const out = pianifica([m('2', 'W1', 'W2', 2), m('1', 'A', 'B', 1)], cfg({ numeroCampi: 1 }))
    const r1 = out.find((x) => x.id === '1')!, r2 = out.find((x) => x.id === '2')!
    expect(r1.orario! <= r2.orario!).toBe(true)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- scheduler`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `src/engine/scheduler.ts`:
```ts
import type { Match } from './types'

export interface CalendarioConfig {
  giornate: { data: string; inizio: string; fine: string }[]
  numeroCampi: number
  durataMin: number
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const fromMin = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function pianifica(partite: Match[], config: CalendarioConfig): Match[] {
  // slot disponibili: per giornata, per orario, per campo — ordinati per tempo poi campo
  const slots: { orario: string; campo: number }[] = []
  for (const g of config.giornate) {
    const inizio = toMin(g.inizio)
    const fine = toMin(g.fine)
    for (let t = inizio; t + config.durataMin <= fine; t += config.durataMin) {
      for (let c = 1; c <= config.numeroCampi; c++) {
        slots.push({ orario: `${g.data}T${fromMin(t)}`, campo: c })
      }
    }
  }

  const peso = (mm: Match): number => {
    const tipo = mm.tabelloneTipo === 'perdenti' ? 1 : mm.tabelloneTipo === 'finale' ? 2 : 0
    return tipo * 100000 + (mm.round ?? 0) * 1000 + (mm.posizioneTabellone ?? 0)
  }
  const ordinate = [...partite].sort((a, b) => peso(a) - peso(b))

  const usati = new Set<number>()
  const orariSquadra = new Map<string, Set<string>>()
  const occupato = (team: string | null, orario: string): boolean =>
    !!team && (orariSquadra.get(team)?.has(orario) ?? false)
  const segna = (team: string | null, orario: string): void => {
    if (!team) return
    if (!orariSquadra.has(team)) orariSquadra.set(team, new Set())
    orariSquadra.get(team)!.add(orario)
  }

  const result = new Map(partite.map((mm) => [mm.id, { ...mm }]))
  for (const mm of ordinate) {
    for (let i = 0; i < slots.length; i++) {
      if (usati.has(i)) continue
      const s = slots[i]
      if (occupato(mm.teamAId, s.orario) || occupato(mm.teamBId, s.orario)) continue
      usati.add(i)
      const upd = result.get(mm.id)!
      upd.orario = s.orario
      upd.campo = s.campo
      segna(mm.teamAId, s.orario)
      segna(mm.teamBId, s.orario)
      break
    }
  }
  return partite.map((mm) => result.get(mm.id)!)
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- scheduler`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scheduler.ts src/engine/scheduler.test.ts
git commit -m "feat(engine): scheduler calendario (pianifica greedy con vincoli)"
```

---

### Task 3: Service "Programma calendario" (persistenza)

**Files:**
- Create: `src/services/calendario.ts`
- Test: `src/services/calendario.test.ts`

**Interfaces:**
- Consumes: `pianifica` (Task 2), `matchesOf`, `getTournament`, `db.matches`.
- Produces: `programmaCalendario(tournamentId: string): Promise<number>` — legge il torneo (per la config
  giornate/campi/durata) e i suoi match, esegue `pianifica`, persiste `orario`/`campo` sui match
  (`bulkPut`), ritorna il numero di partite pianificate. Lancia un errore chiaro se manca la config
  (nessuna giornata).

- [ ] **Step 1: Scrivere il test**

Create `src/services/calendario.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { programmaCalendario } from './calendario'
import type { Tournament, Match } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-04', stato: 'in_corso',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataPartitaMin: 30,
}
const m = (id: string): Match => ({ id, tournamentId: 't1', fase: 'girone', round: 1, teamAId: 'A'+id, teamBId: 'B'+id, set: [], stato: 'programmata' })

describe('programmaCalendario', () => {
  beforeEach(async () => { await Promise.all([db.tournaments.clear(), db.matches.clear()]); await saveTournament(t); await db.matches.bulkPut([m('1'), m('2')]) })

  it('assegna orario e campo alle partite e li persiste', async () => {
    const n = await programmaCalendario('t1')
    expect(n).toBe(2)
    const partite = await db.matches.where('tournamentId').equals('t1').toArray()
    expect(partite.every((p) => p.orario && p.campo)).toBe(true)
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- services/calendario`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/services/calendario.ts`:
```ts
import { db } from '../db/database'
import { getTournament, matchesOf } from '../db/repositories'
import { pianifica } from '../engine/scheduler'

export async function programmaCalendario(tournamentId: string): Promise<number> {
  const torneo = await getTournament(tournamentId)
  if (!torneo) throw new Error('Torneo non trovato')
  if (!torneo.giornate || torneo.giornate.length === 0) {
    throw new Error('Configura almeno una giornata nel calendario (Impostazioni del torneo).')
  }
  const partite = await matchesOf(tournamentId)
  const pianificate = pianifica(partite, {
    giornate: torneo.giornate,
    numeroCampi: torneo.numeroCampi ?? 1,
    durataMin: torneo.durataPartitaMin ?? 30,
  })
  await db.matches.bulkPut(pianificate)
  return pianificate.filter((p) => p.orario).length
}
```

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- services/calendario`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/calendario.ts src/services/calendario.test.ts
git commit -m "feat(services): programma calendario (persiste orario/campo)"
```

---

### Task 4: Vista Calendario + spostamento manuale

**Files:**
- Create: `src/screens/CalendarScreen.tsx`
- Modify: `src/app/App.tsx` (rotta `/tornei/:id/calendario`), `src/app/AppShell.tsx` (voce nav "Calendario")
- Test: `src/screens/CalendarScreen.test.tsx`

**Interfaces:**
- Consumes: `matchesOf`, `teamsOf`, `getTournament`, `useLiveQuery`, `programmaCalendario` (Task 3), `db.matches`, `useToast`.
- Produces: vista calendario che, se i match hanno `orario`, li mostra **per giornata** poi ordinati per
  orario (con campo), risolvendo i nomi squadra. Bottone **"Programma calendario"** (chiama
  `programmaCalendario`, toast col numero) e **"Rigenera calendario"**. **Spostamento manuale**: per una
  partita, un controllo per cambiare `orario`/`campo` (dialog o campi inline) che aggiorna `db.matches`.

- [ ] **Step 1: Scrivere il test**

Create `src/screens/CalendarScreen.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { CalendarScreen } from './CalendarScreen'
import type { Tournament } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-04', stato: 'in_corso',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataPartitaMin: 30,
}

describe('CalendarScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut([
      { id: 'A1', tournamentId: 't1', nome: 'Alfa', stato: 'confermata', origine: 'manuale', players: [] },
      { id: 'B1', tournamentId: 't1', nome: 'Beta', stato: 'confermata', origine: 'manuale', players: [] },
    ])
    await db.matches.put({ id: 'm1', tournamentId: 't1', fase: 'girone', round: 1, teamAId: 'A1', teamBId: 'B1', set: [], stato: 'programmata' })
  })

  it('programma il calendario e mostra le partite per giornata', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/calendario']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/calendario" element={<CalendarScreen />} /></Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /programma calendario/i }))
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
    const m1 = await db.matches.get('m1')
    expect(m1?.orario).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verificare fallimento**

Run: `npm test -- CalendarScreen`
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `src/screens/CalendarScreen.tsx` — `useParams().id`; `useLiveQuery` per match/squadre/torneo.
Bottone "Programma calendario" → `programmaCalendario(id)` con toast (e "Rigenera" quando già pianificato).
Rendere le partite con `orario` **raggruppate per giornata** (`orario.slice(0,10)`) e ordinate per orario;
per ciascuna: orario (HH:mm da `orario.slice(11)`), campo, e i nomi squadra (risolti da mappa id→nome).
**Spostamento manuale**: per una partita, un pulsante "Sposta" che apre input per nuovo orario (`datetime-local`
o data+ora) e campo, e su conferma `db.matches.update(id, { orario, campo })` con toast. Stile token,
riuso `Button`.
Aggiungere in `App.tsx`: `<Route path="tornei/:id/calendario" element={<CalendarScreen />} />`. In `AppShell`,
voce nav "Calendario" per il torneo attivo (dopo Tabellone).

- [ ] **Step 4: Verificare passaggio**

Run: `npm test -- CalendarScreen` → PASS. Intera suite verde, tsc pulito, `npm run build` ok.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): vista calendario con programmazione e spostamento manuale"
```

---

## Self-Review (eseguita in scrittura)

- **Copertura spec (B):** config giornate/campi/durata → Task 1; motore `pianifica` (vincoli squadra/campo,
  ordine round, riempimento→giornata successiva) → Task 2; persistenza "Programma calendario" → Task 3;
  vista calendario + spostamento manuale → Task 4.
- **Placeholder:** motore + service con codice completo e test reali; task UI (Setup, Calendar) con
  contratto, comportamento e test.
- **Consistenza:** `CalendarioConfig` prodotto da `pianifica`, alimentato da `programmaCalendario` dai campi
  `giornate/numeroCampi/durataPartitaMin` del `Tournament`; orari come stringhe locali `YYYY-MM-DDTHH:mm`.

## Note per l'esecuzione

- Il calendario è un'euristica greedy: negli eliminatori gli orari dei round successivi sono stime e la
  vista consente lo spostamento manuale.
- Il "prossimo passo" (Piano A) può puntare a "Programma il calendario" dopo la generazione (miglioria
  opzionale, non richiesta da questo piano).
