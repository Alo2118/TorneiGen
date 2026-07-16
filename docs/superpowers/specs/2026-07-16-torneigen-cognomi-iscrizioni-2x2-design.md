# TorneiGen — Design: cognomi nel flusso iscrizioni online (2x2)

**Data:** 2026-07-16
**Stato:** approvato per implementazione
**Dipende da:** "etichetta squadre coi cognomi nel 2x2" (helper `etichettaSquadra`/`mappaEtichette`, nome opzionale 2x2).

## Contesto e obiettivo

Nel 2x2 le coppie si identificano coi cognomi. Il display delle squadre già lo fa. Restava fuori il
**flusso iscrizioni online**: il form pubblico `/iscrizione/:codice` chiede un "Nome squadra"
obbligatorio, la schermata **Iscrizioni** (`RegistrationsAdminScreen`) mostra `iscr.nomeSquadra`, e la
deduplica (`nuoveIscrizioni`) confronta per nome. Obiettivo: nel **2x2** l'identità dell'iscrizione
sono i **cognomi** dei due giocatori; il "Nome squadra" nel form è **facoltativo**. Il **4x4** resta
invariato.

Vincoli: TypeScript strict; copy italiano; motore di torneo invariato; solo cognomi come identità
pubblica (email/telefono/nomi propri restano privati).

## A — Etichetta iscrizione

`src/services/teams.ts`: `etichettaIscrizione(iscr: Iscrizione, tipologia: Tipologia): string`, che
condivide un nucleo comune con `etichettaSquadra`:
- **2x2:** cognomi non vuoti dei `iscr.giocatori` uniti da `" / "` (ordine di inserimento); fallback
  `iscr.nomeSquadra.trim()` → `iscr.id`.
- **4x4:** `iscr.nomeSquadra.trim()` → `iscr.id`.

Nota: `Iscrizione` è in `src/types/registrations.ts` (importata da `teams.ts`, solo tipo).

## B — Schermata Iscrizioni

`RegistrationsAdminScreen`: per le iscrizioni online in attesa mostra
`etichettaIscrizione(iscr, torneo.tipologia)` invece di `iscr.nomeSquadra` (lo screen ha il torneo →
tipologia).

## C — Deduplica

`src/services/import.ts` `nuoveIscrizioni`: oggi filtra le iscrizioni in arrivo confrontando
`iscrizione.nomeSquadra` col `team.nome` esistente. Con nomi vuoti nel 2x2 due coppie diverse
verrebbero **fuse** (bug). Nuova firma:
`nuoveIscrizioni(iscrizioni, teamsEsistenti, tipologia): Iscrizione[]`
- chiave esistenti: `etichettaSquadra(team, tipologia).trim().toLowerCase()`
- chiave in arrivo: `etichettaIscrizione(iscr, tipologia).trim().toLowerCase()`
Il chiamante `RiepilogoScreen` (auto-sync iscrizioni) passa `torneo.tipologia`.

## D — Form pubblico

`RegistrationScreen`: il campo "Nome squadra" diventa **facoltativo per il 2x2** —
`required={riepilogo.tipologia !== '2x2'}`, label "Nome squadra (facoltativo)" nel 2x2. Il client
`validaSquadra` accetta già nome vuoto nel 2x2. Il POST invia `nomeSquadra: nome` (anche `''`).

## E — Worker

`worker/src/handler.ts`, `POST /api/iscrizioni/:codice`: oggi richiede `b.nomeSquadra?.trim()`. Lo
condiziona alla tipologia — che il Worker conosce dal Riepilogo salvato (`torneo:${codice}` contiene
`tipologia`): per il **2x2** NON richiede `nomeSquadra` (identità = cognomi dei giocatori, già
validati campo per campo); per il **4x4** resta obbligatorio. L'iscrizione è salvata con
`nomeSquadra` inviato (o `''` nel 2x2).

## F — Import invariato

`iscrizioneATeam` non cambia: crea il team con `nomeSquadra` (anche vuoto nel 2x2); la
visualizzazione deriva i cognomi via `etichettaSquadra`.

## G — Confini, file, test

**Worker:** `worker/src/handler.ts` (+ `handler.test.ts`).
**Servizi:** `src/services/teams.ts` (`etichettaIscrizione` + core condiviso); `src/services/import.ts`
(`nuoveIscrizioni` con `tipologia`, + `import.test.ts`).
**UI:** `src/screens/RegistrationScreen.tsx` (campo opzionale 2x2), `src/screens/RegistrationsAdminScreen.tsx`
(etichetta), `src/screens/RiepilogoScreen.tsx` (passa `tipologia` a `nuoveIscrizioni`).

**Test:**
- handler: 2x2 senza nomeSquadra → 201 e salva; 4x4 senza nomeSquadra → 400; con nomeSquadra invariato.
- `etichettaIscrizione`: 2x2 due cognomi → "Rossi / Bianchi"; 2x2 senza cognomi → fallback nome→id; 4x4 → nome.
- `nuoveIscrizioni`: due iscrizioni 2x2 con `nomeSquadra` vuoto ma cognomi diversi NON vengono fuse;
  un'iscrizione la cui etichetta coincide con una squadra esistente viene scartata.
- `RegistrationScreen`: 2x2 → campo nome opzionale, invio senza nome riuscito (mock client).
- `RegistrationsAdminScreen`: mostra i cognomi per un'iscrizione 2x2 in attesa.

## Fuori scope

- Cambiare la validazione dei giocatori (cognome resta già obbligatorio).
- Etichetta per il 4x4 (usa il nome come sempre).
