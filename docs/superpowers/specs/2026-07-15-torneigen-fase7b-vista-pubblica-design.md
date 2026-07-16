# TorneiGen — Design Fase 7b: vista pubblica del torneo (link per i giocatori)

**Data:** 2026-07-15
**Stato:** approvato per implementazione
**Dipende da:** Fasi 1–7a (motore, doppia elim + golden, gironi→fase finale, calendario, grafica albero/gironi).

## Contesto e obiettivo

Oggi i giocatori seguono il torneo da un **foglio A3** stampato e compilato a mano.
Obiettivo della **Fase 7b**: pubblicare una **vista pubblica in sola lettura** del torneo,
accessibile via **link col codice torneo**, così i giocatori vedono su telefono gironi,
tabellone e calendario aggiornati.

L'app è **local-first** (dati nell'IndexedDB dell'organizzatore). Esiste già un **Cloudflare
Worker + KV** usato per le iscrizioni, con il pattern giusto: `POST /api/torneo` (autenticato col
`READ_TOKEN`) scrive su KV, `GET /api/torneo/:codice` legge pubblicamente. Esiste già una rotta
pubblica fuori da `AppShell` (`/iscrizione/:codice`). La 7b è l'analogo in sola lettura del
tabellone.

**Approccio scelto:** riuso PWA + Worker. Il Worker salva uno **snapshot** su KV; una rotta
pubblica della PWA lo legge e lo rende con i componenti già esistenti (`BracketTree variant="statico"`,
`GironeStandings`). Niente rendering lato Worker.

Vincoli: TypeScript strict; motore puro; servizi come ponte; UI chiama i servizi; **solo design
token**; copy italiano; **zero dati personali** nello snapshot; pubblicazione **best-effort** che
non blocca mai il salvataggio locale.

---

## A — Pubblicazione (opt-in + auto-update)

- **Opt-in (privacy):** un torneo non va online da solo. Nel **Riepilogo** una sezione
  "Condivisione pubblica" con un bottone **"Pubblica"**. Al primo click: costruisce lo snapshot, lo
  invia al Worker (autenticato col `READ_TOKEN` già in uso), e imposta `Tournament.pubblicato = true`.
- **Auto-update:** finché `pubblicato`, **ogni** modifica ai dati pubblici ripubblica lo snapshot in
  automatico e **best-effort**, dopo: salvataggio risultato (`salvaEProppaga`), generazione
  gironi/tabellone, genera fase finale, programmazione calendario. Un unico helper
  `pubblicaSeAttivo(tournamentId)` (controlla `pubblicato` + online + token) chiamato in quei punti.
  **Non blocca mai** il salvataggio locale: offline o senza token → il salvataggio va comunque, la
  pubblicazione si aggiorna al prossimo save riuscito.
- **Snapshot pubblicato** (`PublicSnapshot`): `codice, nome, tipologia, formato, faseFinale?,
  qualificatiPerGirone?, updatedAt`, **`teams: {id, nome}[]`** (senza `players`), `groups`,
  `matches: Match[]` (con risultati, `campo`, `orario`), `giornate?, numeroCampi?, durataPartitaMin?`.
  Le partite non contengono dati personali; le squadre sono ridotte a id+nome. `codice` =
  `codiceIscrizione` (stesso codice delle iscrizioni).
- **Worker:** nuova coppia (+delete) — `POST /api/pubblico/:codice` (autenticato, salva
  `pubblico:${codice}`), `GET /api/pubblico/:codice` (**pubblico**, legge), `DELETE
  /api/pubblico/:codice` (autenticato, rimuove). Separati dal `Riepilogo` delle iscrizioni.

---

## B — Vista pubblica

- Nuova rotta **`/pubblico/:codice`** fuori da `AppShell` (come `/iscrizione/:codice`), componente
  `PublicViewScreen`. Nessun token: al mount `GET /api/pubblico/:codice`.
- **Stati:** caricamento; "torneo non trovato / non ancora pubblicato" (404); errore rete/offline.
  In cima intestazione col nome torneo e **"aggiornato alle HH:MM"** (da `updatedAt`).
- **Contenuto** (sola lettura, mobile-first):
  - **Gironi** → `GironeStandings` per girone (zona qualificazione);
  - **Tabellone** → `BracketTree variant="statico"`;
  - **Calendario** → resa read-only per giornata (orario · campo · squadre), da un componente
    presentazionale `PublicCalendar` costruito dalle partite dello snapshot (nessuna dipendenza da Dexie).
