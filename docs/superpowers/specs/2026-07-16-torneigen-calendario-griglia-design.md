# TorneiGen — Design: calendario a griglia orari × campi

**Data:** 2026-07-16
**Stato:** approvato per implementazione
**Dipende da:** Fasi 1–7b (scheduler, calendario organizzatore, vista pubblica).

## Contesto e obiettivo

Lo scheduler (`pianifica`) assegna già a ogni partita un **campo** (1…N) e un **orario**,
distribuendo le partite sui campi. Ma la resa — sia nel calendario dell'organizzatore
(`CalendarScreen`) sia nella vista pubblica (`PublicCalendar`) — è una **lista cronologica per
giornata che mescola i campi** (orario · campo · squadre in fila).

Obiettivo: mostrare il calendario come **griglia orari × campi**, una per giornata (righe = orari,
colonne = campi), così le partite risultano **divise per campo** con gli orari ordinati. È una
modifica di **visualizzazione**: lo **scheduler non cambia**.

Vincoli: TypeScript strict; solo design token; copy italiano; nessuna nuova dipendenza; motore/servizi
di scheduling invariati.

## A — Struttura dati (funzione pura)

Una funzione pura, testabile senza DOM, costruisce la griglia da un elenco di partite:

`buildCalendarGrid(matches: Match[]): GiornataGriglia[]`

- Considera solo le partite con `orario` valorizzato (le altre restano fuori dalla griglia).
- Raggruppa per **giornata** (`orario.slice(0,10)`), ordinate per data.
- Per ogni giornata:
  - **campi** = valori `campo` distinti presenti, ordinati numericamente quando numerici (poi
    alfabetico); un `campo` mancante/vuoto diventa la colonna **"Da definire"**.
  - **orari** = valori `HH:MM` distinti presenti, ordinati.
  - **celle**: per ogni (orario, campo) l'elenco delle partite a quell'incrocio (di norma una;
    più d'una solo dopo uno spostamento manuale → **collisione** da segnalare).

Tipi prodotti:
```
interface CellaGriglia { orario: string; campo: string; partite: Match[] }
interface GiornataGriglia { data: string; campi: string[]; orari: string[]; celle: CellaGriglia[] }
```
(le celle sono indicizzabili per `${orario}|${campo}`; il rendering guarda `partite.length`: 0 → "—",
1 → partita, >1 → impilate con avviso.)

Collocazione: `src/engine/calendarGrid.ts` (+ test), funzione pura di presentazione (nessuna
dipendenza DOM, nessuna modifica alle regole).

## B — Componente `CalendarGrid`

`src/components/CalendarGrid.tsx`:
`CalendarGrid({ matches, teamNames, onSeleziona? })`

- Usa `buildCalendarGrid(matches)`.
- Per ogni giornata: titolo (data, es. "Sabato 20 luglio" via `toLocaleDateString('it-IT', …)`), poi
  una **tabella**: prima riga = intestazioni campi; prima colonna = orari; celle = partite.
- **Cella:** le due squadre (nome A / nome B). Cella vuota → "—". Collisione (>1) → partite impilate
  con un piccolo segno di avviso.
- **Interattività:** se `onSeleziona` è passato (organizzatore), la cella con una partita è cliccabile
  e chiama `onSeleziona(match)`; senza (pubblico) è statica.
- **Mobile:** la tabella sta in un contenitore con `overflow-x: auto`; la **colonna orari è sticky a
  sinistra** (`position: sticky; left: 0`), così resta visibile scorrendo i campi. Su desktop sta
  larga senza scroll.
- **Stile:** solo token esistenti; nuove classi in coda a `src/styles/tokens.css`.

## C — Integrazione e consolidamento

- **CalendarScreen** (organizzatore): sostituisce la lista per-giornata con
  `<CalendarGrid matches={matches} teamNames={teamNames} onSeleziona={apriSposta} />`. Restano header,
  "Programma/Rigenera calendario", la modale "Sposta" (orario+campo) e i suoi handler.
- **PublicCalendar** (vista pubblica): diventa un wrapper che, se ci sono partite programmate, rende
  `<CalendarGrid matches={matches} teamNames={teamNames} />` (read-only); se nessuna è programmata,
  ritorna `null` (comportamento attuale). Mantiene il titolo "Calendario".
- La logica di raggruppamento a lista oggi duplicata nei due file viene rimossa a favore del
  componente/funzione condivisi.

## D — Test

- **`buildCalendarGrid`** (puro): raggruppa per giornata; colonne = campi distinti ordinati
  (numerico); campo vuoto → "Da definire"; righe = orari ordinati; cella con la partita giusta;
  partite senza orario escluse; collisione → cella con 2 partite.
- **`CalendarGrid`** (componente): rende intestazioni campi + colonna orari + celle; cella vuota "—";
  con `onSeleziona` la cella-partita è cliccabile e chiama il callback; senza, non è cliccabile.
- **CalendarScreen** / **PublicViewScreen**: i test esistenti restano verdi (aggiornati al minimo se
  cercavano il markup a lista).
- Verifica visiva con screenshot headless (organizzatore + vista pubblica) su telefono/desktop.

## Fuori scope

- Modifiche allo **scheduler** / all'assegnazione campo-orario.
- Drag-and-drop tra celle (lo spostamento resta via modale).
- Colonne per campi **non presenti** nei dati (mostriamo solo i campi effettivamente usati, non
  1…`numeroCampi` a prescindere).
