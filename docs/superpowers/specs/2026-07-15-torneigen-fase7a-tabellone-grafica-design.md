# TorneiGen — Design Fase 7a: grafica di gironi e tabellone (albero SVG)

**Data:** 2026-07-15
**Stato:** approvato per implementazione
**Dipende da:** Fasi 1–6 (motore, doppia eliminazione + golden set, gironi→fase finale, UI).

## Contesto e obiettivo

Oggi gironi e tabellone sono resi come **liste impilate** (righe partita raggruppate per
girone o per "Turno N"). Manca l'**albero del tabellone** con colonne per round e linee di
collegamento — l'aspetto che caratterizza i tornei professionali. Nel mondo reale
l'organizzatore stampa fogli **A3** e li compila a mano.

Obiettivo di questa fase (**Fase 7a**): rifare la **grafica** di gironi e tabellone in stile
"foglio da torneo", con un componente riutilizzabile. È la base grafica anche per la **Fase 7b**
(pubblicazione di una vista pubblica in sola lettura, accessibile ai giocatori via link col
codice torneo) — che è **fuori scope qui**.

Vincoli di progetto: TypeScript strict; motore puro; servizi come ponte; UI chiama i servizi;
**solo design token** (`src/styles/tokens.css`). Nessuna modifica a motore/servizi: il modello
dati basta già (`round`, `posizioneTabellone`, `tabelloneTipo`, `vincitoreVerso`/`perdenteVerso`).

---

## A — Architettura del componente

Un unico componente `<BracketTree>` che disegna l'albero, **ibrido SVG + HTML**:

- **SVG** disegna la **geometria**: le linee di collegamento tra i turni e il layer di
  **zoom/pan** (un `<g>` con `transform`). Qui stanno i connettori vettoriali perfetti.
