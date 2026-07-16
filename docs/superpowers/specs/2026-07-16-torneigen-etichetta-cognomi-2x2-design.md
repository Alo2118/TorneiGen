# TorneiGen — Design: etichetta squadre coi cognomi nel 2x2

**Data:** 2026-07-16
**Stato:** approvato per implementazione
**Dipende da:** Fasi 1–7b + calendario a griglia (visualizzazione squadre esistente).

## Contesto e obiettivo

Nel beach volley **2x2** le coppie si identificano coi **cognomi** dei due giocatori
(es. `Rossi / Bianchi`), non con un nome-squadra inventato. Oggi l'app mostra ovunque
`team.nome`. Obiettivo: nel **2x2** mostrare l'etichetta derivata dai cognomi ovunque si
visualizzano le squadre (tabellone, classifiche, calendario, elenco squadre, vista pubblica); nel
**4x4** resta il nome-squadra. Il campo "Nome squadra" nell'inserimento diventa **facoltativo** per il
2x2.

Vincoli: TypeScript strict; solo design token; copy italiano; motore di torneo invariato; helper puri
e testabili; nessun dato personale in più nello snapshot oltre ai cognomi (identità pubblica della
coppia, come sul foglio cartaceo).

## A — Derivazione dell'etichetta

Funzioni pure in `src/services/teams.ts`:

`etichettaSquadra(team: Team, tipologia: Tipologia): string`
- **2x2:** unisce con `" / "` i **cognomi** (`player.cognome` non vuoto, `trim`) dei giocatori.
  Se nessun cognome è presente → `team.nome` (se non vuoto) → altrimenti `team.id`.
- **4x4:** `team.nome` (se non vuoto) → altrimenti `team.id`.

`mappaEtichette(teams: Team[], tipologia: Tipologia): Record<string, string>`
- ritorna `{ [team.id]: etichettaSquadra(team, tipologia) }`.

Rimpiazza i punti UI che oggi costruiscono la mappa con
`Object.fromEntries(teams.map((t) => [t.id, t.nome]))`:
`src/screens/BracketScreen.tsx`, `src/screens/StandingsScreen.tsx`,
`src/screens/CalendarScreen.tsx`, e l'elenco squadre in `src/screens/TeamsScreen.tsx`.
Ognuno passa `torneo.tipologia`.

## B — Vista pubblica

`buildSnapshot` (`src/services/pubblicazione.ts`) conosce la tipologia dal torneo: mappa
`teams: teams.map((t) => ({ id: t.id, nome: etichettaSquadra(t, torneo.tipologia) }))`.
Così lo snapshot pubblico — che riceve solo `{id, nome}` — contiene già l'etichetta coi cognomi per il
2x2, e `PublicViewScreen` non cambia (usa `snap.teams[].nome`). Si pubblicano solo i **cognomi**
(identità pubblica), non email/telefono/nomi propri.

## C — Inserimento squadre (TeamsScreen)

- **2x2:** il campo "Nome squadra" diventa **facoltativo** (etichetta "Nome squadra (facoltativo)",
  senza `required`). L'organizzatore inserisce solo i 2 giocatori; `team.nome` si salva com'è (anche
  stringa vuota).
- **4x4:** invariato (campo nome normale).
- **Elenco squadre:** mostra `etichettaSquadra(team, tipologia)` invece del solo `team.nome`.
- **Validazione:** `validaSquadra` resta invariata (valida numero e campi dei giocatori). Nessun nuovo
  obbligo: se mancassero i cognomi in un 2x2, l'etichetta ripiega su nome→id.
- Le **iscrizioni online** continuano ad arrivare con `nomeSquadra` + giocatori: la deduplica per nome
  (`nuoveIscrizioni`) non cambia.

## D — Confini, file, test

**Servizi:** `src/services/teams.ts` — `etichettaSquadra` + `mappaEtichette` (puri).
**Snapshot:** `src/services/pubblicazione.ts` — `buildSnapshot` usa `etichettaSquadra`.
**UI:** `BracketScreen`, `StandingsScreen`, `CalendarScreen`, `TeamsScreen` (mappa via `mappaEtichette`;
TeamsScreen: campo nome opzionale per 2x2 + elenco con etichetta).
**Motore di torneo:** invariato.

**Test:**
- `etichettaSquadra`: 2x2 due cognomi → "Rossi / Bianchi"; 2x2 un solo cognome presente → quel
  cognome; 2x2 senza cognomi → fallback a `nome`; nome vuoto → `id`; 4x4 → `nome`.
- `mappaEtichette`: costruisce la mappa id→etichetta.
- `buildSnapshot` (estende `pubblicazione.test`): per un torneo 2x2 le `teams[].nome` dello snapshot
  sono i cognomi; nessun contatto trapela (già coperto).
- `TeamsScreen`: in un torneo 2x2 si salva una squadra **senza** nome (solo giocatori) e l'elenco
  mostra l'etichetta coi cognomi.
- I test esistenti che usano squadre con `players: []` ripiegano su `nome` → restano verdi.

## Fuori scope

- Interruttore per-torneo (deciso: derivazione automatica per 2x2).
- Cambiare la validazione dei giocatori o rendere i cognomi obbligatori.
- Ordinamento/seeding basato sui cognomi.
