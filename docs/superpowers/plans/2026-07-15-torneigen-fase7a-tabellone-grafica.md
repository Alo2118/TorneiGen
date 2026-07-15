# TorneiGen Fase 7a — Grafica gironi e tabellone (albero SVG) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire le liste impilate di gironi e tabellone con una resa grafica in stile "foglio da torneo": un albero del tabellone (linee SVG + box HTML) e classifiche gironi con zona qualificazione, il tutto in un componente riutilizzabile.

**Architecture:** Una funzione **pura** `layoutBracket` calcola posizioni e segmenti (nessun DOM, testabile a fondo). Un componente `<BracketTree>` disegna le **linee in SVG** e i **box-partita in HTML** dentro `<foreignObject>` (interazione + accessibilità intatte), con zoom/pan. `<GironeStandings>` rende la classifica con zona qualificazione. BracketScreen usa la variante interattiva, StandingsScreen quella statica.

**Tech Stack:** Vite + React 18/19 + TypeScript strict, Vitest + @testing-library/react, Dexie (già presente). Nessuna nuova dipendenza.

## Global Constraints

- TypeScript **strict**: nessun `any`, nessun errore `tsc --noEmit`.
- **Motore e servizi non cambiano comportamento**: le uniche aggiunte al motore sono funzioni **pure di presentazione** (`layoutBracket`, `campioneTorneo`). Niente modifiche a generazione, propagazione, persistenza.
- **Solo design token** in `src/styles/tokens.css` (variabili: `--paper --surface --ink --muted --line --sea --sand --win --danger --radius --space --font-body --font-display`). Nessun colore hardcoded nuovo.
- Copy in **italiano**.
- **Verifica su WSL:** la suite vitest completa è inaffidabile (timeout dei worker fanno cadere file in silenzio). Verificare SEMPRE con run mirati (`npm test -- <file>`), `npx tsc --noEmit`, `npx vite build`. Mai fidarsi del conteggio della suite completa.
- Modello dati (già sufficiente, non modificare): `Match` ha `fase`, `round`, `posizioneTabellone?`, `tabelloneTipo?` (`'vincenti'|'perdenti'|'finale'|'golden'`), `vincitoreVerso?/perdenteVerso?` (`{matchId, slot}`), `vincitoreId?`, `set: {puntiA,puntiB}[]`, `stato`. In **eliminazione diretta** i match NON hanno `tabelloneTipo` né feed (si propagano per `round`/`posizioneTabellone`); in **doppia** hanno `tabelloneTipo` e feed prefissati con l'id torneo.

---

## File Structure

- **Create** `src/engine/bracketLayout.ts` — funzioni pure `layoutBracket`, `campioneTorneo`, tipi e costanti geometriche.
- **Create** `src/engine/bracketLayout.test.ts` — test delle funzioni pure.
- **Create** `src/components/MatchBox.tsx` — box-partita HTML (2 righe squadra, punteggi, vincitore, 🏆).
- **Create** `src/components/MatchBox.test.tsx` — test render/click/vincitore.
- **Create** `src/components/BracketTree.tsx` — SVG (linee + zoom/pan) con box in `<foreignObject>`.
- **Create** `src/components/BracketTree.test.tsx` — test render nodi/segmenti/click.
- **Create** `src/components/GironeStandings.tsx` — tabella classifica con zona qualificazione.
- **Create** `src/components/GironeStandings.test.tsx` — test righe/zona qualificazione.
- **Modify** `src/screens/BracketScreen.tsx` — usa `<BracketTree variant="interattivo">`.
- **Modify** `src/screens/StandingsScreen.tsx` — usa `<GironeStandings>` + `<BracketTree variant="statico">`; rimuove la lista "Avanzamento tabellone".
- **Modify** `src/styles/tokens.css` — CSS dei nuovi componenti (in coda al file, solo token).

---

## Task 1: Layout puro (`layoutBracket` + `campioneTorneo`)

**Files:**
- Create: `src/engine/bracketLayout.ts`
- Test: `src/engine/bracketLayout.test.ts`

**Interfaces:**
- Consumes: `Match` da `src/engine/types`.
- Produces:
  - `export const BOX_W = 180; BOX_H = 56; COL_GAP = 48; ROW_GAP = 16; BAND_GAP = 48`
  - `export interface BracketNode { matchId: string; round: number; tabelloneTipo?: TabelloneTipo; x: number; y: number; w: number; h: number }`
  - `export interface BracketSegment { from: string; to: string; tipo: 'avanza' | 'discesa' }`
  - `export interface BracketLayout { nodi: BracketNode[]; segmenti: BracketSegment[]; campione: string | null; campioneMatchId: string | null; larghezza: number; altezza: number }`
  - `export function layoutBracket(matches: Match[]): BracketLayout`
  - `export function campioneTorneo(matches: Match[]): string | null`
  - Nota: `campione` è il **teamId** del campione; `campioneMatchId` è l'id del **match che decide** il titolo (golden se giocato, altrimenti finale/ultimo turno) — serve a disegnare una sola 🏆.

- [ ] **Step 1: Scrivi i test (falliscono)**

