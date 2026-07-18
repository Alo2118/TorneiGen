# TorneiGen — Design Account & Login (Fase 1: fondamenta auth + proprietà)

**Data:** 2026-07-17
**Stato:** in revisione
**Dipende da:** Worker + D1 (Fase 8a), org sync (Fase 8b).

## Contesto e obiettivo

Oggi l'"organizzatore" è chiunque possieda il **token condiviso** (`WRITE_TOKEN`): nessuna identità, e per
usare il cloud su un altro dispositivo bisogna reinserire URL + token. Obiettivo: **account veri** (login),
così **ogni utente ha i propri tornei** e un **amministratore** (l'utente proprietario dell'app) può **vedere
tutti** i tornei. Questo elimina il "giro di token" e abilita il multi-dispositivo/multi-utente.

Decisioni prese in brainstorming:
- Login con **email + password** (no OAuth, no magic link).
- **Nessun reset password self-service** in Fase 1 (manca un servizio email) → reset manuale via D1.
- **Società (organizzazione) = proprietario dei tornei.** I tornei nel cloud appartengono a una **società**;
  tutti gli utenti *abilitati* della stessa società vedono/modificano gli stessi tornei.
- **Ruoli**: `utente` (vede i tornei della sua società) e `admin` (vede tutte le società e tutti i tornei).
  L'admin è determinato dalla email (`ADMIN_EMAIL` lato Worker = `nicola.hdr@gmail.com`).
- **Account abilitati dall'admin**: la registrazione crea un account **disabilitato** (login rifiutato finché
  non abilitato); l'admin li abilita e assegna la società da un **pannello admin** (già in Fase 1). L'account
  admin è abilitato in automatico.
- Admin vede **solo l'organizzazione** (config, squadre, gironi, struttura), **non** i punteggi live (lo
  svolgimento resta locale — nessuna sync dei risultati in questa fase).
- **Local-first intatto**: senza login l'app funziona tutta in locale come oggi; il login abilita solo il
  cloud/multi-dispositivo.

Vincoli: TypeScript strict; copy italiano; sicurezza (password hashate, sessioni firmate, HTTPS). NB
ambiente: check tipi reale con `npx tsc -b` (root `tsc --noEmit` è no-op); worker test con vitest.

## A — Autenticazione e password

- Password **mai in chiaro**: hash **PBKDF2-HMAC-SHA256**, **salt** casuale per-utente (16 byte), **~150000
  iterazioni**, chiave derivata 32 byte. Salvati: `salt` (base64), `password_hash` (base64 della chiave
  derivata), `iterazioni`. Verifica con confronto **a tempo costante** (accumulo XOR su byte di egual
  lunghezza — niente short-circuit).
- Implementazione via **Web Crypto** (`crypto.subtle.deriveBits`), disponibile nel Worker e nei test.

## B — Sessione (JWT)

- Al login (solo se abilitato) il Worker emette un **JWT HS256** firmato con il secret `AUTH_SECRET`
  (HMAC-SHA256). Payload: `{ sub: userId, email, ruolo, societaId, exp }`, scadenza **30 giorni**. Encoding
  base64url, nessuna libreria esterna (piccolo encode/verify interno).
- Il client salva il token in `localStorage` e lo invia come `Authorization: Bearer <jwt>`.
- Ogni richiesta protetta verifica **firma + scadenza**; da payload si ricava utente e ruolo.

## C — Ruoli, società, abilitazione

- Campo `ruolo` sull'utente: `'utente' | 'admin'`.
- Alla **registrazione**, se `email === env.ADMIN_EMAIL` (case-insensitive) → `ruolo = 'admin'` **e
  `abilitato = true`** (admin sempre attivo); altrimenti `'utente'` e **`abilitato = false`**.
- Campo `abilitato` (bool): il **login è rifiutato** (`403`) finché è false. L'admin lo abilita dal pannello.
- Ogni utente ha una **`societa_id`** (a quale società appartiene). In registrazione l'utente indica un
  **nome società richiesto** (`societa_richiesta`, testo libero) come suggerimento; la `societa_id` effettiva
  viene **assegnata dall'admin** in fase di abilitazione (società esistente o nuova).

## D — Modello dati (D1)

