# TorneiGen — Design Fase 3: iscrizioni online

**Data:** 2026-07-14
**Stato:** approvato per implementazione
**Dipende da:** Fase 1 (motore + db) e Fase 2 (UI organizzatore), entrambe in main.

## 1. Obiettivo

Permettere l'**auto-iscrizione online** dei partecipanti a un torneo tramite un link pubblico, e
l'**import** delle iscrizioni ricevute nell'app dell'organizzatore (che resta locale/offline per
tutto il resto). Costo zero (piani gratuiti).

## 2. Vincolo fondamentale e scelta

L'app dell'organizzatore gira in locale e non è raggiungibile da internet: per ricevere iscrizioni
da sconosciuti serve **per forza** un endpoint ospitato online che faccia da punto d'incontro
(riceve gli invii, li conserva finché l'organizzatore li scarica). Scelta: una **funzione
serverless minimale** che l'organizzatore possiede.

- **Host funzione:** Cloudflare Workers (gratis).
- **Storage:** Cloudflare KV — ogni iscrizione è un **oggetto JSON** (nessun DB relazionale).
- **App host-agnostica:** l'URL base dell'API è configurabile, così in sviluppo si usa un **mock
  locale** e in produzione il Worker deployato.

## 3. Contratto API (Worker)

Base URL configurabile (es. `https://torneigen.<account>.workers.dev`). CORS abilitato per
l'origine della PWA.

| Rotta | Auth | Descrizione |
|---|---|---|
| `POST /api/torneo` | Bearer token | Pubblica/aggiorna il riepilogo torneo |
| `GET /api/torneo/:codice` | pubblico | Riepilogo per autoconfigurare il form |
| `POST /api/iscrizioni/:codice` | pubblico | Invia un'iscrizione |
| `GET /api/iscrizioni/:codice` | Bearer token | Elenca le iscrizioni del torneo |
| `DELETE /api/iscrizioni/:codice/:id` | Bearer token | (opzionale) rimuove un'iscrizione |

**Auth:** le rotte "organizzatore" richiedono `Authorization: Bearer <TOKEN>` confrontato con un
**secret** del Worker (`READ_TOKEN`). Il pubblico può SOLO inviare iscrizioni e leggere il
riepilogo. **Nessun GET pubblico sui dati personali** delle iscrizioni → privacy protetta.

### Modelli (JSON in KV)
- Riepilogo torneo — chiave `torneo:<codice>`:
  ```json
  { "codice": "ABC123", "nome": "Coppa Estate", "tipologia": "2x2",
    "formato": "eliminazione_diretta", "chiuso": false, "updatedAt": "..." }
  ```
- Iscrizione — chiave `iscr:<codice>:<id>`:
  ```json
  { "id": "uuid", "codice": "ABC123", "nomeSquadra": "Squali",
    "giocatori": [{ "nome": "...", "cognome": "...", "email": "...", "telefono": "..." }],
    "createdAt": "..." }
  ```

**Validazione POST iscrizione (lato Worker):** il `codice` deve esistere (riepilogo presente) e
NON essere `chiuso`; shape minima valida (nome squadra + almeno un giocatore coi 4 campi). Numero
esatto di giocatori validato lato form; il Worker fa solo controlli di forma. Anti-spam avanzato
fuori scope (solo validazione base).

## 4. Flusso utente

1. **Apri iscrizioni** (app, su un torneo): pubblica il riepilogo (`POST /api/torneo`, con token) →
   mostra il **link pubblico** `<pwa-url>/iscrizione/<codice>` e il bottone **Chiudi iscrizioni**
   (ripubblica il riepilogo con `chiuso: true`).
2. **Partecipante**: apre il link → il form si autoconfigura da `GET /api/torneo/:codice` (nome +
   numero giocatori per 2x2/4x4) → compila (squadra + giocatori con nome/cognome/email/telefono) →
   invia (`POST /api/iscrizioni/:codice`) → messaggio di conferma.
3. **Import** (app): **Scarica iscrizioni** (`GET /api/iscrizioni/:codice`, con token) → elenco
   delle iscrizioni ricevute → **dedup** verso squadre già presenti (per nome squadra) → seleziona
   quelle da importare → crea le **squadre** con `origine: 'online'`, `stato: 'in_attesa'`.
4. **Conferma**: nella schermata Squadre l'organizzatore vede le squadre `in_attesa`, le rivede e le
   **conferma** (`stato: 'confermata'`). La generazione del torneo usa **solo** le squadre
   `confermata`.

## 5. Modifiche all'app esistente

- **Impostazioni** (localStorage): `apiBaseUrl` e `readToken`. Una piccola sezione/dialogo per
  inserirli (necessari per pubblicare, scaricare, importare).
- **Client API:** `src/services/registrations-api.ts` — funzioni `getRiepilogo`, `pubblicaRiepilogo`,
  `inviaIscrizione`, `elencaIscrizioni`, `eliminaIscrizione`, verso l'URL base configurabile.
- **Servizio import:** `src/services/import.ts` — mappa un'iscrizione → `Team` (`origine: 'online'`,
  `stato: 'in_attesa'`), con dedup per nome squadra.
- **Rotta pubblica** `src/screens/RegistrationScreen.tsx` (`/iscrizione/:codice`) — layout
  autonomo (senza la shell organizzatore), form autoconfigurato. Riusa la validazione giocatori di
  `src/services/teams.ts`.
- **Schermata import** `src/screens/ImportScreen.tsx` — elenco iscrizioni scaricate, dedup, selezione,
  import.
- **Azioni "Apri/Chiudi iscrizioni"** + link pubblico nell'header o nella schermata Squadre.
- **TeamsScreen (Fase 2):** mostrare lo `stato` (in_attesa/confermata), azione **Conferma**;
  distinguere visivamente le squadre online.
- **BracketScreen/generazione (debito Fase 2):** `generaTorneo` deve ricevere/usare solo le squadre
  `confermata` (filtro `stato === 'confermata'`).

## 6. Worker + mock locale

- `worker/` — codice del Worker (router, auth Bearer, KV binding, CORS) + `wrangler.toml`. Testabile
  in locale con `wrangler dev`/Miniflare.
- **Mock locale per sviluppo/test:** un piccolo server o un modulo che implementa lo stesso
  contratto in memoria, così l'app e il form si sviluppano e si testano senza account Cloudflare.
  I test dell'app usano un fetch mockato o il mock in-process.

## 7. Deploy (passo finale separato, opzionale)

Guidato, solo quando l'utente vuole andare online:
1. Crea account Cloudflare (gratis) → `wrangler deploy` del Worker → imposta il secret `READ_TOKEN`
   e crea il namespace KV.
2. Build della PWA → pubblica su GitHub Pages (o Cloudflare Pages).
3. Inserisci nell'app l'URL API e il token.

Fino ad allora: tutto sviluppato e testato in locale sul mock.

## 8. Fuori scope Fase 3

- Anti-spam/CAPTCHA avanzato (solo validazione base + codice valido/aperto).
- Pagamenti / quote di iscrizione.
- Autenticazione utente (si usa un token di lettura privato, non login).
- Deploy obbligatorio (resta un passo finale opzionale).
- King of the Court ed eliminazione doppia (Fase 4).
