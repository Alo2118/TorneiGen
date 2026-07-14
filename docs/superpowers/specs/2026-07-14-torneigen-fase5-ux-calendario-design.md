# TorneiGen — Design Fase 5 (locale): rifinitura UX + calendario

**Data:** 2026-07-14
**Stato:** approvato per implementazione
**Contesto:** resta **local-first** (migrazione cloud abbandonata: limite progetti Supabase). Le iscrizioni
online restano sul Cloudflare Worker esistente.

## Obiettivo

Rendere l'app più user-friendly (guida al flusso, chiarezza online, feedback) e aggiungere la
**calendarizzazione** delle partite su più giornate con fasce orarie e campi.

---

## Parte A — Rifinitura UX

### A1. Schermata Riepilogo torneo (hub)
- Rotta `/tornei/:id`, diventa la **landing** aprendo un torneo.
- Mostra: nome, badge tipologia/formato/stato, **conteggi squadre** (confermate / in attesa), stato
  iscrizioni + link pubblico se aperte.
- Riquadro **"Prossimo passo"** con l'azione consigliata secondo lo stato:
  - 0 squadre → *Aggiungi squadre* / *Apri iscrizioni*
  - squadre in attesa → *Conferma N squadre in attesa*
  - abbastanza confermate, nessun tabellone → *Genera il tabellone*
  - tabellone generato → *Programma il calendario* / *Inserisci i risultati*
- Voce nav "Riepilogo" per il torneo attivo.

### A2. Notifiche di conferma (toast)
- Sistema toast leggero (context + componente) con messaggi effimeri (successo/errore).
- Toast dopo le azioni chiave: salvato, generato, importato, iscrizioni aperte/chiuse, conferma.

### A3. Impostazioni più chiare + "Verifica connessione"
- Testo che spiega URL API e token (chiave privata del proprio deploy, si imposta una volta).
- Bottone **"Verifica connessione"**: prova l'API → mostra ✓ *Connesso* / ✗ con causa (URL
  irraggiungibile / token non valido). Verifica: reachability via `getRiepilogo` (una 404 = URL ok),
  validità token via `elencaIscrizioni` (401 = token errato; altrimenti ok).

### A4. Iscrizioni sincronizzate all'apertura
- All'apertura del torneo (Riepilogo), se token configurato e online, **auto-scarica e importa** le
  nuove iscrizioni come squadre **"in attesa"** (dedup via `nuoveIscrizioni`), con toast "N nuove
  iscrizioni". **Auto-import ≠ auto-conferma.**
- Bottone **"Aggiorna"** per sincronizzare a mano; **"Conferma tutte"** rapido per le squadre in attesa.
- Errori chiari (401 → "token non valido: controlla Impostazioni"); se manca il token, avviso con link.

---

## Parte B — Calendario (scheduler)

### B1. Configurazione (nel Setup / sezione dedicata)
Nuovi campi sul `Tournament` (opzionali, retrocompatibili):
- `giornate?: { data: string; inizio: string; fine: string }[]` — giornate con **fascia oraria per
  giornata** (es. `[{data:'2026-09-04',inizio:'19:00',fine:'23:00'}, ...]`)
- `numeroCampi?: number`
- `durataPartitaMin?: number`

### B2. Motore scheduler (`src/engine/scheduler.ts`, puro)
`pianifica(partite, config): partite con orario+campo`.
- Input: match (con `round`, `fase`, `tabelloneTipo`, team), `{ giornate, numeroCampi, durataMin }`.
- Output: ogni match con `orario` (data-ora ISO) + `campo` (numero).
- Vincoli: una **squadra** non gioca due partite in slot sovrapposti; un **campo** non ospita due
  partite insieme; **dipendenze**: nei tabelloni un match di round *r* è pianificato dopo i round
  precedenti (i gironi sono parallelizzabili); riempita la fascia di una giornata → passa alla
  successiva. Euristica greedy (non ottimale): assegna ogni partita al primo slot (campo, orario)
  libero e compatibile. Per i round successivi con squadre TBD, il vincolo squadra si allenta ma
  l'ordine dei round garantisce la sequenza temporale.
- Nota: negli eliminatori gli orari dei round successivi sono **stime** (dipendono dalla durata
  effettiva); pianificazione di partenza, poi si aggiusta.

### B3. Modello dati Match
- Usare `orario?` come **data-ora ISO** (giorno + ora) e `campo?` (numero). Campi già presenti sul
  tipo `Match`.

### B4. Azione "Programma calendario" + vista
- Dopo la generazione del tabellone/gironi: azione **"Programma calendario"** → esegue `pianifica` e
  persiste `orario`/`campo` sui match.
- Vista **Calendario** (`/tornei/:id/calendario`): partite per **giornata**, poi per campo/orario
  (griglia/timeline). Riuso `MatchRow` per l'esito.
- **Spostamento manuale**: modificare `campo`/`orario` di una partita (dialog di modifica); ripianificare
  disponibile ("Rigenera calendario").

---

## Sotto-piani (esecuzione)

- **Piano A** — UX: Riepilogo hub + prossimo passo; sistema toast; Impostazioni + verifica connessione;
  iscrizioni auto-sync + conferma tutte.
- **Piano B** — Calendario: config (giornate/campi/durata); motore `pianifica` (TDD); azione + vista
  calendario; spostamento manuale.

## Fuori scope Fase 5 locale

- Cloud/sync/notifiche push (abbandonato). Le classifiche/punteggi restano locali (com'è).
- Ottimizzazione avanzata dello scheduler (anti-attesa, bilanciamento campi): euristica greedy per ora.
- Drag-and-drop nel calendario: per ora modifica via dialog (drag come miglioria futura).