Nuove tabelle (in `worker/schema.sql`). *NB:* la tabella esistente `organizzazioni` contiene i **documenti-
torneo** (Fase 8a); la nuova entità "organizzazione = società/club" si chiama **`societa`** per evitare
collisioni di nome.
```sql
CREATE TABLE IF NOT EXISTS societa (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  creato_il TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS utenti (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  salt              TEXT NOT NULL,
  iterazioni        INTEGER NOT NULL,
  ruolo             TEXT NOT NULL DEFAULT 'utente',
  abilitato         INTEGER NOT NULL DEFAULT 0,
  societa_id        TEXT,
  societa_richiesta TEXT,
  creato_il         TEXT NOT NULL
);
```
`organizzazioni` (documenti-torneo) guadagna una colonna **`societa_id TEXT`** (nullable per i documenti
legacy) = la società proprietaria del torneo:
```sql
ALTER TABLE organizzazioni ADD COLUMN societa_id TEXT;
```
Email conservata **lowercased**; unicità garantita dal vincolo `UNIQUE`.

## E — Endpoint Worker

Auth (pubblici):
- `POST /api/auth/registrazione` `{email, password, societa}` → valida (email formato, password ≥ 8 char);
  email già presente → `409`; crea utente **disabilitato** (`ruolo/abilitato` per `ADMIN_EMAIL`;
  `societa_richiesta = societa`); → `{ stato: 'in_attesa' }` (oppure `{ token, utente }` se admin auto-abilitato).
- `POST /api/auth/accesso` `{email, password}` → verifica; **se `!abilitato` → `403 { errore: 'in_attesa' }`**;
  ok → `{ token, utente: { email, ruolo, societaId } }`; credenziali errate → `401`.
- `GET /api/auth/io` (Bearer) → `{ email, ruolo, societaId }` (ripristino sessione); token non valido → `401`.

Admin (Bearer, **solo ruolo admin**, altrimenti `403`):
- `GET /api/admin/utenti` → elenco utenti `{ id, email, ruolo, abilitato, societaId, societaRichiesta }`.
- `GET /api/admin/societa` → elenco società `{ id, nome }`; `POST /api/admin/societa {nome}` → crea società.
- `POST /api/admin/utenti/:id/abilita` `{ societaId }` (o `{ nuovaSocieta: nome }`) → imposta `abilitato = 1`
  e `societa_id`; opzionale `abilitato:false` per disabilitare.

Org (protetti da **sessione utente**, non più da `WRITE_TOKEN`):
- `GET/PUT/DELETE /api/org/:codice` → richiede JWT valido. **Proprietà per società**: l'utente accede solo ai
  documenti della **propria società** (`doc.societa_id === token.societaId`); l'**admin** bypassa (tutti). PUT
  su documento senza società (legacy) o nuovo → assegna `societa_id = token.societaId` (**claim-on-write**).
  Accesso a doc di un'altra società (non admin) → `403`. Utente senza società assegnata → `403`.

Nota: le **iscrizioni** e gli **snapshot pubblici** restano com'ora dietro `READ_TOKEN` (fuori scope Fase 1).

## F — Astrazioni e testabilità (Worker)

Come per KV/OrgStore: interfacce astratte con adattatore D1 + fake in memoria per test/mock.
- `UserStore { perEmail(email): Promise<UtenteRecord|null>; perId(id): Promise<UtenteRecord|null>;
  crea(u): Promise<void>; abilita(id, societaId, abilitato): Promise<void>; elenco(): Promise<UtenteRecord[]> }`
  (`worker/src/d1-user-store.ts`, `fake-user-store.ts`).
- `SocietaStore { elenco(): Promise<SocietaRecord[]>; crea(s): Promise<void>; perId(id): Promise<SocietaRecord|null> }`
  (`worker/src/d1-societa-store.ts`, `fake-societa-store.ts`).
- `OrgStore.put`/`get` estesi per gestire `societa_id`.
Helper auth in `worker/src/auth.ts` (hash, verifica, JWT encode/verify, estrazione utente dal Bearer) —
testabili con un `AUTH_SECRET` fisso. `Env` guadagna `AUTH_SECRET`, `ADMIN_EMAIL`, `USERS: UserStore`,
`SOCIETA: SocietaStore`.

## G — App

- `src/services/config.ts`: al posto di `writeToken`, gestione **sessione**: `getSessione/setSessione/
  clearSessione` (localStorage `sessione`). Resta `readToken` (iscrizioni/snapshot).
- `src/services/auth.ts` (nuovo): `registra(email,password,societa)`, `accedi(email,password)`, `esci()`,
  `utenteCorrente(): Promise<{email,ruolo,societaId}|null>` (chiama `/api/auth/io`).
