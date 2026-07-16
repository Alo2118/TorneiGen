# TorneiGen — Design Fase 8a: store cloud dell'organizzazione (fondamenta multi-organizzatore)

**Data:** 2026-07-16
**Stato:** approvato per implementazione
**Dipende da:** Worker + iscrizioni/snapshot (Fasi 3, 7b).

## Contesto e obiettivo

Obiettivo di lungo periodo (MVP multi-organizzatore): i dati di **organizzazione** del torneo (config,
squadre, struttura) vivono nel **cloud** come fonte di verità, modificabili da più dispositivi; lo
**svolgimento** (partite, punteggi) resta locale. La Fase 8a costruisce solo le **fondamenta**: uno
store cloud versionato per un "documento di organizzazione" per torneo, con accesso in scrittura.

**Confine della 8a:** solo backend + client, **nessuna modifica alla UI o alla logica dell'app**. Il
documento è un **blob JSON opaco** (il Worker non ne conosce la struttura); *cosa* ci finisca dentro e
la sync col locale sono la Fase 8b.

Scelte già fatte: MVP pragmatico **last-write-wins** con guardia di versione (niente CRDT/co-editing
robusto); backend **D1** (SQLite di Cloudflare, free tier, letture consistenti dopo scrittura).

Vincoli: TypeScript strict; copy italiano; il documento è privato (contiene dati organizzatore/
contatti) → tutti gli endpoint dietro un **`WRITE_TOKEN`** separato dal `READ_TOKEN` pubblico.

## A — Modello e concorrenza

Documento per torneo, chiave = `codice` (il `codiceIscrizione` del torneo). Campi: `doc` (stringa
JSON opaca), `version` (intero), `updatedAt` (ISO string).

**Concorrenza ottimistica (last-write-wins con guardia):**
- La scrittura porta la **versione attesa**.
- Nessuna riga e `version === 0` → inserisce con `version 1`.
- Riga esistente e `version === version_corrente` → aggiorna, `version + 1`.
- Altrimenti → **409 Conflitto** con la versione attuale nel body (il client si ri-sincronizzerà in 8b).

## B — D1 e schema

`worker/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS organizzazioni (
  codice    TEXT PRIMARY KEY,
  doc       TEXT NOT NULL,
  version   INTEGER NOT NULL,
  updatedAt TEXT NOT NULL
);
```
Binding D1 `DB` in `worker/wrangler.toml`. Applicazione schema con
`wrangler d1 execute torneigen-org --file=worker/schema.sql --remote`.

## C — Endpoint Worker (tutti dietro `WRITE_TOKEN`)

- `GET /api/org/:codice` → `200 {codice, doc, version, updatedAt}` | `404`.
- `PUT /api/org/:codice`, body `{doc: string, version: number}` → `200 {version}` | `409 {error, version}`
  | `400` (body non valido) | `401`.
- `DELETE /api/org/:codice` → `200 {ok:true}` | `401` (serve anche per la futura integrazione con
  "elimina torneo").
- Auth: helper `autorizzatoScrittura(req, env)` = `Bearer <env.WRITE_TOKEN>`; 401 senza. Il `READ_TOKEN`
  pubblico NON dà accesso a questi endpoint.

## D — Testabilità (astrazione `OrgStore`)

Come per il KV (handler puro + `fakeKV`): l'handler usa un'interfaccia minima
`OrgStore { get(codice): Promise<OrgRow|null>; put(row: OrgRow): Promise<void>; delete(codice): Promise<void> }`
dove `OrgRow = {codice, doc, version, updatedAt}`. In `worker/src/index.ts` un adattatore la collega a
**D1** (`env.DB.prepare(...).bind(...)`); nei test e nel mock un `fakeOrgStore` in memoria
(`worker/src/fake-org-store.ts`). Così l'handler resta testabile senza D1 reale.

`Env` guadagna `WRITE_TOKEN: string` e (per l'adattatore reale) il binding `DB`; l'handler riceve
`OrgStore` via `env` (es. `env.ORG`) per restare puro/testabile.

## E — Client app

`src/services/registrations-api.ts` (estende `creaClient`): `getOrg(codice)`, `putOrg(codice, doc, version)`,
`deleteOrg(codice)`, che inviano `Authorization: Bearer <writeToken>`. `putOrg` ritorna `{version}` in
caso di successo e distingue il **409** (con la versione attuale) per la futura ri-sincronizzazione.
`src/services/config.ts`: `getWriteToken()/setWriteToken()` (localStorage `writeToken`). **Nessun campo
UI** in questa fase.

## F — Setup una tantum (account Cloudflare dell'utente)

1. `wrangler d1 create torneigen-org` → `database_id`.
2. binding `[[d1_databases]]` (binding `DB`, `database_id`) in `worker/wrangler.toml`.
3. `wrangler d1 execute torneigen-org --file=worker/schema.sql --remote`.
4. `wrangler secret put WRITE_TOKEN`.
Il mock (`worker/mock-server.mjs`) usa `fakeOrgStore` → sviluppo/CI senza D1.

## G — Test

- **Worker** (`worker/src/handler.test.ts`, con `fakeOrgStore`): GET 404 e 200; PUT nuovo (v0→v1); PUT
  con versione combaciante (→ v+1); PUT con versione **stale** → 409 con versione attuale; PUT body non
  valido → 400; DELETE → 200 e riga rimossa; ogni endpoint senza `WRITE_TOKEN` → 401.
- **Client** (`src/services/registrations-api.test.ts`): `getOrg/putOrg/deleteOrg` usano verbo/path/auth
  corretti (write token), e `putOrg` propaga il 409 con la versione.

## Fuori scope (8a)

- Cosa contiene il `doc` e la **sync** col locale (Fase 8b).
- Campo UI per il `WRITE_TOKEN` (8b, quando serve).
- Modifica dell'app/UX, "carica torneo dal cloud", secondo organizzatore (8b–8d).
- Migrazione dei tornei locali esistenti (8b+).

## Sotto-piani (indicativi)

1. Worker: `OrgStore` + `fakeOrgStore` + endpoint `/api/org/:codice` (GET/PUT/DELETE, versione, auth) + test.
2. D1: schema.sql + binding wrangler + adattatore D1 in index.ts + mock con fakeOrgStore.
3. Client app: `getOrg/putOrg/deleteOrg` + `getWriteToken/setWriteToken` + test.