- I **box-partita** sono **HTML dentro `<foreignObject>`**, posizionati sull'albero. Restano
  quindi veri elementi HTML: **cliccabili** (aprono il modale punteggio nell'app), **accessibili**
  (focus, `aria-label`), col testo selezionabile. Nessun testo "disegnato".

In sintesi: **linee SVG + scatole HTML** → aspetto professionale con connettori vettoriali e
zoom, senza perdere interazione né accessibilità.

### Confini (unità isolate e testabili)

- **`layoutBracket(matches) → { nodi, segmenti, campione }`** — funzione **pura**, niente DOM.
  Calcola le posizioni dei box (`x = round`, `y = slot`), i **segmenti** di collegamento
  (`tipo: 'avanza' | 'discesa'`), la gestione dei **bye** e delle **bande** della doppia
  eliminazione, e l'id del **campione**. È l'unità con la logica; testabile a fondo senza browser.
  - `nodi`: `{ matchId, x, y, w, h, tabelloneTipo }[]`
  - `segmenti`: `{ fromMatchId, toMatchId, tipo }[]` (coordinate ricavate dai nodi)
  - `campione`: `string | null`
- **`<BracketTree matches variant onMatchClick?>`** — rendering SVG (linee + zoom/pan) con i box
  in `<foreignObject>`. `variant: 'interattivo' | 'statico'`.
- **`<MatchBox>`** — box HTML: righe squadra, punteggi set-per-set, **vincitore in evidenza**
  (grassetto + accent), numero di **seed**, placeholder "Da definire", 🏆 sul box finale campione.
- **`<GironeStandings>`** — tabella classifica di un girone con **zona qualificazione** (vedi C).
- **`campioneTorneo(matches) → string | null`** — helper **puro** unico per il campione
  (golden vincitore → altrimenti finale vinta dallo slot A → altrimenti nessuno). Sostituisce il
  calcolo divergente/errato oggi presente in `StandingsScreen`.

Collocazione file (esplicita):
- `src/engine/bracketLayout.ts` → `layoutBracket` + `campioneTorneo` (pure, nessuna dipendenza DOM),
  con i relativi `*.test.ts`.
- `src/components/BracketTree.tsx`, `src/components/MatchBox.tsx`, `src/components/GironeStandings.tsx`.
- Modifiche a `src/screens/BracketScreen.tsx` e `src/screens/StandingsScreen.tsx`.
- Nuovo CSS nello stylesheet esistente (solo token).

Motore (logica di torneo) e servizi **non cambiano comportamento**: le uniche aggiunte al motore
sono funzioni **pure di presentazione** (layout/campione). Nessuna modifica a generazione,
propagazione o persistenza.

---

## B — Layout, bye, zoom/pan

### Eliminazione diretta
Albero classico: una **colonna per turno** da sinistra a destra, finale a destra. I **bye**
(round 1 con uno slot vuoto perché il numero non è potenza di 2) si mostrano come squadra che
"passa" al turno successivo con un **box-bye sottile**, invece di una riga vuota.

### Doppia eliminazione — due bande impilate
- Banda **alta** = *Tabellone vincenti* (scorre →).
- Banda **bassa** = *Tabellone perdenti* (scorre →).
- A destra il box **Finale**; sotto, il box **Golden set** (mostrato **solo quando attivo**).

Connettori:
- **Avanzamento** (chi vince sale al turno dopo): linee **piene** dentro ogni banda.
- **Campioni → Finale**: linea piena dal campione vincenti allo slot **A**, dal campione perdenti
  allo slot **B**.
- **Discese** dei perdenti dal tabellone vincenti a quello perdenti: linee **tratteggiate
  sottili** con una piccola **etichetta** ("dal vincenti") sul box d'ingresso, invece di lunghe
  linee che attraversano tutto. Mantiene la leggibilità anche su schermo piccolo.

### Zoom / pan / telefono
- **Desktop:** l'albero si **adatta alla larghezza** di default; controlli **+ / −** e pulsante
  **"Adatta"**; **trascinamento** per spostarsi.
- **Telefono:** default a **zoom leggibile** (box a dimensione utile); **trascinamento** per
  navigare; **pinch-to-zoom**; **doppio tap** su una partita per ingrandirla; pulsante **"Adatta"**
  per vedere tutto l'albero.

---

## C — Redesign dei gironi

Per i gironi il riferimento è **classifica curata + zona qualificazione** (non l'albero):

- **Tabella classifica** per girone: **posizione** (1, 2, 3…), squadra, **G** (giocate), **V–P**
  (vinte–perse), **quoziente set**, **quoziente punti**. Le prime *N* righe (in base a
  `qualificatiPerGirone`; se `'tutti'`, tutte) sono tinte con l'accent, con una **linea di taglio**
  sottile che separa qualificate ed eliminate.
- Sotto ogni girone, la **lista delle partite** del girone con punteggi set-per-set e vincitore in
  evidenza, **riusando lo stile-box** del tabellone per coerenza.
- **Rimandata (YAGNI):** la **griglia scontri** incrociata tutti-contro-tutti.

---

## D — Consolidamento, interazione, test

### Consolidamento (rimuove la duplicazione)
Oggi il tabellone è reso in due modi divergenti (BracketScreen + lista "Avanzamento tabellone" in
StandingsScreen). Con un solo componente:
- **BracketScreen** = tabellone **interattivo** (`<BracketTree variant="interattivo">`; click sul
  box → modale punteggio esistente). Mantiene Genera / Rigenera / Genera fase finale.
- **StandingsScreen** = **gironi** (sezione C) e, se esiste un tabellone, lo **stesso
  `<BracketTree variant="statico">`** in sola lettura. Una sola resa, niente lista divergente.
- Il **campione** viene da `campioneTorneo(matches)` (helper unico), usato anche per la 🏆.

### Interazione
- Variante **interattivo**: click su un box con entrambe le squadre → apre `ScoreControl`
  (modale esistente, invariato). Box senza entrambe le squadre ("Da definire") non cliccabili.
- Variante **statico**: nessun click (per la futura vista pubblica), stessa resa.
- Vincitore evidenziato (grassetto + accent); box campione con 🏆.

### Stile e accessibilità
- **Solo design token** esistenti; nessun nuovo colore hardcoded.
- Box HTML **accessibili**: focus da tastiera, `aria-label` tipo "Rossi 21, Bianchi 15, vince Rossi".

### Test
- **Unit test su `layoutBracket`** e `campioneTorneo` (posizioni, segmenti, bye, bande della
  doppia, campione): puri e affidabili — evitano la fragilità nota di vitest+DOM su WSL.
- Test componente **minimi** (render di N box, classe vincitore, click handler, zona
  qualificazione).
- **Verifica visiva** con il flusso screenshot headless (chromium via CDP) già usato per la
  simulazione, iniettando un torneo di esempio in IndexedDB.

---

## Fuori scope (Fase 7a)

- **Fase 7b**: pubblicazione della vista pubblica in sola lettura + link col codice torneo
  (backend Worker/KV + rotta pubblica). Progetto separato, spec propria.
- Export **PDF/immagine** del tabellone.
- **Griglia scontri** incrociata dei gironi.
- **King of the Court** (Fase 4b, ancora da fare).

## Sotto-piani (indicativi)

1. **Layout puro**: `layoutBracket` + `campioneTorneo` con test (diretta, doppia, bye, golden).
2. **BracketTree + MatchBox**: rendering SVG ibrido, zoom/pan, varianti, integrazione modale in
   BracketScreen.
3. **Gironi**: `<GironeStandings>` con zona qualificazione; StandingsScreen usa BracketTree statico;
   rimozione della lista divergente.