```ts
// src/engine/bracketLayout.test.ts
import { describe, it, expect } from 'vitest'
import { layoutBracket, campioneTorneo, BOX_W, BOX_H } from './bracketLayout'
import type { Match } from './types'

function md(p: Partial<Match> & { id: string }): Match {
  return {
    tournamentId: 't', fase: 'tabellone', round: 1, teamAId: null, teamBId: null,
    set: [], stato: 'programmata', ...p,
  }
}

describe('campioneTorneo', () => {
  it('diretta: vincitore dell’ultimo round', () => {
    const m = [
      md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreId: 'A', stato: 'conclusa' }),
      md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreId: 'C', stato: 'conclusa' }),
      md({ id: 'f', round: 2, posizioneTabellone: 0, teamAId: 'A', teamBId: 'C', vincitoreId: 'A', stato: 'conclusa' }),
    ]
    expect(campioneTorneo(m)).toBe('A')
  })
  it('doppia: se vince lo slot A della finale è campione', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'W', stato: 'conclusa' })]
    expect(campioneTorneo(m)).toBe('W')
  })
  it('doppia: se vince lo slot B (perdenti) e il golden non è giocato, nessun campione', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' })]
    expect(campioneTorneo(m)).toBeNull()
  })
  it('doppia: vincitore del golden è campione', () => {
    const m = [
      md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
      md({ id: 't:golden', tabelloneTipo: 'golden', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
    ]
    expect(campioneTorneo(m)).toBe('L')
  })
})

describe('layoutBracket.campioneMatchId', () => {
  it('quando il golden decide, il match campione è il golden (non la finale)', () => {
    const m = [
      md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
      md({ id: 't:golden', tabelloneTipo: 'golden', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
    ]
    expect(layoutBracket(m).campioneMatchId).toBe('t:golden')
  })
  it('senza golden, se vince lo slot A il match campione è la finale', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'W', stato: 'conclusa' })]
    expect(layoutBracket(m).campioneMatchId).toBe('t:gf')
  })
})

describe('layoutBracket — eliminazione diretta', () => {
  const m = [
    md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B' }),
    md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D' }),
    md({ id: 'f', round: 2, posizioneTabellone: 0 }),
  ]
  it('crea un nodo per partita con dimensioni fisse', () => {
    const l = layoutBracket(m)
    expect(l.nodi).toHaveLength(3)
    expect(l.nodi.every((n) => n.w === BOX_W && n.h === BOX_H)).toBe(true)
  })
  it('colonne per round: round 1 a x=0, round 2 più a destra', () => {
    const l = layoutBracket(m)
    expect(l.nodi.find((n) => n.matchId === 'a')!.x).toBe(0)
    expect(l.nodi.find((n) => n.matchId === 'f')!.x).toBeGreaterThan(0)
  })
  it('la finale è centrata verticalmente tra i due match che la alimentano', () => {
    const l = layoutBracket(m)
    const ya = l.nodi.find((n) => n.matchId === 'a')!.y
    const yb = l.nodi.find((n) => n.matchId === 'b')!.y
    const yf = l.nodi.find((n) => n.matchId === 'f')!.y
    expect(yf).toBeCloseTo((ya + yb) / 2)
  })
  it('un segmento di avanzamento da ogni match del round 1 alla finale', () => {
    const l = layoutBracket(m)
    const avanza = l.segmenti.filter((s) => s.tipo === 'avanza')
    expect(avanza).toEqual(
      expect.arrayContaining([
        { from: 'a', to: 'f', tipo: 'avanza' },
        { from: 'b', to: 'f', tipo: 'avanza' },
      ]),
    )
  })
})

describe('layoutBracket — doppia eliminazione', () => {
  // 4 squadre: WB(a,b -> wbf), LB(lb1 -> lb2), finale gf, golden
  const m = [
    md({ id: 't:wb-r1-i0', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreVerso: { matchId: 't:wb-r2-i0', slot: 'A' }, perdenteVerso: { matchId: 't:lb-r1-i0', slot: 'A' } }),
    md({ id: 't:wb-r1-i1', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreVerso: { matchId: 't:wb-r2-i0', slot: 'B' }, perdenteVerso: { matchId: 't:lb-r1-i0', slot: 'B' } }),
    md({ id: 't:wb-r2-i0', tabelloneTipo: 'vincenti', round: 2, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:gf', slot: 'A' }, perdenteVerso: { matchId: 't:lb-r2-i0', slot: 'B' } }),
    md({ id: 't:lb-r1-i0', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:lb-r2-i0', slot: 'A' } }),
    md({ id: 't:lb-r2-i0', tabelloneTipo: 'perdenti', round: 2, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:gf', slot: 'B' } }),
    md({ id: 't:gf', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0 }),
    md({ id: 't:golden', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0 }),
  ]
  it('un nodo per partita (7)', () => {
    expect(layoutBracket(m).nodi).toHaveLength(7)
  })
  it('la banda perdenti sta sotto la banda vincenti', () => {
    const l = layoutBracket(m)
    const maxWb = Math.max(...l.nodi.filter((n) => n.tabelloneTipo === 'vincenti').map((n) => n.y))
    const minLb = Math.min(...l.nodi.filter((n) => n.tabelloneTipo === 'perdenti').map((n) => n.y))
    expect(minLb).toBeGreaterThan(maxWb)
  })
  it('segmenti: avanzamento per i vincitoreVerso e discesa per i perdenteVerso', () => {
    const l = layoutBracket(m)
    expect(l.segmenti).toEqual(
      expect.arrayContaining([
        { from: 't:wb-r1-i0', to: 't:wb-r2-i0', tipo: 'avanza' },
        { from: 't:wb-r1-i0', to: 't:lb-r1-i0', tipo: 'discesa' },
        { from: 't:gf', to: 't:golden', tipo: 'avanza' },
      ]),
    )
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/engine/bracketLayout.test.ts`
Expected: FAIL — "Failed to resolve import './bracketLayout'".

