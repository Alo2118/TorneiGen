# TorneiGen — Pubblicazione via login (addio token condiviso)

**Data:** 2026-07-20
**Stato:** approvato, pronto per il piano

## Contesto e problema

Gli endpoint "organizzatore" del Worker (pubblicazione riepilogo/tabellone, lettura ed
eliminazione iscrizioni) sono protetti da un **unico secret condiviso** (`READ_TOKEN`),
verificato via `autorizzato(req, env)`:

```
Authorization: Bearer <READ_TOKEN>  →  m[1] === env.READ_TOKEN
```

Per far pubblicare un altro organizzatore bisognerebbe dargli lo stesso token. Problemi:

- **Chiave unica per tutti**: chi la possiede può gestire *qualsiasi* torneo, non solo il suo.
- **Distribuzione manuale**, non revocabile per singolo utente, facile da perdere/diffondere.
- **Contraddice il sistema account** (login + società multi-tenant) già costruito, che per le
  rotte `/api/org/*` usa la sessione JWT.

## Obiettivo

Un utente **abilitato fa login e pubblica/gestisce i propri tornei**. Nessun token da
distribuire. Il "Token di lettura" sparisce dall'interfaccia.

Ambito d'accesso scelto: **per società** (coerente col cloud sync; protegge i dati personali
dei giocatori — email/telefono nelle iscrizioni — da altri utenti loggati).

## Architettura

### 1. Worker — migrazione a sessione + ownership per codice

Le 5 rotte organizzatore passano da `autorizzato()` (READ_TOKEN) a `sessione()` (JWT).
La proprietà è tracciata in KV con la chiave `owner:<codice> → societaId`, **reclamata alla
prima pubblicazione**.

Nuovo helper (rispecchia la regola già usata da `/api/org`):

```ts
// Consente l'operazione sul torneo `codice` per la sessione data, applicando lo scoping
// per società. Con `claim`, alla prima pubblicazione registra il proprietario.
// Ritorna true se consentito (ed eventualmente reclama), false se vietato.
async function proprietarioConsentito(
  codice: string,
  s: SessioneUtente,
  env: Env,
  opts: { claim?: boolean } = {},
): Promise<boolean> {
  const owner = await env.KV.get(`owner:${codice}`)
  const consentito = s.ruolo === 'admin' || !owner || owner === s.societaId
  if (!consentito) return false
  if (opts.claim && !owner && s.societaId) await env.KV.put(`owner:${codice}`, s.societaId)
  return true
}
```

Regola d'accesso (identica a org): consentito se `ruolo === 'admin'` **oppure** owner assente
(grazia/legacy) **oppure** `owner === sessione.societaId`. Altrimenti **403 `{ error: 'vietato' }`**.
Senza sessione valida: **401 `{ error: 'non autorizzato' }`**.

Mappa delle rotte:

| Rotta | Prima | Dopo |
|---|---|---|
| `POST /api/torneo` (il `codice` è nel body) | token | sessione + `claim: true` |
| `POST /api/pubblico/:codice` | token | sessione + `claim: true` |
| `GET /api/iscrizioni/:codice` | token | sessione + check |
| `DELETE /api/iscrizioni/:codice/:id` | token | sessione + check |
| `DELETE /api/pubblico/:codice` | token | sessione + check |

Nota: `POST /api/torneo` riceve il codice nel corpo (`b.codice`); il claim usa quel valore,
applicato **dopo** la validazione dei campi obbligatori.

Restano **pubbliche** (nessun login), invariate:
- `GET /api/torneo/:codice` — i giocatori/pubblico leggono il riepilogo
- `POST /api/iscrizioni/:codice` — i giocatori inviano l'iscrizione
- `GET /api/pubblico/:codice` — vista pubblica del tabellone

`AUTH_SECRET` è già richiesto dal guard esistente per il prefisso `auth|admin|org`; questa
migrazione **non** aggiunge le rotte `torneo/iscrizioni/pubblico` a quel guard (sono in parte
pubbliche). Le rotte organizzatore falliranno comunque in modo pulito: senza sessione →
`sessione()` ritorna `null` → 401 (nessuna eccezione, perché `verificaJWT` viene invocata solo
se è presente un Bearer; se il Bearer c'è ma `AUTH_SECRET` è vuoto, si otterrebbe la stessa
`DataError`, ma è uno scenario di sola-configurazione già coperto operativamente).

