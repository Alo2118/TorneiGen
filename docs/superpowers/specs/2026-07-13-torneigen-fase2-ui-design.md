# TorneiGen — Design Fase 2: UI organizzatore

**Data:** 2026-07-13
**Stato:** approvato per implementazione
**Dipende da:** Fase 1 (motore `src/engine/` + persistenza `src/db/`, già in main)

## 1. Obiettivo

Costruire la UI dell'organizzatore sopra il motore e la persistenza della Fase 1: creare/gestire
tornei, squadre, generare gironi/tabelloni, inserire punteggi e vedere classifiche — tutto in
locale/offline. Nessuna iscrizione online (Fase 3), nessun motore avanzato (Fase 4).

## 2. Direzione visiva

Pulita e neutra, responsive, con identità "beach" discreta (mare + sabbia). Precisione in spaziatura
e tipografia; il carattere è concentrato in un solo elemento signature.

**Token colore**
```
--paper:   #FBFCFD   sfondo app
--surface: #FFFFFF   card
--ink:     #0F1B2A   testo principale
--muted:   #667085   testo secondario
--line:    #E4E9EF   hairline / bordi
--sea:     #0E9AA7   accento primario (azioni, stato attivo)
--sand:    #E6A93C   accento secondario, parsimonioso (set/tie-break point)
--win:     #16A34A   esito positivo
--danger:  #DC2626   errori/azioni distruttive
```

**Tipografia**
- Display/numeri: **Space Grotesk** (titoli, nome torneo, punteggi) — usata con restrizione.
- Corpo/UI: **Inter**.
- Numeri sempre `font-variant-numeric: tabular-nums`.
- Font self-hosted via `@fontsource/inter` e `@fontsource/space-grotesk` (offline-first: nessun
  fetch a runtime).

**Signature:** il controllo di inserimento punteggio in stile tabellone — numeri grandi, stepper
+/- adatti al touch, set attivo in `--sea`, `--sand` quando è set/tie-break point.

**Quality floor:** responsive fino a mobile, focus tastiera visibile, `prefers-reduced-motion`
rispettato, contrasto adeguato.

## 3. Architettura

Nuovo livello **`src/services/`** come ponte motore ↔ db (il motore resta puro, la UI resta senza
logica di dominio):

- `src/services/generation.ts` — funzione `generaTorneo(torneo, teams)`: in base al `formato`
  chiama il motore e **scrive** i record `Group`/`Match` in IndexedDB.
  - `girone_italiana` → `generateRoundRobin` su tutte le squadre → match `fase: 'girone'`.
  - `gironi_eliminazione` → `splitIntoGroups` + `generateRoundRobin` per girone; il tabellone
    finale si genera in un secondo momento dai qualificati (azione separata "Genera fase finale").
  - `eliminazione_diretta` → `generateSingleElimination` (ordinato per `testaDiSerie`) →
    match `fase: 'tabellone'`; applica `resolveByes`.
  - `king_of_the_court` → NON in Fase 2 (Fase 4): il bottone Genera è disabilitato con nota.
- `src/services/results.ts` — `salvaRisultato(matchId, set[])`: valida via `matchOutcome`,
  imposta `vincitoreId`/`stato`, e per i tabelloni fa avanzare il vincitore (`advanceWinner`)
  persistendo i match aggiornati.
- `src/services/standings.ts` — helper che legge i match di un girone e chiama `computeStandings`
  del motore (le classifiche restano calcolate al volo, non persistite).

**Stato/reattività:** `dexie-react-hooks` (`useLiveQuery`) — la UI si aggiorna automaticamente al
cambiare del db. Classifiche e avanzamento tabellone sono sempre derivati dallo stato corrente.

**Routing:** `react-router-dom`. URL per torneo e sezione (utile in PWA).

## 4. Navigazione e schermate

Shell responsive: rail laterale su desktop → bottom tab bar su mobile. Header persistente col
torneo attivo (nome, badge tipologia/formato, stato, azioni: Genera, Export JSON).

Schermate:
1. **Home** (`/`) — elenco tornei come card + "Nuovo torneo".
2. **Setup torneo** (`/tornei/nuovo`, `/tornei/:id/setup`) — nome, tipologia (2x2/4x4), formato,
   regole punteggio (default modificabili), data.
3. **Squadre** (`/tornei/:id/squadre`) — lista squadre e giocatori (2 o 4–8 secondo tipologia),
   aggiunta/modifica/rimozione manuale, assegnazione teste di serie.
4. **Calendario/Tabellone** (`/tornei/:id/tabellone`) — bottone "Genera"; vista gironi (partite per
   girone) e/o vista tabellone (albero eliminazione con avanzamento).
5. **Punteggi** (integrato nelle partite di calendario/tabellone) — controllo signature per
   inserire i set; salvataggio via `results.ts`.
6. **Classifiche** (`/tornei/:id/classifiche`) — classifiche per girone (live) e stato tabellone.

## 5. Testing

- **Services** (unit, Vitest + fake-indexeddb): `generaTorneo` crea i match/gruppi corretti per
  ogni formato supportato; `salvaRisultato` imposta vincitore e fa avanzare il tabellone;
  `standings` helper restituisce l'ordine atteso.
- **Componenti chiave** (React Testing Library + jsdom): il controllo punteggio applica le regole e
  chiama il salvataggio; la lista squadre valida il numero di giocatori per tipologia; la Home
  elenca i tornei.
- Aggiungere l'ambiente `jsdom` a Vitest per i test dei componenti, mantenendo i test motore in
  `node`.

## 6. Fuori scope (Fase 2)

- Iscrizioni online / Supabase (Fase 3).
- Eliminazione doppia e King of the Court (Fase 4): nella UI il formato KotC è selezionabile ma la
  generazione è disabilitata con nota "disponibile a breve".
- Deploy/PWA manifest+service worker completo: predisposizione font offline sì, ma la
  configurazione PWA completa (installabilità) può restare per un passo dedicato in Fase 3 col
  deploy pubblico.

## 7. Debiti tecnici da Fase 1 da chiudere qui

- `advanceWinner`: validare che `winnerId` appartenga alla partita; gestire la ri-modifica di un
  risultato già inserito (propagazione lungo il tabellone) — serve al flusso Punteggi.
- Sostituire lo scaffold Vite di `src/App.tsx` / `index.html` / `src/App.css` con la shell reale.
