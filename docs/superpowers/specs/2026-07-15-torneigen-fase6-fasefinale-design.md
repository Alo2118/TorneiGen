# TorneiGen — Design Fase 6: golden set + gironi→fase finale (diretta/doppia)

**Data:** 2026-07-15
**Stato:** approvato per implementazione
**Dipende da:** Fasi 1–5 (motore, doppia eliminazione, gironi/round robin, UI).

## Obiettivo

1. **Golden set** nella doppia eliminazione: se in finale il tabellone perdenti batte il tabellone
   vincenti, si gioca un **golden set** (un set secco) per il titolo.
2. **Gironi → fase finale**: completare il formato `gironi_eliminazione` con la generazione della
   fase a eliminazione dai qualificati, **diretta o doppia**, scelta in configurazione.

---

## Parte A — Golden set (6a)

**Regola:** finale = campione tabellone **vincenti** (imbattuto) vs campione tabellone **perdenti**
(1 sconfitta). Se vince il **vincenti** → campione. Se vince il **perdenti** → si gioca un **golden
set** (un set unico a punteggio normale, vittoria a 2 di scarto) tra i due → chi vince è campione.

**Modello:**
- `tabelloneTipo` esteso con `'golden'`.
- `generateDoubleElimination` genera, dopo la finale (`gf`), una partita `golden` (id `golden`,
  `tabelloneTipo: 'golden'`, squadre inizialmente vuote).
- `propagaDoppia`: dopo il loop principale, gestisce l'attivazione del golden — se la finale è conclusa
  e la vince lo slot **B** (campione perdenti; il campione vincenti è nello slot **A**), popola il
  golden con i due finalisti; altrimenti lascia il golden vuoto. (Ricalcolo idempotente: azzera prima.)
- **Punteggio golden = best-of-1**: `salvaEProppaga`/`applicaRisultato` valutano la partita `golden`
  con `{ ...regole, setAlMeglioDi: 1 }` (un set), anche se il torneo è al meglio di 3.
- **Campione** (UI): se il golden ha un vincitore → è il campione; altrimenti se la finale è vinta
  dallo slot A (vincenti) → campione; altrimenti (finale vinta dallo slot B, golden da giocare) →
  campione ancora da decidere.

**UI:** `BracketScreen` mostra il **Golden set** (quando attivo) nella sezione finale e calcola il
campione con la logica sopra.

---

## Parte B — Gironi → fase finale (6b)

**Config** (formato `gironi_eliminazione`), campi opzionali sul `Tournament`:
- `faseFinale?: 'diretta' | 'doppia'` (default `'diretta'`)
- `qualificatiPerGirone?: number | 'tutti'` (default `'tutti'`)

**Azione "Genera fase finale"** (`src/services/faseFinale.ts` → `generaFaseFinale(tournamentId)`):
1. Verifica che tutte le partite dei gironi siano concluse (altrimenti errore chiaro).
2. Per ogni girone calcola la classifica (`classificaGirone`).
3. Prende i qualificati con `qualifiedTeams(classifichePerGirone, perGirone)` — se `'tutti'`, usa il
   numero massimo di squadre in un girone come `perGirone` (tutte passano, ordinate per posizione).
4. Genera il tabellone:
   - **diretta** → `generateSingleElimination` (bye alle teste di serie più alte se il numero non è
     potenza di 2).
   - **doppia** → `generateDoubleElimination` (**richiede** un numero di qualificati potenza di 2;
     altrimenti errore chiaro che invita a ridurre i qualificati o usare la diretta).
5. Mappa in `Match` (`fase: 'tabellone'`, `tabelloneTipo` per la doppia) e li **aggiunge** ai match
   del torneo (i match dei gironi restano). Persistenza.

**UI:** un'azione **"Genera fase finale"** (in `BracketScreen`/`Riepilogo`), abilitata quando i gironi
sono conclusi; la vista mostra gironi + classifiche + tabellone finale. La generazione iniziale
(`gironi_eliminazione`) continua a creare solo i gironi; la fase finale è l'azione separata.

---

## Sotto-piani

- **Piano 6a — Golden set**: tipi (`'golden'`), `generateDoubleElimination` (+ golden),
  `propagaDoppia` (attivazione golden), punteggio best-of-1, UI campione/golden.
- **Piano 6b — Gironi→fase finale**: config (faseFinale/qualificatiPerGirone), servizio
  `generaFaseFinale` (classifiche→qualificati→tabellone diretto/doppio), UI "Genera fase finale".

## Fuori scope

- Bracket reset "pieno" (rigioco dell'intera finale): sostituito dal golden set.
- King of the Court (Fase 4b, ancora da fare).
- Ottimizzazione seeding avanzato dei qualificati (usa l'ordine snake di `qualifiedTeams`).