- `src/services/registrations-api.ts`: nuovi metodi `registrazione/accesso/io` + admin (`elencoUtenti`,
  `elencoSocieta`, `creaSocieta`, `abilitaUtente`); `getOrg/putOrg/deleteOrg` inviano
  `Authorization: Bearer <sessione>` (non più il write token).
- `src/services/orgSync.ts`: `sincronizzabile()` diventa "online **e** sessione presente" (al posto del write
  token). Il resto della sync 8b invariato.
- **UI**:
  - **Accedi / Registrati** (email + password; in registrazione anche il nome società richiesto) e, in
    Impostazioni, stato «Accesso come <email> (ruolo · società)» + **Esci** (sostituisce il campo "Token di
    scrittura"). Home «Carica dal cloud» ora richiede la **sessione** (login).
  - **Pannello admin** (solo ruolo admin, es. rotta `/admin`): elenco utenti in attesa/attivi con **Abilita**
    + assegnazione società (scegli esistente o crea nuova). *(La navigazione admin di "tutti i tornei" resta
    Fase 2.)*
- **Cablaggio URL**: file committato `.env.production` con `VITE_API_BASE_URL=https://torneigen-api.nicola-hdr.workers.dev`
  → `npm run build` bake-a l'URL; l'utente non lo imposta più su alcun dispositivo.

## H — Migrazione

- I documenti org già nel cloud (creati col vecchio token) hanno `societa_id` NULL: al primo **PUT
  autenticato** vengono **reclamati** dalla società dell'utente. In lettura, un documento senza società è
  accessibile a un utente autenticato (grazia legacy; di fatto i dati esistenti sono tuoi) e l'admin li vede
  comunque tutti.
- Opzionale: bulk-claim manuale via D1 (`UPDATE organizzazioni SET societa_id = '<id>' WHERE societa_id IS NULL`).

## I — Sicurezza (checklist)

- PBKDF2 salato ad alte iterazioni; confronto a tempo costante; password mai loggate/restituite.
- JWT firmato (HS256) con `AUTH_SECRET` segreto; verifica firma + `exp`; nessun dato sensibile nel payload
  oltre email/ruolo.
- Email validate e lowercased; `password ≥ 8`.
- **Account disabilitati non possono accedere** (login → `403` finché non abilitati dall'admin).
- Endpoint **admin** dietro guardia `ruolo === 'admin'` (altrimenti `403`), oltre alla sessione valida.
- Endpoint org: sessione obbligatoria + controllo proprietà **per società** (admin bypass); utente senza
  società → `403`.
- Fuori scope ma da tenere presente: rate limiting sul login, reset password via email, rotazione token.

## J — Setup una tantum (account utente)

`wrangler d1 execute torneigen-org --file=schema.sql --remote` (crea `societa`, `utenti` + colonna
`societa_id` su `organizzazioni`) · `wrangler secret put AUTH_SECRET` · impostare `ADMIN_EMAIL` (var in
`wrangler.toml`) · `wrangler deploy`.

## Fuori scope (Fase 1)

- Lista "i miei tornei" in Home + navigazione admin di **tutti i tornei** → **Fase 2** (il pannello admin di
  Fase 1 gestisce solo utenti/società, non la sfoglia dei tornei).
- Secondo organizzatore **fuori dalla società** / condivisione puntuale di un torneo tra società diverse → **Fase 3**.
- Reset password via email; spostare iscrizioni/snapshot sotto account; rate limiting sul login.
- Sync dei punteggi/risultati nel cloud (l'admin vede solo l'organizzazione).

## Sotto-piani (indicativi)

1. Worker auth core: `auth.ts` (PBKDF2 + JWT encode/verify + estrazione utente) + test.
2. Worker `UserStore`/`SocietaStore` + fake in memoria + test.
3. Worker endpoint auth (`registrazione` disabilitato / `accesso` con gate abilitato / `io`) + wiring `Env` + test.
4. Worker endpoint admin (`utenti`, `societa`, `abilita`, guardia ruolo admin) + test.
5. Worker org endpoint: da `WRITE_TOKEN` a sessione + `societa_id`/proprietà per-società/claim + admin bypass + test.
6. D1: schema (`societa`, `utenti`, `societa_id`) + adattatori D1 (`d1-user-store`, `d1-societa-store`) + wiring `index.ts` + mock server.
7. Client: `auth.ts` + metodi API (auth + admin) + sessione in `config` + `orgSync.sincronizzabile` + test.
8. UI: Accedi/Registrati + stato/Esci in Impostazioni + `.env.production` (URL) + test.
9. UI pannello admin (`/admin`): elenco utenti + Abilita + assegna/crea società + test.
