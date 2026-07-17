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
- **Ruoli**: `utente` (vede i suoi tornei) e `admin` (vede tutti). L'admin è determinato dalla email
  (`ADMIN_EMAIL` lato Worker = `nicola.hdr@gmail.com`).
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

- Al login/registrazione il Worker emette un **JWT HS256** firmato con il secret `AUTH_SECRET` (HMAC-SHA256).
  Payload: `{ sub: userId, email, ruolo, exp }`, scadenza **30 giorni**. Encoding base64url, nessuna libreria
  esterna (piccolo encode/verify interno).
- Il client salva il token in `localStorage` e lo invia come `Authorization: Bearer <jwt>`.
- Ogni richiesta protetta verifica **firma + scadenza**; da payload si ricava utente e ruolo.

## C — Ruoli

- Campo `ruolo` sull'utente: `'utente' | 'admin'`.
- Alla **registrazione**, se `email === env.ADMIN_EMAIL` (case-insensitive) → `ruolo = 'admin'`, altrimenti
  `'utente'`. Deterministico, nessuna modifica manuale al DB.

## D — Modello dati (D1)

Nuova tabella (in `worker/schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS utenti (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterazioni    INTEGER NOT NULL,
  ruolo         TEXT NOT NULL DEFAULT 'utente',
  creato_il     TEXT NOT NULL
);
```
`organizzazioni` guadagna una colonna **`owner_id TEXT`** (nullable per i documenti legacy):
```sql
ALTER TABLE organizzazioni ADD COLUMN owner_id TEXT;
```
Email conservata **lowercased**; unicità garantita dal vincolo `UNIQUE`.

## E — Endpoint Worker

Auth (pubblici):
- `POST /api/auth/registrazione` `{email, password}` → valida (email formato, password ≥ 8 char); se email
  già presente → `409`; crea utente (ruolo per `ADMIN_EMAIL`); → `{ token, utente: { email, ruolo } }`.
- `POST /api/auth/accesso` `{email, password}` → verifica; ok → `{ token, utente }`; errore → `401`.
- `GET /api/auth/io` (Bearer) → `{ email, ruolo }` (ripristino sessione all'avvio); token non valido → `401`.

Org (protetti da **sessione utente**, non più da `WRITE_TOKEN`):
- `GET/PUT/DELETE /api/org/:codice` → richiede JWT valido. **Proprietà**: l'utente accede solo ai propri
  documenti (`owner_id === sub`); l'**admin** bypassa (accede a tutti). PUT su documento senza owner
  (legacy) o nuovo → assegna `owner_id = sub` (**claim-on-write**). Accesso a doc di altri (non admin) → `403`.

Nota: le **iscrizioni** e gli **snapshot pubblici** restano com'ora dietro `READ_TOKEN` (fuori scope Fase 1).

## F — Astrazioni e testabilità (Worker)

Come per KV/OrgStore: interfaccia `UserStore { perEmail(email): Promise<UtenteRecord|null>; perId(id):
Promise<UtenteRecord|null>; crea(u: UtenteRecord): Promise<void> }` con adattatore D1 (`worker/src/d1-user-store.ts`)
e `fakeUserStore` in memoria (`worker/src/fake-user-store.ts`) per test/mock. `OrgStore.put`/`get` estesi per
gestire `owner_id`. Helper auth in `worker/src/auth.ts` (hash, verifica, JWT encode/verify, estrazione utente
dal Bearer) — testabili con un `AUTH_SECRET` fisso. `Env` guadagna `AUTH_SECRET`, `ADMIN_EMAIL`, `USERS: UserStore`.

## G — App

- `src/services/config.ts`: al posto di `writeToken`, gestione **sessione**: `getSessione/setSessione/
  clearSessione` (localStorage `sessione`). Resta `readToken` (iscrizioni/snapshot).
- `src/services/auth.ts` (nuovo): `registra(email,password)`, `accedi(email,password)`, `esci()`,
  `utenteCorrente(): Promise<{email,ruolo}|null>` (chiama `/api/auth/io`).
- `src/services/registrations-api.ts`: nuovi metodi `registrazione/accesso/io`; `getOrg/putOrg/deleteOrg`
  inviano `Authorization: Bearer <sessione>` (non più il write token).
- `src/services/orgSync.ts`: `sincronizzabile()` diventa "online **e** sessione presente" (al posto del write
  token). Il resto della sync 8b invariato.
- **UI**: schermata/pannello **Accedi / Registrati** (email + password) e, in Impostazioni, stato
  «Accesso come <email> (ruolo)» + **Esci** (sostituisce il campo "Token di scrittura"). Home «Carica dal
  cloud» resta ma ora richiede la **sessione** (login) invece del write token.
- **Cablaggio URL**: file committato `.env.production` con `VITE_API_BASE_URL=https://torneigen-api.nicola-hdr.workers.dev`
  → `npm run build` bake-a l'URL; l'utente non lo imposta più su alcun dispositivo.

## H — Migrazione

- I documenti org già nel cloud (creati col vecchio token) hanno `owner_id` NULL: al primo **PUT
  autenticato** vengono **reclamati** dal tuo account. In lettura, un documento senza owner è accessibile a un
  utente autenticato (grazia legacy; di fatto i dati esistenti sono tuoi) e l'admin li vede comunque tutti.
- Opzionale: bulk-claim manuale via D1 (`UPDATE organizzazioni SET owner_id = '<id>' WHERE owner_id IS NULL`).

## I — Sicurezza (checklist)

- PBKDF2 salato ad alte iterazioni; confronto a tempo costante; password mai loggate/restituite.
- JWT firmato (HS256) con `AUTH_SECRET` segreto; verifica firma + `exp`; nessun dato sensibile nel payload
  oltre email/ruolo.
- Email validate e lowercased; `password ≥ 8`.
- Endpoint org: sessione obbligatoria + controllo proprietà (admin bypass).
- Fuori scope ma da tenere presente: rate limiting sul login, reset password via email, rotazione token.

## J — Setup una tantum (account utente)

`wrangler d1 execute torneigen-org --file=schema.sql --remote` (crea `utenti` + colonna `owner_id`) ·
`wrangler secret put AUTH_SECRET` · impostare `ADMIN_EMAIL` (var in `wrangler.toml`) · `wrangler deploy`.

## Fuori scope (Fase 1)

- Lista "i miei / tutti i tornei" in Home + navigazione admin di tutti i tornei → **Fase 2**.
- Secondo organizzatore / condivisione di un torneo tra account → **Fase 3**.
- Reset password via email; spostare iscrizioni/snapshot sotto account; rate limiting.
- Sync dei punteggi/risultati nel cloud (l'admin vede solo l'organizzazione).

## Sotto-piani (indicativi)

1. Worker auth core: `auth.ts` (PBKDF2 + JWT) + `UserStore`/`fakeUserStore` + test.
2. Worker endpoint auth (`registrazione/accesso/io`) + `Env`/wiring + test.
3. Worker org endpoint: da `WRITE_TOKEN` a sessione + `owner_id`/proprietà/claim + admin bypass + test.
4. D1: schema (`utenti` + `owner_id`) + adattatore `d1-user-store` + wiring `index.ts` + mock server.
5. Client: `auth.ts` + metodi API + sessione in `config` + `orgSync.sincronizzabile` + test.
6. UI: Accedi/Registrati + stato/Esci in Impostazioni + `.env.production` (URL) + test.