- [ ] **Step 3: Implementa `bracketLayout.ts`**

```ts
// src/engine/bracketLayout.ts
import type { Match } from './types'

export type TabelloneTipo = NonNullable<Match['tabelloneTipo']>

export const BOX_W = 180
export const BOX_H = 56
export const COL_GAP = 48
export const ROW_GAP = 16
export const BAND_GAP = 48
const COL_W = BOX_W + COL_GAP
const SLOT_H = BOX_H + ROW_GAP

export interface BracketNode {
  matchId: string
  round: number
  tabelloneTipo?: TabelloneTipo
  x: number
  y: number
  w: number
  h: number
}
export interface BracketSegment {
  from: string
  to: string
  tipo: 'avanza' | 'discesa'
}
export interface BracketLayout {
  nodi: BracketNode[]
  segmenti: BracketSegment[]
  campione: string | null
  campioneMatchId: string | null
  larghezza: number
  altezza: number
}

// il match che DECIDE il titolo (golden se giocato, altrimenti finale slot A / ultimo turno)
function matchCampione(tab: Match[]): string | null {
  if (tab.length === 0) return null
  const golden = tab.find((m) => m.tabelloneTipo === 'golden')
  if (golden?.vincitoreId) return golden.id
  const finale = tab.find((m) => m.tabelloneTipo === 'finale')
  if (finale) {
    return finale.stato === 'conclusa' && finale.vincitoreId && finale.vincitoreId === finale.teamAId
      ? finale.id
      : null
  }
  const maxRound = Math.max(...tab.map((m) => m.round))
  const ultima = tab.find((m) => m.round === maxRound)
  return ultima?.stato === 'conclusa' && ultima.vincitoreId ? ultima.id : null
}

export function campioneTorneo(matches: Match[]): string | null {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  const id = matchCampione(tab)
  if (!id) return null
  return tab.find((m) => m.id === id)?.vincitoreId ?? null
}

export function layoutBracket(matches: Match[]): BracketLayout {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  const campione = campioneTorneo(matches)
  const campioneMatchId = matchCampione(tab)
  if (tab.length === 0) return { nodi: [], segmenti: [], campione, campioneMatchId, larghezza: 0, altezza: 0 }
  const doppia = tab.some((m) => m.tabelloneTipo !== undefined)
  return doppia ? layoutDoppia(tab, campione, campioneMatchId) : layoutSingola(tab, campione, campioneMatchId)
}

function finalize(nodi: BracketNode[], segmenti: BracketSegment[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const larghezza = nodi.length ? Math.max(...nodi.map((n) => n.x)) + BOX_W : 0
  const altezza = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : 0
  return { nodi, segmenti, campione, campioneMatchId, larghezza, altezza }
}

function layoutSingola(tab: Match[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const rounds = [...new Set(tab.map((m) => m.round))].sort((a, b) => a - b)
  const byRoundIndex = new Map<string, Match>()
  for (const m of tab) byRoundIndex.set(`${m.round}:${m.posizioneTabellone ?? 0}`, m)

  const nodi: BracketNode[] = []
  const yById = new Map<string, number>()
  for (const round of rounds) {
    const correnti = tab
      .filter((m) => m.round === round)
      .sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
    correnti.forEach((m) => {
      const idx = m.posizioneTabellone ?? 0
      let y: number
      if (round === rounds[0]) {
        y = idx * SLOT_H
      } else {
        const figli = [
          byRoundIndex.get(`${round - 1}:${idx * 2}`),
          byRoundIndex.get(`${round - 1}:${idx * 2 + 1}`),
        ]
          .map((c) => (c ? yById.get(c.id) : undefined))
          .filter((v): v is number => v !== undefined)
        y = figli.length ? figli.reduce((s, v) => s + v, 0) / figli.length : idx * SLOT_H
      }
      yById.set(m.id, y)
      nodi.push({ matchId: m.id, round, x: (round - rounds[0]) * COL_W, y, w: BOX_W, h: BOX_H })
    })
  }

  const segmenti: BracketSegment[] = []
  for (const m of tab) {
    const parent = byRoundIndex.get(`${m.round + 1}:${Math.floor((m.posizioneTabellone ?? 0) / 2)}`)
    if (parent) segmenti.push({ from: m.id, to: parent.id, tipo: 'avanza' })
  }
  return finalize(nodi, segmenti, campione, campioneMatchId)
}

function layoutDoppia(tab: Match[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const finale = tab.find((m) => m.tabelloneTipo === 'finale')
  const golden = tab.find((m) => m.tabelloneTipo === 'golden')

  const nodi: BracketNode[] = []
  const yById = new Map<string, number>()

  const disponiBanda = (band: Match[], baseY: number) => {
    const rounds = [...new Set(band.map((m) => m.round))].sort((a, b) => a - b)
    for (const round of rounds) {
      const correnti = band
        .filter((m) => m.round === round)
        .sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
      correnti.forEach((m, i) => {
        const feeders = band.filter((f) => f.vincitoreVerso?.matchId === m.id)
        const ys = feeders.map((f) => yById.get(f.id)).filter((v): v is number => v !== undefined)
        const y = round === rounds[0] || ys.length === 0
          ? baseY + i * SLOT_H
          : ys.reduce((s, v) => s + v, 0) / ys.length
        yById.set(m.id, y)
        nodi.push({ matchId: m.id, round, tabelloneTipo: m.tabelloneTipo, x: (round - 1) * COL_W, y, w: BOX_W, h: BOX_H })
      })
    }
  }

  disponiBanda(tab.filter((m) => m.tabelloneTipo === 'vincenti'), 0)
  const wbAltezza = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : 0
  disponiBanda(tab.filter((m) => m.tabelloneTipo === 'perdenti'), wbAltezza + BAND_GAP)

  const bande = tab.filter((m) => m.tabelloneTipo === 'vincenti' || m.tabelloneTipo === 'perdenti')
  const colFinale = bande.length ? Math.max(...bande.map((m) => m.round)) : 1
  const altezzaTot = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : BOX_H
  const yFinale = (altezzaTot - BOX_H) / 2

  if (finale) {
    yById.set(finale.id, yFinale)
    nodi.push({ matchId: finale.id, round: 1, tabelloneTipo: 'finale', x: colFinale * COL_W, y: yFinale, w: BOX_W, h: BOX_H })
  }
  if (golden) {
    nodi.push({ matchId: golden.id, round: 1, tabelloneTipo: 'golden', x: colFinale * COL_W, y: yFinale + SLOT_H, w: BOX_W, h: BOX_H })
  }

  const segmenti: BracketSegment[] = []
  for (const m of tab) {
    if (m.vincitoreVerso) segmenti.push({ from: m.id, to: m.vincitoreVerso.matchId, tipo: 'avanza' })
    if (m.perdenteVerso) segmenti.push({ from: m.id, to: m.perdenteVerso.matchId, tipo: 'discesa' })
  }
  if (finale && golden) segmenti.push({ from: finale.id, to: golden.id, tipo: 'avanza' })

  return finalize(nodi, segmenti, campione, campioneMatchId)
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npm test -- src/engine/bracketLayout.test.ts`
Expected: PASS (tutti i test verdi).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/engine/bracketLayout.ts src/engine/bracketLayout.test.ts
git commit -m "feat(engine): layoutBracket + campioneTorneo (funzioni pure per l'albero)"
```

---

## Task 2: `MatchBox` (box-partita HTML)

**Files:**
- Create: `src/components/MatchBox.tsx`
- Test: `src/components/MatchBox.test.tsx`
- Modify: `src/styles/tokens.css` (aggiunta in coda)

**Interfaces:**
- Consumes: `Match` da `src/engine/types`.
- Produces: `export function MatchBox(props: { match: Match; teamNames: Record<string,string>; campione?: boolean; onClick?: (m: Match) => void }): JSX.Element`
  - Se `onClick` è passato e la partita ha entrambe le squadre → renderizza un `<button>` cliccabile; altrimenti un `<div>` non interattivo.

- [ ] **Step 1: Scrivi i test (falliscono)**

```tsx
// src/components/MatchBox.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatchBox } from './MatchBox'
import type { Match } from '../engine/types'

