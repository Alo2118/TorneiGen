# Formula "3-set / gironi incrociati + consolazione" — Design

**Data:** 2026-07-21

## Obiettivo

Supportare la formula del torneo 4x4:

- **Gironi**: si giocano **sempre 3 set** (primi due a 21, terzo a 15). Ogni set
  vale 1 punto: la classifica del girone si fa a **set vinti**.
- **Fase finale (top 2 di ogni girone)**: semifinali **incrociate** (A1–B2,
  B1–A2), poi finale 1°/2° e **finalina 3°/4°**.
- **Consolazione**: le squadre non qualificate (dal 3° posto in giù di ogni
  girone) formano un **girone di sola andata** con classifica a set. Con 7
  squadre (gironi 3+4) sono 1+2 = **girone a 3**.

L'assegnazione dei giorni (giovedì/venerdì) resta manuale via Calendario: fuori
scope per il motore.

## Approccio

Opzioni **additive** che si compongono con `formato: 'gironi_eliminazione'` +
`faseFinale: 'diretta'` + `qualificatiPerGirone: 2`. Nessun nuovo `Formato`
(evita di toccare tutti gli `switch(formato)`). Un pulsante-preset "Formula
3-set" imposta i tre flag insieme.

## Modello dati (campi nuovi, tutti opzionali → default = comportamento attuale)

- `RegolePunteggio.gironiPerSet?: boolean` — classifica gironi a set vinti,
  sempre 3 set. Vive su `regolePunteggio` così viene già sincronizzato dal
  cloud e persistito con il torneo.
- `Tournament.finaleTerzoPosto?: boolean` — aggiunge la finalina 3°/4°.
- `Tournament.gironeConsolazione?: boolean` — genera il girone di consolazione.
- `Group.tipo?: 'girone' | 'consolazione'` — default assente = girone normale.

## Comportamento

### 1. Punteggio a set (solo gironi)

- Nuova `esitoGirone(sets)`: vince chi prende più set (2-1 o 3-0). `completa`
  solo con **3 set validi** (con meno set → `in_corso`, non `conclusa`).
- `applicaRisultato(match, set, regole)`: se `match.fase === 'girone' &&
  regole.gironiPerSet` usa `esitoGirone`, altrimenti resta `matchOutcome`
  (best-of-3). Il tabellone è sempre best-of-3.
- `computeStandings(teamIds, matches, regole)`: se `regole.gironiPerSet`,
  ordina per: **set vinti (desc)** → **quoziente punti** (fatti/subiti, desc) →
  scontro diretto (spareggio finale a due). `computeStandings` è chiamata solo
  per gironi/consolazione, mai per il tabellone.

### 2. Fase finale: semifinali incrociate + finalina

- A1–B2 e B1–A2 escono già dal seeding esistente (`qualifiedTeams` produce
  l'ordine A1,B1,A2,B2 → il single-elim accoppia 1v4/2v3 = incroci).
- Con `finaleTerzoPosto`, `generaFaseFinale` aggiunge un match finalina
  alimentato dai **perdenti** delle due semifinali. Instradamento tramite
  `perdenteVerso` (stesso meccanismo dell'eliminazione doppia). Dettaglio della
  propagazione nel piano; il match finalina è etichettato per la vista tabellone
  come "3°/4° posto".

### 3. Girone di consolazione

- In `generaFaseFinale`, dopo aver calcolato le classifiche dei gironi
  **originali** (`tipo !== 'consolazione'`), le squadre oltre i primi
  `qualificatiPerGirone` di ogni girone confluiscono in un unico
  `Group{tipo:'consolazione', nome:'Consolazione'}`.
- Se sono ≥ 2, si generano i match round-robin di **sola andata** (motore
  `generateRoundRobin`, fase `'girone'`, `groupId` del girone consolazione).
- La precondizione "tutti i gironi conclusi" considera **solo** i gironi con
  `tipo !== 'consolazione'`. La rigenerazione della fase finale sostituisce sia
  il tabellone sia il girone di consolazione (come già fa col tabellone).

### 4. UI

- `SetupScreen`, sezione `gironi_eliminazione`: tre checkbox (`gironiPerSet`,
  `finaleTerzoPosto`, `gironeConsolazione`) + pulsante "Preset Formula 3-set"
  che li accende tutti e imposta `setAlMeglioDi: 3`, `puntiSet: 21`,
  `puntiTieBreak: 15`.
- Classifiche/Calendario mostrano il girone di consolazione automaticamente
  (è un girone come gli altri). La classifica a set si vede dove già si mostra
  la classifica.

## Test

- Motore: `esitoGirone` (completa solo con 3 set, vincitore per set),
  `computeStandings` in modalità set (ordinamento set → quoziente punti).
- Servizi: `applicaRisultato` gating per fase, `generaFaseFinale` con finalina
  e con girone di consolazione (incluso il caso a 3 squadre), precondizione che
  ignora la consolazione.
- Verifica finale nel browser sul torneo reale E962D8 (7 squadre).

## Fuori scope

- Assegnazione automatica dei giorni (giovedì/venerdì) → Calendario manuale.
- Ordinamento a set applicato al tabellone (resta best-of-3).