### 2. Client (`registrations-api.ts` + `config.ts` + `pubblicazione.ts`)

- Le 5 chiamate passano da `{ auth: true }` a `{ sessione: true }`:
  `pubblicaRiepilogo`, `elencaIscrizioni`, `eliminaIscrizione`, `pubblicaSnapshot`,
  `rimuoviSnapshot`.
- `pubblicaSeAttivo` (in `pubblicazione.ts`): il gate `if (!getReadToken()) return` diventa
  `if (!getSessione()) return`.
- **Rimozione del plumbing morto del token** (dopo la migrazione non lo usa più nessuno):
  - `config.ts`: rimuovere `getReadToken` / `setReadToken`; `getClient()` non passa più `token`.
  - `registrations-api.ts`: rimuovere il parametro `token` da `creaClient` e il ramo `auth`
    dentro `call()`.
  - Import di `getReadToken` in `pubblicazione.ts`.

### 3. UI

- **SettingsScreen**: rimuovere il campo "Token di lettura" (e il relativo salvataggio). Restano
  URL API e stato sessione.
- **RiepilogoScreen** — sezione "Condivisione pubblica": il pulsante **Pubblica** si abilita
  solo con sessione presente (`getSessione()`); senza login mostra un testo/CTA "Accedi per
  pubblicare" con link a `/accesso`, in analogia con "Carica dal cloud" in HomeScreen. Se il
  torneo è già pubblicato ma l'utente non è loggato, gli altri controlli (Copia link, QR)
  restano visibili; "Interrompi pubblicazione" richiede login.

### 4. Legacy / transizione

- Gli snapshot già pubblicati (es. `DEMO24`, `E962D8`) non hanno chiave `owner:<codice>` →
  **grazia**: la prima pubblicazione autenticata di una società li reclama. La vista pubblica
  (`GET /api/pubblico/:codice`) continua a funzionare senza interruzioni.
- **Nota operativa** (stessa già valida per `/api/org`): i tornei "toccati" solo dall'admin
  (società `null`) restano non reclamati (owner assente) finché una società non li pubblica.
  Irrilevante finché la società è una sola; prima di onboardare una 2ª società, l'admin dovrebbe
  ripubblicare i propri tornei da un account con società, oppure impostare gli `owner:<codice>`.
- `READ_TOKEN` resta un secret del Worker su Cloudflare (non toccato): semplicemente inutilizzato.

## Testing

**Worker (`handler.test.ts`)**
- Aggiornare i test esistenti delle 5 rotte: header `auth` (READ_TOKEN) → header con **token di
  sessione** (helper `authS1/authS2/authOrgAdmin` già presenti).
- Nuovi test scoping per almeno una rotta di lettura e una di scrittura:
  - stessa società → 200/consentito;
  - altra società → 403;
  - admin → consentito anche su codice altrui;
  - claim: `POST /api/torneo` (o `/api/pubblico`) su codice senza owner imposta
    `owner:<codice> = societaId`; una lettura successiva da altra società → 403;
  - legacy (owner assente) → prima operazione consentita per qualsiasi società (grazia).
- Senza sessione → 401 su tutte e 5.

**Client (`registrations-api.test.ts`)**
- Le 5 chiamate inviano l'header `authorization: Bearer <sessione>` (non più il token).
- Rimuovere gli assert legati al ramo `token`/`auth`.

**`config.test.ts`**
- Rimuovere i test di `getReadToken/setReadToken`.

**`pubblicazione`**
- `pubblicaSeAttivo` non chiama la rete se non c'è sessione (gate aggiornato).

## Fuori scope (YAGNI)

- Ownership a livello di singolo utente (basta la società).
- Rimozione del secret `READ_TOKEN` lato Cloudflare.
- Rimozione del plumbing `WRITE_TOKEN` (già morto, ticket separato nel backlog).
- Migrazione retroattiva automatica degli `owner:<codice>` per i tornei esistenti.