const base: Match = {
  id: 'm', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 0,
  teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'A',
}
const names = { A: 'Rossi', B: 'Bianchi' }

describe('MatchBox', () => {
  it('mostra i nomi delle squadre e i punteggi', () => {
    render(<MatchBox match={base} teamNames={names} />)
    expect(screen.getByText('Rossi')).toBeTruthy()
    expect(screen.getByText('Bianchi')).toBeTruthy()
    expect(screen.getByText('21')).toBeTruthy()
  })
  it('evidenzia il vincitore', () => {
    const { container } = render(<MatchBox match={base} teamNames={names} />)
    expect(container.querySelector('.match-box-row-vince')).toBeTruthy()
  })
  it('con onClick e due squadre è un bottone e chiama onClick', () => {
    const onClick = vi.fn()
    render(<MatchBox match={base} teamNames={names} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(base)
  })
  it('senza entrambe le squadre non è cliccabile', () => {
    const daDefinire: Match = { ...base, teamBId: null, set: [], vincitoreId: null, stato: 'programmata' }
    render(<MatchBox match={daDefinire} teamNames={names} onClick={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Da definire')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/components/MatchBox.test.tsx`
Expected: FAIL — "Failed to resolve import './MatchBox'".

- [ ] **Step 3: Implementa `MatchBox.tsx`**

```tsx
// src/components/MatchBox.tsx
import type { Match } from '../engine/types'

interface Props {
  match: Match
  teamNames: Record<string, string>
  campione?: boolean
  onClick?: (match: Match) => void
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}

export function MatchBox({ match, teamNames, campione, onClick }: Props) {
  const nomeA = nome(match.teamAId, teamNames)
  const nomeB = nome(match.teamBId, teamNames)
  const vinceA = !!match.vincitoreId && match.vincitoreId === match.teamAId
  const vinceB = !!match.vincitoreId && match.vincitoreId === match.teamBId
  const cliccabile = !!onClick && !!match.teamAId && !!match.teamBId
  const setsA = match.set.map((s) => s.puntiA).join(' ')
  const setsB = match.set.map((s) => s.puntiB).join(' ')
  const label =
    `${nomeA} ${setsA}, ${nomeB} ${setsB}` +
    (match.vincitoreId ? `, vince ${vinceA ? nomeA : nomeB}` : '')

  const contenuto = (
    <>
      <div className={`match-box-row${vinceA ? ' match-box-row-vince' : ''}`}>
        <span className="match-box-name">{campione && vinceA ? '🏆 ' : ''}{nomeA}</span>
        <span className="match-box-score tnum">{setsA}</span>
      </div>
      <div className={`match-box-row${vinceB ? ' match-box-row-vince' : ''}`}>
        <span className="match-box-name">{campione && vinceB ? '🏆 ' : ''}{nomeB}</span>
        <span className="match-box-score tnum">{setsB}</span>
      </div>
    </>
  )

  if (cliccabile) {
    return (
      <button type="button" className="match-box" aria-label={label} onClick={() => onClick!(match)}>
        {contenuto}
      </button>
    )
  }
  return (
    <div className={`match-box${campione ? ' match-box-campione' : ''}`} aria-label={label}>
      {contenuto}
    </div>
  )
}
```

- [ ] **Step 4: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Fase 7a: box-partita --- */
.match-box {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  font: inherit;
  text-align: left;
  padding: 0;
}
button.match-box { cursor: pointer; }
button.match-box:hover { border-color: var(--sea); }
.match-box-campione { border-color: var(--sand); }
.match-box-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space);
  padding: calc(var(--space) * 0.75) var(--space);
  color: var(--muted);
}
.match-box-row:first-child { border-bottom: 1px solid var(--line); }
.match-box-row-vince { color: var(--ink); font-weight: 600; }
.match-box-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.match-box-score { color: var(--ink); }
```

- [ ] **Step 5: Esegui i test (devono passare)**

Run: `npm test -- src/components/MatchBox.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/MatchBox.tsx src/components/MatchBox.test.tsx src/styles/tokens.css
git commit -m "feat(ui): componente MatchBox (box-partita HTML per l'albero)"
```

---

## Task 3: `BracketTree` (SVG ibrido + zoom/pan)

**Files:**
- Create: `src/components/BracketTree.tsx`
- Test: `src/components/BracketTree.test.tsx`
- Modify: `src/styles/tokens.css` (aggiunta in coda)

**Interfaces:**
- Consumes: `layoutBracket, BracketNode, BracketSegment, BOX_W, BOX_H` da `src/engine/bracketLayout`; `MatchBox`; `Match`.
- Produces: `export function BracketTree(props: { matches: Match[]; teamNames: Record<string,string>; variant: 'interattivo' | 'statico'; onMatchClick?: (m: Match) => void }): JSX.Element`

- [ ] **Step 1: Scrivi i test (falliscono)**

```tsx
// src/components/BracketTree.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BracketTree } from './BracketTree'
import type { Match } from '../engine/types'

function md(p: Partial<Match> & { id: string }): Match {
  return { tournamentId: 't', fase: 'tabellone', round: 1, teamAId: null, teamBId: null, set: [], stato: 'programmata', ...p }
}
const m: Match[] = [
  md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreId: 'A', stato: 'conclusa', set: [{ puntiA: 21, puntiB: 10 }] }),
  md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreId: 'C', stato: 'conclusa', set: [{ puntiA: 21, puntiB: 12 }] }),
  md({ id: 'f', round: 2, posizioneTabellone: 0, teamAId: 'A', teamBId: 'C' }),
]
const names = { A: 'Rossi', B: 'Bianchi', C: 'Verdi', D: 'Neri' }

describe('BracketTree', () => {
  it('disegna un box per partita e le linee di collegamento', () => {
    const { container } = render(<BracketTree matches={m} teamNames={names} variant="statico" />)
    expect(container.querySelectorAll('.match-box').length).toBe(3)
    expect(container.querySelectorAll('.bracket-segment').length).toBeGreaterThan(0)
  })
  it('nella variante interattiva il click su una partita chiama onMatchClick', () => {
    const onMatchClick = vi.fn()
    render(<BracketTree matches={m} teamNames={names} variant="interattivo" onMatchClick={onMatchClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Rossi/ }))
    expect(onMatchClick).toHaveBeenCalled()
  })
  it('mostra i controlli zoom (Adatta)', () => {
    render(<BracketTree matches={m} teamNames={names} variant="statico" />)
    expect(screen.getByRole('button', { name: /adatta/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/components/BracketTree.test.tsx`
Expected: FAIL — "Failed to resolve import './BracketTree'".

- [ ] **Step 3: Implementa `BracketTree.tsx`**

```tsx
// src/components/BracketTree.tsx
import { useMemo, useRef, useState } from 'react'
import type { Match } from '../engine/types'
import { layoutBracket, BOX_W, BOX_H } from '../engine/bracketLayout'
import type { BracketNode, BracketSegment } from '../engine/bracketLayout'
import { MatchBox } from './MatchBox'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  variant: 'interattivo' | 'statico'
  onMatchClick?: (match: Match) => void
}

// connettore ortogonale dal bordo destro di "from" al bordo sinistro di "to"
function percorso(from: BracketNode, to: BracketNode): string {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

export function BracketTree({ matches, teamNames, variant, onMatchClick }: Props) {
  const layout = useMemo(() => layoutBracket(matches), [matches])
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches])
  const nodeById = useMemo(() => new Map(layout.nodi.map((n) => [n.matchId, n])), [layout])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const PAD = 24
  const vbW = layout.larghezza + PAD * 2
  const vbH = layout.altezza + PAD * 2

  function adatta() {
    const w = wrapRef.current?.clientWidth ?? vbW
    setT({ scale: Math.min(1, w / vbW), x: 0, y: 0 })
  }
  function zoom(fattore: number) {
    setT((s) => ({ ...s, scale: Math.max(0.3, Math.min(2.5, s.scale * fattore)) }))
  }
  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX - t.x, y: e.clientY - t.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setT((s) => ({ ...s, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }))
  }
  function onPointerUp() {
    drag.current = null
  }
  function onWheel(e: React.WheelEvent) {
    zoom(e.deltaY < 0 ? 1.1 : 0.9)
  }

  if (layout.nodi.length === 0) return null

  return (
    <div className="bracket-tree">
      <div className="bracket-tree-controls">
        <button type="button" onClick={() => zoom(1.2)} aria-label="Ingrandisci">+</button>
        <button type="button" onClick={() => zoom(0.83)} aria-label="Rimpicciolisci">−</button>
        <button type="button" onClick={adatta}>Adatta</button>
      </div>
      <div
        className="bracket-tree-viewport"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <svg width={vbW} height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: '0 0' }}>
          <g transform={`translate(${PAD}, ${PAD})`}>
            {layout.segmenti.map((s: BracketSegment, i) => {
              const from = nodeById.get(s.from)
              const to = nodeById.get(s.to)
              if (!from || !to) return null
              return (
                <path
                  key={i}
                  className={`bracket-segment bracket-segment-${s.tipo}`}
                  d={percorso(from, to)}
                  fill="none"
                />
              )
            })}
            {layout.nodi.map((n) => {
              const match = byId.get(n.matchId)
              if (!match) return null
              const campione = n.matchId === layout.campioneMatchId
              return (
                <foreignObject key={n.matchId} x={n.x} y={n.y} width={BOX_W} height={BOX_H}>
                  <MatchBox
                    match={match}
                    teamNames={teamNames}
                    campione={campione}
                    onClick={variant === 'interattivo' ? onMatchClick : undefined}
                  />
                </foreignObject>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Fase 7a: albero tabellone --- */
.bracket-tree { position: relative; }
.bracket-tree-controls {
  display: flex;
  gap: var(--space);
  margin-bottom: var(--space);
}
.bracket-tree-controls button {
  min-width: 36px;
  padding: calc(var(--space) * 0.5) var(--space);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  cursor: pointer;
}
.bracket-tree-viewport {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  touch-action: none;
  cursor: grab;
}
.bracket-tree-viewport:active { cursor: grabbing; }
.bracket-segment { stroke: var(--line); stroke-width: 2; }
.bracket-segment-avanza { stroke: var(--sea); }
.bracket-segment-discesa { stroke: var(--muted); stroke-dasharray: 4 4; stroke-width: 1.5; }
```

- [ ] **Step 5: Esegui i test (devono passare)**

Run: `npm test -- src/components/BracketTree.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add src/components/BracketTree.tsx src/components/BracketTree.test.tsx src/styles/tokens.css
git commit -m "feat(ui): BracketTree (albero SVG con box HTML, zoom/pan)"
```

---

## Task 4: `GironeStandings` (classifica con zona qualificazione)

**Files:**
- Create: `src/components/GironeStandings.tsx`
- Test: `src/components/GironeStandings.test.tsx`
- Modify: `src/styles/tokens.css` (aggiunta in coda)

**Interfaces:**
- Consumes: `classificaGirone` da `src/services/standings`; `Group, Match, RegolePunteggio` da `src/engine/types`.
- Produces: `export function GironeStandings(props: { group: Group; matches: Match[]; regole: RegolePunteggio; teamNames: Record<string,string>; qualificati: number | 'tutti' }): JSX.Element`
  - Le prime `N` righe (dove `N = qualificati === 'tutti' ? righe.length : qualificati`) hanno la classe `standings-row-qualificata`.

- [ ] **Step 1: Scrivi i test (falliscono)**

```tsx
// src/components/GironeStandings.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GironeStandings } from './GironeStandings'
import type { Group, Match, RegolePunteggio } from '../engine/types'

const regole: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const group: Group = { id: 'g', tournamentId: 't', nome: 'Girone A', teamIds: ['A', 'B', 'C'] }
function gm(id: string, a: string, b: string, pa: number, pb: number): Match {
  return { id, tournamentId: 't', fase: 'girone', groupId: 'g', round: 1, teamAId: a, teamBId: b, set: [{ puntiA: pa, puntiB: pb }], stato: 'conclusa', vincitoreId: pa > pb ? a : b }
}
const matches = [gm('m1', 'A', 'B', 21, 10), gm('m2', 'A', 'C', 21, 12), gm('m3', 'B', 'C', 21, 15)]
const names = { A: 'Rossi', B: 'Bianchi', C: 'Verdi' }

describe('GironeStandings', () => {
  it('mostra il nome del girone e una riga per squadra', () => {
    const { container, getByText } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati="tutti" />)
    expect(getByText('Girone A')).toBeTruthy()
    expect(container.querySelectorAll('tbody tr').length).toBe(3)
  })
  it('con qualificati=2, evidenzia le prime due righe', () => {
    const { container } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati={2} />)
    expect(container.querySelectorAll('.standings-row-qualificata').length).toBe(2)
  })
  it('con qualificati="tutti", evidenzia tutte le righe', () => {
    const { container } = render(<GironeStandings group={group} matches={matches} regole={regole} teamNames={names} qualificati="tutti" />)
    expect(container.querySelectorAll('.standings-row-qualificata').length).toBe(3)
  })
})
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npm test -- src/components/GironeStandings.test.tsx`
Expected: FAIL — "Failed to resolve import './GironeStandings'".

- [ ] **Step 3: Implementa `GironeStandings.tsx`**

```tsx
// src/components/GironeStandings.tsx
import { classificaGirone } from '../services/standings'
import type { Group, Match, RegolePunteggio, StandingRow } from '../engine/types'

interface Props {
  group: Group
  matches: Match[]
  regole: RegolePunteggio
  teamNames: Record<string, string>
  qualificati: number | 'tutti'
}

function quoziente(fatti: number, subiti: number): string {
  if (subiti === 0) return fatti === 0 ? '—' : '∞'
  return (fatti / subiti).toFixed(2)
}

export function GironeStandings({ group, matches, regole, teamNames, qualificati }: Props) {
  const righe = classificaGirone(group, matches, regole)
  const soglia = qualificati === 'tutti' ? righe.length : qualificati

  return (
    <section className="standings-group">
      <h2>{group.nome}</h2>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="tnum">#</th>
              <th>Squadra</th>
              <th className="tnum">G</th>
              <th className="tnum">V–P</th>
              <th className="tnum">Quoz. set</th>
              <th className="tnum">Quoz. punti</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r: StandingRow, i: number) => {
              const qualificata = i < soglia
              const tagli = i === soglia - 1 && qualificati !== 'tutti' && soglia < righe.length
              return (
                <tr
                  key={r.teamId}
                  className={`${qualificata ? 'standings-row-qualificata' : ''}${tagli ? ' standings-row-taglio' : ''}`.trim() || undefined}
                >
                  <td className="tnum">{i + 1}</td>
                  <td>{teamNames[r.teamId] ?? r.teamId}</td>
                  <td className="tnum">{r.giocate}</td>
                  <td className="tnum">{r.vinte}–{r.perse}</td>
                  <td className="tnum">{quoziente(r.setVinti, r.setPersi)}</td>
                  <td className="tnum">{quoziente(r.puntiFatti, r.puntiSubiti)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Aggiungi il CSS in coda a `src/styles/tokens.css`**

```css
/* --- Fase 7a: classifica girone con zona qualificazione --- */
.standings-row-qualificata td { background: color-mix(in srgb, var(--sea) 8%, transparent); }
.standings-row-qualificata td:first-child { box-shadow: inset 3px 0 0 var(--sea); }
.standings-row-taglio td { border-bottom: 2px solid var(--sea); }
```

- [ ] **Step 5: Esegui i test (devono passare)**

Run: `npm test -- src/components/GironeStandings.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/GironeStandings.tsx src/components/GironeStandings.test.tsx src/styles/tokens.css
git commit -m "feat(ui): GironeStandings (classifica con zona qualificazione)"
```

---

## Task 5: Integrazione in BracketScreen (tabellone interattivo)

**Files:**
- Modify: `src/screens/BracketScreen.tsx`

**Interfaces:**
- Consumes: `BracketTree` (variante `interattivo`), `campioneTorneo` (già disponibile ma qui si usa `BracketTree` che lo calcola internamente).

Contesto: oggi `BracketScreen` rende gironi e tabellone come liste (`renderGruppi`, `partitePerRound`, sezioni vincenti/perdenti/finale/golden). Sostituiamo la **resa del tabellone** con `<BracketTree variant="interattivo">`, mantenendo intatti: header, azioni Genera/Rigenera/Genera fase finale, il modale `ScoreControl`, i messaggi e la resa dei **gironi** (le partite dei gironi restano come lista sotto — la classifica curata vive in StandingsScreen).

- [ ] **Step 1: Aggiorna gli import**

In cima a `src/screens/BracketScreen.tsx`, dopo gli import esistenti dei componenti, aggiungi:

```tsx
import { BracketTree } from '../components/BracketTree'
```

- [ ] **Step 2: Sostituisci il blocco di rendering del tabellone**

Individua il blocco JSX che parte da `{haTabelloneTipo ? (` e termina alla chiusura del ramo `haTabellone && (...)` (le due sezioni che rendono vincenti/perdenti/finale/golden e il tabellone semplice). Sostituisci l'intero blocco condizionale del **tabellone** (NON i gironi) con:

```tsx
          {haGironi && <div className="bracket-groups">{renderGruppi(matchPerGirone)}</div>}
          {haTabellone && (
            <section className="bracket-section">
              <h2 className="bracket-section-title">Tabellone</h2>
              <BracketTree
                matches={matchTabellone}
                teamNames={teamNames}
                variant="interattivo"
                onMatchClick={apriModifica}
              />
            </section>
          )}
```

Rimuovi ora il codice diventato morto: le funzioni/variabili non più usate (`partitePerRound` se non più referenziata, `matchVincenti`, `matchPerdenti`, `matchFinale`, `matchGolden`, `finale`, `campioneId`, e il precedente markup con `bracket-champion`/`bracket-golden`). Mantieni `renderGruppi`, `renderPartite`, `matchPerGirone` (servono per i gironi). Se `partitePerRound` non è più usata da nessuno, eliminala.

- [ ] **Step 3: Verifica typecheck (niente codice morto/errori strict)**

Run: `npx tsc --noEmit`
Expected: nessun errore (in strict, le variabili non usate non falliscono `tsc` di default, ma rimuovile per pulizia; se il progetto ha `noUnusedLocals` attivo falliranno — in tal caso vanno rimosse).

- [ ] **Step 4: Esegui i test esistenti dello screen**

Run: `npm test -- src/screens/BracketScreen.test.tsx`
Expected: PASS. Se un test cercava testo della vecchia lista tabellone (es. "Tabellone vincenti"), aggiornalo per cercare l'intestazione "Tabellone" e/o un `.match-box`. Mostra qui la modifica minima necessaria e rilancia finché è verde.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BracketScreen.tsx src/screens/BracketScreen.test.tsx
git commit -m "feat(ui): BracketScreen usa l'albero interattivo (BracketTree)"
```

---

## Task 6: Integrazione in StandingsScreen (gironi curati + albero statico)

**Files:**
- Modify: `src/screens/StandingsScreen.tsx`

**Interfaces:**
- Consumes: `GironeStandings`, `BracketTree` (variante `statico`).

Contesto: oggi `StandingsScreen` rende le tabelle gironi (inline) e la lista divergente "Avanzamento tabellone" (con calcolo campione errato). Sostituiamo: i gironi con `<GironeStandings>`, e l'avanzamento tabellone con `<BracketTree variant="statico">`.

- [ ] **Step 1: Aggiorna gli import**

Sostituisci gli import in cima a `src/screens/StandingsScreen.tsx` con:

```tsx
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'
import { GironeStandings } from '../components/GironeStandings'
import { BracketTree } from '../components/BracketTree'
```

- [ ] **Step 2: Riscrivi il corpo del componente**

Sostituisci l'intero corpo `return (...)` (e rimuovi gli helper locali `quozienteDisplay`, `nomeSquadra` e il calcolo `rounds/ultimoRound/finale/campioneId` non più usati) con:

```tsx
  if (!id || !torneo) return null

  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))
  const matchTabellone = matches.filter((m) => m.fase === 'tabellone')

  return (
    <section className="standings">
      <header className="standings-head">
        <h1>Classifiche</h1>
      </header>

      {groups.length === 0 && matchTabellone.length === 0 && (
        <p className="empty">Nessun girone o tabellone generato ancora.</p>
      )}

      {groups.length > 0 && (
        <div className="standings-groups">
          {groups.map((g) => (
            <GironeStandings
              key={g.id}
              group={g}
              matches={matches}
              regole={torneo.regolePunteggio}
              teamNames={teamNames}
              qualificati={torneo.qualificatiPerGirone ?? 'tutti'}
            />
          ))}
        </div>
      )}

      {matchTabellone.length > 0 && (
        <section className="standings-bracket">
          <h2>Tabellone</h2>
          <BracketTree matches={matchTabellone} teamNames={teamNames} variant="statico" />
        </section>
      )}
    </section>
  )
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Aggiorna/esegui i test dello screen**

Run: `npm test -- src/screens/StandingsScreen.test.tsx`
Expected: PASS. Aggiorna eventuali asserzioni che cercavano "Avanzamento tabellone" → "Tabellone", o la vecchia lista → un `.match-box`. Mostra la modifica minima e rilancia finché verde.

- [ ] **Step 5: Commit**

```bash
git add src/screens/StandingsScreen.tsx src/screens/StandingsScreen.test.tsx
git commit -m "feat(ui): StandingsScreen usa GironeStandings + albero statico"
```

---

## Task 7: Verifica finale (typecheck, build, screenshot)

**Files:** nessuna modifica di codice salvo fix emersi.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 2: Test mirati di tutti i file toccati**

Run: `npm test -- src/engine/bracketLayout.test.ts src/components/MatchBox.test.tsx src/components/BracketTree.test.tsx src/components/GironeStandings.test.tsx src/screens/BracketScreen.test.tsx src/screens/StandingsScreen.test.tsx`
Expected: tutti verdi. (NON usare la suite completa: inaffidabile su WSL.)

- [ ] **Step 3: Build di produzione**

Run: `npx vite build`
Expected: "✓ built" senza errori.

- [ ] **Step 4: Verifica visiva (screenshot headless)**

Riusa il flusso già collaudato: avvia `npx vite preview --port 4173`, avvia chromium snap headless con `--remote-debugging-port=9222`, inietta in IndexedDB `TorneiGen` un torneo demo a doppia eliminazione (lo snippet `carica-demo-torneo.js` o `screenshot-simulazione/`), poi cattura via CDP le schermate `/tornei/:id/tabellone` (albero interattivo) e `/tornei/:id/classifiche` (gironi + albero statico). Controlla a occhio: colonne per round, linee di collegamento (piene = avanzamento, tratteggiate = discese nella doppia), 🏆 sul campione, zona qualificazione evidenziata nei gironi, zoom/pan funzionanti. Salva le immagini in `screenshot-simulazione/`.

- [ ] **Step 5: Commit finale (se emersi fix)**

```bash
git add -A
git commit -m "chore(fase7a): verifica finale grafica gironi/tabellone"
```

---

## Note di esecuzione

- **Ordine:** i task sono in dipendenza lineare (1→2→3→4→5→6→7). Task 3 dipende da 1 e 2; Task 5/6 dipendono da 3/4.
- **Review:** per subagent-driven-development, un review per task; review whole-branch prima del merge.
- **Fuori scope (Fase 7b):** vista pubblica in sola lettura + link col codice torneo (backend Worker/KV + rotta pubblica) — spec e piano separati. `BracketTree variant="statico"` è già pronto per essere riusato lì.
