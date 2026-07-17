# TorneiGen — Design Fase 8b: sync dell'organizzazione (auto bidirezionale)

**Data:** 2026-07-17
**Stato:** approvato per implementazione
**Dipende da:** Fase 8a (store cloud versionato `/api/org/:codice`, `OrgStore`, client `getOrg/putOrg/deleteOrg`, `WRITE_TOKEN`).

## Contesto e obiettivo

La Fase 8a ha costruito le fondamenta: uno store cloud versionato (D1) per un "documento di
organizzazione" per torneo, con endpoint privati dietro `WRITE_TOKEN`. Il documento è un blob JSON
opaco: la 8a non decide *cosa* ci finisca dentro né come si sincronizzi col locale.

La Fase 8b dà **contenuto** al documento e implementa la **sincronizzazione bidirezionale automatica**
locale↔cloud, così l'**organizzazione** del torneo diventa la fonte di verità condivisa (modificabile
da più dispositivi e controllabile da remoto), mentre lo **svolgimento** (partite e punteggi) resta
locale.

Decisioni prese in brainstorming:
- **Confine org↔svolgimento:** nel cloud vanno config + squadre + gironi + **struttura** del tabellone
  (chi gioca con chi, campo, orario); restano **locali solo i punteggi** (`set`, `vincitoreId`, `stato`).
- **Modello sync:** **auto bidirezionale** — pull automatico all'apertura del torneo, push automatico
  (con debounce) a ogni modifica dell'organizzazione.
- **Conflitti (409):** **banner con scelta esplicita**, mai perdita silenziosa.
- **Onboarding secondo dispositivo:** in Home, "Carica dal cloud" per *codice*.

Vincoli: TypeScript strict; copy italiano; **local-first intatto** (tutta la sync è no-op se offline /
senza write token / senza URL API); il documento è privato → sempre dietro `WRITE_TOKEN` (già così in 8a).

## A — Il documento di organizzazione (`OrgDoc`)

Nuovo tipo condiviso `src/types/org.ts` (accanto a `OrgRecord`):

```ts
import type { Tournament, Team, Group, Match } from '../engine/types'

export type MatchStruct = Omit<Match, 'set' | 'vincitoreId' | 'stato'>

export interface OrgDoc {
  tournament: Tournament   // config completa
  teams: Team[]
  groups: Group[]
  struttura: MatchStruct[] // matches SENZA punteggi
}
```

Il `doc` della 8a (stringa) = `JSON.stringify(orgDoc)`.

**Campi locali esclusi dal doc.** Alcuni campi di `Tournament` sono locali e NON vanno condivisi:
`pubblicato` (stato dello snapshot pubblico, per-dispositivo) e i due nuovi campi di bookkeeping sync
`orgVersion` / `orgPending` (§C). In fase di **push** questi campi vengono azzerati/omessi nel doc; in
fase di **apply** (pull) vengono **preservati dal record locale** (vedi §B).

## B — Confine punteggi: merge per `matchId`

- **buildOrgDoc(tournamentId): OrgDoc** — legge dal locale `tournament`, `teams`, `groups`, `matches`;
  produce `struttura` = ogni match senza `set/vincitoreId/stato`; nel `tournament` del doc azzera i
  campi locali (`pubblicato=undefined`, `orgVersion=undefined`, `orgPending=undefined`).
- **applyOrgDoc(doc, localTournament, localMatches): { tournament, teams, groups, matches }** — costruisce
  lo stato locale da scrivere:
  - `teams`, `groups` = quelli del doc (sostituzione in blocco).
  - `matches` = per ogni `struttura[i]`: se esiste un match locale con lo stesso `id` → ricompongo
    `{ ...struttura[i], set, vincitoreId, stato }` **dai valori locali**; altrimenti nuovo match con
    `set: [], vincitoreId: null, stato: 'programmata'`. I match locali non presenti nella struttura
    cloud vengono **rimossi**.
  - `tournament` = `doc.tournament` ma con i campi locali **presi dal record locale**
    (`pubblicato`, e la versione sync viene impostata dal chiamante dopo la scrittura).

La scrittura locale avviene in una transazione Dexie che sostituisce teams/groups/matches del torneo
(riuso del pattern di `replaceGenerated` / `importBackup`).

