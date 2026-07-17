# TorneiGen — Design: interazione partite (punteggio diretto, punteggio da calendario, spostamento drag-and-drop)

**Data:** 2026-07-17
**Stato:** approvato per implementazione
**Dipende da:** ScoreControl + saveResult (Fasi 1/3), CalendarScreen/CalendarGrid (Fase 5), org sync (Fase 8b).

## Contesto e obiettivo

Tre migliorie all'interazione con le partite, richieste dall'organizzatore:
1. **Punteggio digitabile**: oggi `ScoreControl` usa pulsanti +/− (un punto alla volta). Si vuole **scrivere il
   punteggio direttamente**.
2. **Punteggio dal calendario**: oggi i risultati si inseriscono solo dal tabellone/gironi; nel calendario
   toccando una partita si apre solo lo spostamento. Si vuole poter **segnare il risultato anche dal calendario**.
3. **Spostamento drag-and-drop**: oggi si sposta una partita con una finestra (orario/campo). Si vuole
   **trascinare** la partita su un'altra cella, anche col dito su telefono/tablet.

Decisioni prese in brainstorming:
- Punteggio: **solo campi digitabili** (niente +/−).
- Spostamento: **drag-and-drop vero**, mouse **e** touch (eventi puntatore, niente librerie esterne).
- Nel calendario ogni partita ha **due pulsanti espliciti**: **Punteggio** e **Sposta** (la finestra
  orario/campo resta come via precisa e accessibile); il **trascinamento** è la scorciatoia per spostare.
- La griglia mostra anche il **risultato** in forma compatta (vale anche per la vista pubblica).

Vincoli: TypeScript strict; copy italiano; retro-compatibilità di `CalendarGrid` (usato anche da
`PublicCalendar`, sola lettura); local-first (le scritture usano già `notificaModificaOrg`). NB ambiente:
il check di tipi reale è `npx tsc -b` (root `tsc --noEmit` è no-op); niente `npm test` (flaky su WSL).

## Parte A — `ScoreControl` con campi digitabili

In `src/components/ScoreControl.tsx`, per ogni squadra/set sostituire il blocco `− valore +` con **un solo
campo numerico**: `<input type="number" inputMode="numeric" min={0}>`, controllato dallo stato `sets`.
- onChange: `setPunto(i, 'puntiA'|'puntiB', Math.max(0, Math.floor(Number(e.target.value) || 0)))`.
- onFocus: `e.target.select()` (così digitando si sostituisce lo 0 invece di anteporre cifre).
- `aria-label` per campo come oggi (es. «Punteggio squadra A, set 1»).
- Invariati: `seed`, `targetSet`, `setDaMostrare` (rivelazione del set successivo), il pulsante **Salva**,
  le classi visive (set attivo / set point).
- Cambia anche l'inserimento dal **tabellone** (stesso componente) → coerente ovunque.
- Aggiornare `src/components/ScoreControl.test.tsx`: digitare nei campi (invece di cliccare +/−) e verificare
  che `onSalva` riceva i set digitati, e che scrivere un punteggio vincente riveli il set successivo.

## Parte B — Punteggio dal calendario + risultato in griglia

**`src/components/CalendarGrid.tsx`** (retro-compatibile):
- Props: rimpiazzare `onSeleziona?` con `onPunteggio?: (m: Match) => void` e `onSposta?: (m: Match) => void`
  (più, per la Parte C, `onSpostaSuCella?`). Se nessuna callback è passata (vista pubblica), la partita resta
  non interattiva.
- Ogni partita mostra sempre: nomi squadre e, se `m.set.length > 0`, il **risultato compatto**
  `m.set.map(s => \`${s.puntiA}–${s.puntiB}\`).join(' ')`.
- Se `onPunteggio`/`onSposta` presenti, sotto i nomi due piccoli pulsanti **Punteggio** e **Sposta**.
  «Punteggio» mostrato solo se `m.teamAId && m.teamBId` (altrimenti squadre non ancora definite).

**`src/screens/CalendarScreen.tsx`**:
- Nuovo stato `matchInPunteggio: Match | null`; modale (riuso `Modal` + `ScoreControl`) come nel
  `BracketScreen`: `handleSalvaPunteggio(set)` → `salvaEProppaga(torneo.id, matchInPunteggio.id, set,
  torneo.regolePunteggio)` → chiudi. Titolo = «A vs B».