- **Freschezza** (update automatico lato organizzatore): la pagina **rifà il fetch quando la scheda
  torna in primo piano**, con un bottone **"Aggiorna"** e un refresh leggero ogni ~60s.

---

## C — Condivisione e gestione

Sezione "Condivisione pubblica" nel **Riepilogo**:

- **"Pubblica"** — richiede `READ_TOKEN` impostato (se manca, rimanda a Impostazioni) ed essere
  online. Al successo `pubblicato = true` e primo snapshot inviato.
- Una volta pubblicato mostra:
  - il **link pubblico** `https://<host>/pubblico/CODICE` (`host` = origine della PWA via
    `window.location.origin`, non il Worker);
  - **"Copia link"** e **"Condividi"** (Web Share API dove disponibile);
  - un **codice QR** (generato **offline** con la libreria `qrcode`) da mostrare/stampare;
  - **stato:** "Pubblicazione automatica attiva · aggiornato alle HH:MM"; se un auto-update
    fallisce, nota discreta "non aggiornato, riprovo al prossimo salvataggio".
- **"Interrompi pubblicazione"** — `DELETE` dello snapshot sul Worker + `pubblicato = false`. Il link
  poi risponde "non trovato".

---

## D — Confini, file, test

**Worker:** `worker/src/handler.ts` (+`handler.test.ts`) — i tre endpoint sopra. Test: auth
richiesta su POST/DELETE, lettura pubblica, 404.

**Tipo condiviso** (`src/types/public.ts`): `PublicSnapshot`, importato da app e Worker (come
`Riepilogo`).

**Servizi app:**
- `src/services/pubblicazione.ts`: `buildSnapshot(id)` (legge Dexie, **spoglia i contatti**),
  `pubblica(id)`, `interrompiPubblicazione(id)`, `pubblicaSeAttivo(id)` (best-effort: no-op se non
  pubblicato / offline / senza token; non rilancia errori).
- `src/services/registrations-api.ts`: metodi client `pubblicaSnapshot / getSnapshot /
  rimuoviSnapshot`.
- `src/engine/types.ts`: `Tournament.pubblicato?: boolean`.
- Hook `pubblicaSeAttivo` dopo: `salvaEProppaga` (saveResult.ts), genera gironi/tabellone e genera
  fase finale (BracketScreen), programma calendario (CalendarScreen/servizio). Mai bloccante.

**UI:**
- `src/screens/PublicViewScreen.tsx` + rotta `/pubblico/:codice` in `src/app/App.tsx` fuori da AppShell.
- `src/components/PublicCalendar.tsx` (calendario read-only presentazionale).
- `src/components/SharePanel.tsx` (nel Riepilogo: pubblica/interrompi, link, copia, condividi, stato).
- `src/components/QRCode.tsx` (wrapper di `qrcode`).

**Test:** handler Worker (nuovi endpoint); `buildSnapshot` (spoglia i contatti, include
gironi/partite/updatedAt); `pubblicaSeAttivo` (guardie no-op); `PublicViewScreen` (render da
snapshot mockato: gironi + un match-box + calendario); `SharePanel` (pubblica → flag + link;
interrompi → pulito); `QRCode` (render).

**Dipendenze nuove:** `qrcode` (+ `@types/qrcode`).

---

## Fuori scope (7b)

- **Multi-organizzatore / co-editing da più dispositivi** (due che *scrivono* lo stesso torneo):
  è sincronizzazione bidirezionale con gestione conflitti e auth del secondo organizzatore — **fase
  separata futura**, da brainstormare a sé. La 7b è a senso unico (organizzatore → pubblico).
- Elenco/directory pubblica dei tornei (scoperta senza codice).
- Notifiche push ai giocatori.
- Export PDF/immagine della vista pubblica.

## Sotto-piani (indicativi)

1. **Worker + tipo:** endpoint `pubblico` (POST/GET/DELETE) + `PublicSnapshot` + test handler.
2. **Servizi pubblicazione:** `buildSnapshot`/`pubblica`/`interrompi`/`pubblicaSeAttivo` + client API +
   flag `pubblicato` + hook nei punti di mutazione.
3. **Vista pubblica:** `PublicViewScreen` + rotta + `PublicCalendar` + stati/refresh.
4. **Condivisione:** `SharePanel` nel Riepilogo + `QRCode` + link/copia/condividi/interrompi.