## C — Stato di sincronizzazione (nuovi campi su `Tournament`)

In `src/engine/types.ts`, `Tournament` guadagna due campi opzionali:
- `orgVersion?: number` — ultima versione cloud conosciuta e riconciliata localmente.
- `orgPending?: boolean` — esistono modifiche org locali non ancora confermate nel cloud.

Sono **locali** (mai serializzati nel doc). Assenti = torneo mai sincronizzato (equivalgono a versione 0 /
nessuna modifica pendente).

## D — Servizio `orgSync.ts`

Nuovo `src/services/orgSync.ts`. Attivo solo se `sincronizzabile()` = online **e** write token impostato
**e** URL API impostato; altrimenti ogni funzione è no-op silenziosa (best-effort, come
`pubblicaSeAttivo`).

- **notificaModificaOrg(tournamentId): void** — imposta `orgPending=true` sul torneo locale e programma un
  **push con debounce (~1500 ms)** (coalescing di modifiche ravvicinate). Chiamata dalle operazioni che
  toccano l'organizzazione (§F).
- **spingiOrg(tournamentId): Promise<EsitoSync>** — build del doc, `putOrg(codice, doc, orgVersion ?? 0)`:
  - `{ conflitto:false, version }` → `orgVersion=version`, `orgPending=false` → `{ stato:'sincronizzato' }`.
  - `{ conflitto:true, version }` → **non** tocca `orgPending`; restituisce `{ stato:'conflitto', versioneCloud:version }`.
  - eccezione (offline/errore) → `orgPending` resta true → `{ stato:'errore' }` (riprova dopo).
- **tiraOrg(tournamentId): Promise<EsitoSync>** — `getOrg(codice)`:
  - `null` → il torneo non è ancora nel cloud → `spingiOrg` (primo upload).
  - `version === orgVersion` → in pari; se `orgPending` → `spingiOrg`.
  - `version > orgVersion` e **non** `orgPending` → `applyOrgDoc` + scrivi + `orgVersion=version` →
    `{ stato:'aggiornato' }`.
  - `version > orgVersion` e `orgPending` → **conflitto**: `{ stato:'conflitto', versioneCloud:version, docCloud }`.
  - `version < orgVersion` (locale avanti, raro) → `spingiOrg`.
- **risolviConflittoUsaCloud(tournamentId, docCloud, versioneCloud): Promise<void>** — `applyOrgDoc` del
  doc cloud, `orgVersion=versioneCloud`, `orgPending=false`.
- **risolviConflittoSovrascrivi(tournamentId, versioneCloud): Promise<EsitoSync>** — `putOrg` con base =
  `versioneCloud` (last-write-wins esplicito a favore del locale); su successo `orgVersion=nuova`,
  `orgPending=false`.

`EsitoSync` = `{ stato: 'sincronizzato'|'aggiornato'|'conflitto'|'errore'|'assente', versioneCloud?: number, docCloud?: OrgDoc }`.

## E — Hook `useOrgSync(tournamentId)` (apertura torneo)

`src/services/useOrgSync.ts` (o in un hook dedicato): al montaggio della schermata torneo, se
`sincronizzabile()`, esegue `tiraOrg` una volta e ritorna lo stato per la UI:
`{ conflitto: null | { versioneCloud, docCloud }, risolviCloud(), risolviLocale() }`. Non fa polling
(pull solo all'apertura). Montato nel contenitore della vista torneo (es. `RiepilogoScreen` o il layout
del torneo) così da valere per tutte le sotto-schermate.

## F — Punti di aggancio dell'auto-push

`notificaModificaOrg(tournamentId)` viene invocata dalle operazioni che modificano l'organizzazione:
- salvataggio configurazione torneo (Setup);
- modifiche alle squadre (aggiunta/conferma/rimozione, import iscrizioni);
- generazione gironi/tabellone;
- assegnazione campi/orari (calendario).

**Non** viene invocata da `saveResult` (i punteggi sono svolgimento locale). L'aggancio è additivo e
best-effort: se la sync è spenta, `notificaModificaOrg` è no-op e le operazioni esistenti restano
invariate.

## G — Banner conflitto (UI)