- `onPunteggio={(m) => setMatchInPunteggio(m)}`; `onSposta={apriSposta}` (la finestra orario/campo attuale,
  invariata).

`PublicCalendar` non cambia (nessuna callback → sola lettura, ma ora mostra i risultati).

## Parte C — Spostamento drag-and-drop (mouse + touch)

**Hook riusabile** `src/services/usePointerDrag.ts` (generico, testabile, senza DOM-specifico):
`usePointerDrag({ soglia = 6, onInizio?, onMuovi?(x,y), onRilascia?(x,y), onAnnulla? })` →
`{ trascinando, handlers: { onPointerDown } }`.
- `onPointerDown` registra il punto iniziale e aggancia listener `pointermove`/`pointerup` su `window`.
- Oltre la soglia (px) → `trascinando = true`, chiama `onInizio` una volta e `onMuovi(x,y)` a ogni move.
- `pointerup`: se stava trascinando → `onRilascia(clientX, clientY)`; sgancia i listener.
- La risoluzione della **cella di destinazione** NON è nell'hook (resta testabile): la fa il consumatore con
  `document.elementFromPoint`.

**`CalendarGrid`**:
- Ogni `<td>` cella riceve `data-data={g.data}`, `data-orario={orario}`, `data-campo={campo}` (drop target,
  incluse le celle vuote).
- Il corpo-partita (area coi nomi) usa `usePointerDrag`: durante il trascinamento evidenzia la cella sotto il
  puntatore (via `elementFromPoint` → risale al `[data-data]`) e attenua la partita trascinata; al rilascio,
  se la cella è valida e diversa dall'origine, chiama `onSpostaSuCella(m, { data, orario, campo })`.
  `touch-action: none` sul corpo-partita per non far scrollare la griglia durante il drag. I pulsanti
  Punteggio/Sposta **non** avviano il drag.
- Feedback: classe sulla cella evidenziata + classe «in trascinamento» sulla partita (stili in `tokens.css`).

**Helper puro** `nuovaCollocazione(data, orario, campo)` → `{ orario: \`${data}T${orario}\`, campo: campo ===
CAMPO_VUOTO ? '' : campo }` (in `src/engine/calendarGrid.ts` o accanto), **testabile**.

**`CalendarScreen`**: `onSpostaSuCella(m, cella)` → `const { orario, campo } = nuovaCollocazione(...)` →
`db.matches.update(m.id, { orario, campo })` + `notificaModificaOrg(m.tournamentId)` + toast «Partita spostata».
Il pulsante **Sposta** (finestra) resta come via precisa/accessibile.

## Test

- `ScoreControl.test.tsx`: input digitabili + rivelazione set (Parte A).
- `CalendarGrid.test.tsx`: mostra risultato compatto; pulsanti Punteggio/Sposta presenti con callback, assenti
  senza (vista pubblica); «Punteggio» assente se una squadra è nulla; celle con `data-*`.
- `CalendarScreen.test.tsx`: apertura modale punteggio dal pulsante e salvataggio (mock/`salvaEProppaga`);
  `onSpostaSuCella` aggiorna orario/campo.
- `usePointerDrag.test.tsx`: soglia (nessun drag sotto soglia), `trascinando` dopo la soglia, `onRilascia`
  con le coordinate (eventi puntatore via `fireEvent`; nessun `elementFromPoint`).
- `calendarGrid.test.ts`: `nuovaCollocazione` (compone orario, mappa CAMPO_VUOTO→'').
- Il drag-and-drop end-to-end (con `elementFromPoint`) non è unit-testabile in jsdom → verifica manuale/headless;
  la logica pura (hook + `nuovaCollocazione`) sì.

## Fuori scope

- Spostare una partita in un **altro giorno** col drag (possibile con «Sposta»).
- Undo dello spostamento; riordino del drag da tastiera (c'è «Sposta»).
- Anteprima "clone" fluttuante avanzata (basta evidenziare la cella target + attenuare l'origine).

## Sotto-piani

1. Parte A — `ScoreControl` campi digitabili + test.
2. Parte B — `CalendarGrid` (risultato + pulsanti) + modale punteggio in `CalendarScreen` + test.
3. Parte C.1 — hook `usePointerDrag` + helper `nuovaCollocazione` + test.
4. Parte C.2 — cablaggio drag-and-drop in `CalendarGrid`/`CalendarScreen` + stili + verifica.
