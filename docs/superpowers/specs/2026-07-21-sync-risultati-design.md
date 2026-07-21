# Sincronizzazione dei risultati tra dispositivi — Design

**Data:** 2026-07-21

## Obiettivo

Far viaggiare i **risultati** delle partite tra due dispositivi. Oggi il
documento cloud sincronizza solo la struttura (torneo, squadre, gironi,
tabellone); i punteggi restano locali. Serve che: dispositivo 1 segna una
partita → i risultati vanno nel cloud automaticamente; dispositivo 2 preme
**Aggiorna** → li scarica.

## Approccio (rischio minimo)

Sezione **separata** `risultati` nel documento cloud, senza toccare `struttura`
(retro-compatibile: i documenti senza `risultati` continuano a funzionare come
prima → si tiene il risultato locale).

## Modello dati

`OrgDoc` acquista `risultati?: RisultatoStruct[]` con
`RisultatoStruct = { id, set, vincitoreId?, stato }`. `MatchStruct` invariato.

## Comportamento

1. **buildOrgDoc**: oltre a `struttura`, produce `risultati` per le sole
   partite con un esito (`set.length > 0` o `stato !== 'programmata'`).
2. **applyOrgDoc (merge per-partita)**: per ogni partita della struttura, se il
   cloud ha un risultato (`risultati` per quell'id) lo usa; altrimenti tiene il
   risultato locale. → unione senza perdite. Il caso "stessa partita segnata
   diversa sui due dispositivi" si risolve con "vince l'ultimo che ha inviato"
   (cloud vince in fase di Aggiorna).
3. **Invio automatico**: `salvaEProppaga` chiama `notificaModificaOrg` dopo il
   salvataggio → marca pending + push debounced (meccanismo esistente).
4. **Pulsante "Aggiorna risultati"** nel Calendario: chiama `tiraOrg` e mostra
   un toast con l'esito. La pill di sincronizzazione in alto resta.

La protezione da conflitto esistente resta valida: se ho una modifica locale
non ancora inviata e il cloud è più avanti, `tiraOrg`/`confrontaCloud`
segnalano **conflitto** e non sovrascrivono di nascosto.

## Test

- `orgDoc`: `buildOrgDoc` include `risultati`; `applyOrgDoc` prende il risultato
  dal cloud quando presente, altrimenti tiene il locale (unione).
- `saveResult`: dopo il salvataggio chiama `notificaModificaOrg`.
- I test esistenti (struttura senza punteggi, merge locale con doc senza
  `risultati`) restano verdi.

## Limite noto

Stessa partita segnata contemporaneamente e diversamente sui due dispositivi →
vince l'ultimo invio. Accettabile per il flusso "ognuno segna partite diverse".