Componente `src/components/ConflittoOrgBanner.tsx`, mostrato nella vista torneo quando `useOrgSync`
segnala un conflitto. Non bloccante. Testo: «L'organizzazione è cambiata su un altro dispositivo. Le tue
ultime modifiche non sono ancora nel cloud.» Due azioni:
- **Usa quelle dal cloud** → `risolviConflittoUsaCloud` (scarta le modifiche locali non salvate).
- **Sovrascrivi con le mie** → `risolviConflittoSovrascrivi` (last-write-wins esplicito).

## H — Onboarding secondo dispositivo (Home)

In `HomeScreen`, accanto a "Nuovo torneo", azione **"Carica dal cloud"**: input *codice* → `getOrg(codice)`:
- trovato → crea il torneo locale da `applyOrgDoc` (nessun match locale preesistente → punteggi vuoti),
  riusando `doc.tournament.id` come `id` locale (così i `matchId` tournament-scoped combaciano tra i due
  dispositivi ed evitano duplicati), `orgVersion = version`, `orgPending = false`, naviga al torneo. Da
  lì l'auto-sync prosegue.
- non trovato → messaggio «Nessun torneo con questo codice nel cloud».
- già presente localmente (stesso `id`/`codiceIscrizione`) → apre l'esistente (nessun duplicato).

Nota: `getOrg`/`putOrg` usano il **write token**; senza token impostato l'azione avvisa di configurarlo
in Impostazioni.

## I — Impostazioni: campo "Token di scrittura"

In `SettingsScreen`, campo password "Token di scrittura" (usa `getWriteToken/setWriteToken`, già
esistenti), salvato insieme agli altri. Copy: «Serve a sincronizzare l'organizzazione del torneo tra
i tuoi dispositivi. È più potente del token di lettura: tienilo privato.» La "Verifica connessione"
resta sul token di lettura (iscrizioni); il write token si validerà implicitamente al primo sync.

## J — Local-first e sicurezza

- Tutta la sync è **no-op** senza (online + write token + URL API). L'app resta pienamente locale.
- Il documento è privato (contiene rose/contatti) → sempre dietro `WRITE_TOKEN` (invariato dalla 8a).
- Nessun punteggio nel documento → due organizzatori che segnano non si sovrascrivono a vicenda.

## K — Test

- **orgSync** (`src/services/orgSync.test.ts`, con client fake): `buildOrgDoc` rimuove i punteggi e azzera
  i campi locali; `applyOrgDoc` fonde i punteggi per `id`, aggiunge i match nuovi (punteggi vuoti), rimuove
  quelli assenti, preserva `pubblicato`; `spingiOrg` transizioni 200→sincronizzato / 409→conflitto /
  offline→errore; `tiraOrg` casi assente/in-pari/cloud-avanti-pulito(applica)/cloud-avanti-pending(conflitto);
  `risolviConflitto*`.
- **Home** carica-dal-cloud (trovato/non trovato/senza token).
- **Settings** presenza e salvataggio del campo write token.
- **ConflittoOrgBanner** invoca le due azioni.

Verifica finale come da vincolo ambiente WSL: `npx tsc --noEmit` + run mirati Vitest + `npx vite build`
(niente full-suite, flaky su WSL).

## Fuori scope (8b)

- Merge dei **punteggi** live tra dispositivi e secondo organizzatore che segna in tempo reale (8c).
- Migrazione automatica dei tornei locali esistenti verso il cloud (upload al primo salvataggio è
  coperto da `tiraOrg`→`spingiOrg`, ma nessuna migrazione di massa).
- Presence/co-editing in tempo reale, storico versioni, undo remoto.

## Sotto-piani (indicativi)

1. Tipi (`OrgDoc`, `MatchStruct`, campi `orgVersion/orgPending`) + `buildOrgDoc`/`applyOrgDoc` + test.
2. `orgSync.ts` (spingi/tira/risolvi + debounce + guardia `sincronizzabile`) + test.
3. `useOrgSync` + montaggio nella vista torneo + `ConflittoOrgBanner` + test.
4. Agganci auto-push nelle operazioni org (Setup, squadre, generazione, calendario).
5. Home "Carica dal cloud" + Settings write token + test.
