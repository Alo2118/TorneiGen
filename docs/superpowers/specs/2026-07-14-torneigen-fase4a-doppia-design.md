# TorneiGen — Design Fase 4a: eliminazione doppia (finale singola)

**Data:** 2026-07-14
**Stato:** approvato per implementazione
**Dipende da:** Fase 1 (motore, incl. `generateSingleElimination`) e Fase 2 (UI/`BracketScreen`).

## 1. Obiettivo

Aggiungere il formato **eliminazione doppia** con **finale singola**: ogni squadra viene eliminata
solo dopo due sconfitte. Chi perde nel tabellone vincenti scende nel tabellone perdenti; i due
vincitori si giocano una finale unica.

## 2. Struttura

- **Tabellone vincenti (WB)**: eliminazione singola (riuso `generateSingleElimination`), round 1..R
  con R = log2(size).
- **Tabellone perdenti (LB)**: alterna round di *consolidamento* (sopravvissuti LB tra loro) e round
  di *innesto* (sopravvissuti LB contro i retrocessi del WB), fino a un unico superstite (campione LB).
  Il LB ha `2(R-1)` round.
- **Finale singola**: campione WB vs campione LB, una partita. (Nessun bracket reset — scelta utente.)

Invariante che rende l'LB costruibile: dopo ogni round di consolidamento, il numero di sopravvissuti
LB uguaglia il numero di retrocessi dal round WB successivo, quindi si accoppiano 1:1 nell'innesto.

Schema di retrocessione **deterministico** (il perdente del match WB va in uno slot LB predeterminato),
non ottimizzato per evitare rivincite. Numeri non-potenza-di-2 gestiti con **bye** come nel single-elim.

## 3. Nuovo formato e modello dati

- Aggiungere `eliminazione_doppia` all'union `Formato` in `src/engine/types.ts` (accanto a
  `eliminazione_diretta`). Opzione corrispondente nel Setup.
- Aggiungere al `Match` il campo opzionale `tabelloneTipo?: 'vincenti' | 'perdenti' | 'finale'` per
  distinguere le partite del tabellone doppio (i match single-elim restano senza `tabelloneTipo`).

## 4. Motore (`src/engine/doubleElimination.ts`)

Tipo risultato `DoubleBracketMatch`:
- `id, tabelloneTipo ('vincenti'|'perdenti'|'finale'), round, index, teamAId, teamBId`
- `winnerFeeds: { matchId, slot: 'A'|'B' } | null` — dove va il **vincitore**
- `loserFeeds: { matchId, slot: 'A'|'B' } | null` — dove va il **perdente** (solo per i match WB;
  `null` per LB/finale: il perdente è eliminato)

Funzioni:
- `generateDoubleElimination(teamIds: string[]): DoubleBracketMatch[]` — WB (single-elim) + LB
  (costruzione iterativa consolidamento/innesto) + finale, con tutti i collegamenti winner/loser.
- Propagazione: un `propagaDoppia(matches, regole)` (nel service risultati) che **ricalcola da zero**
  l'intero tabellone dai risultati registrati — così le ri-modifiche di un risultato si propagano
  correttamente. Per ogni match completo: il vincitore va in `winnerFeeds`, il perdente (se WB) in
  `loserFeeds`; la finale determina il campione.

## 5. Persistenza e generazione

- `src/services/generation.ts`: per `formato === 'eliminazione_doppia'` chiamare
  `generateDoubleElimination` (squadre ordinate per `testaDiSerie`) e mappare i `DoubleBracketMatch`
  in record `Match` (`fase: 'tabellone'`, `tabelloneTipo`, `round`, `posizioneTabellone = index`),
  applicando i bye iniziali.
- Il salvataggio risultato (`saveResult`) usa `propagaDoppia` per i tornei a doppia eliminazione
  (rilevata da `formato`/presenza di `tabelloneTipo`), altrimenti la propagazione single-elim esistente.

## 6. UI (`BracketScreen`)

Per i tornei a eliminazione doppia, mostrare tre sezioni distinte:
- **Tabellone vincenti** (match `tabelloneTipo === 'vincenti'`, per round)
- **Tabellone perdenti** (`'perdenti'`, per round)
- **Finale** (`'finale'`)

Riuso di `MatchRow` e del controllo punteggi/`salvaEProppaga` già esistenti. Nessun nuovo hex; token
di stile. La generazione filtra alle sole squadre `confermata` (come per gli altri formati).

## 7. Test

- Motore (TDD, Vitest): per 4 e 8 squadre verificare struttura WB/LB/finale (numero di round e match),
  che il perdente di uno specifico match WB finisca nello slot LB atteso, che la propagazione porti a
  un campione unico, e la corretta ri-propagazione dopo la modifica di un risultato.
- UI: `BracketScreen` mostra le tre sezioni per un torneo a doppia eliminazione.

## 8. Fuori scope 4a

- **Bracket reset** (finale doppia): scelta utente = finale singola.
- Ottimizzazione anti-rivincita dello schema di retrocessione LB.
- King of the Court (è la Fase 4b, disegno successivo).
