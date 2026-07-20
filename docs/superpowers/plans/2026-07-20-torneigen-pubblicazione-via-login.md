# Pubblicazione via login (addio token condiviso) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il token condiviso (`READ_TOKEN`) con la sessione JWT per le rotte organizzatore, con scoping per società, così un utente abilitato pubblica facendo login senza distribuire alcun token.

**Architecture:** Sul Worker le 5 rotte organizzatore passano da `autorizzato()` a `sessione()` + un guard `proprietarioConsentito()` che traccia la proprietà per codice torneo in KV (`owner:<codice> → societaId`), reclamata alla prima pubblicazione. Sul client le stesse chiamate passano dall'header token all'header di sessione; si rimuove tutto il plumbing morto del `READ_TOKEN` (config, campo Impostazioni). La UI abilita "Pubblica" solo con login.

**Tech Stack:** Cloudflare Worker (TypeScript, `handle(req, env)` puro), Cloudflare KV, Vitest, React 18 + TypeScript, Dexie.

## Global Constraints

- Worker: nessuna dipendenza esterna; solo Web Crypto/KV già in uso.
- Test Worker: `npm test -- worker/src/<file>.test.ts` (mirato, affidabile su WSL).
- Typecheck Worker: `npx tsc -p worker/tsconfig.json` (exit 0).
- Typecheck app REALE: `npx tsc -b` (la `npx tsc --noEmit` a root è un NO-OP).
- Test app mirati: `npm test -- src/<file>.test.ts` (il `npm test` completo è flaky su WSL).
- Messaggi d'errore Worker in italiano, coerenti con l'esistente: `non autorizzato` (401), `vietato` (403), `dati incompleti` (400).
- Commit message: chiudere con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ambito d'accesso: **per società**. Consentito se `ruolo === 'admin'` **oppure** owner assente (grazia) **oppure** `owner === sessione.societaId`.
- Rotte pubbliche invariate (nessun login): `GET /api/torneo/:codice`, `POST /api/iscrizioni/:codice`, `GET /api/pubblico/:codice`.

---

### Task 1: Worker — guard `proprietarioConsentito` + migrazione delle 5 rotte a sessione

**Files:**
- Modify: `worker/src/handler.ts` (helper nuovo; rimozione `autorizzato` e `READ_TOKEN` da `Env`; 5 rotte)
- Modify: `worker/src/index.ts` (rimozione `READ_TOKEN` da `CfEnv` e dal binding)
- Test: `worker/src/handler.test.ts`

**Interfaces:**
- Consumes: `sessione(req, env): Promise<SessioneUtente | null>` (già in `handler.ts`), `SessioneUtente { sub, email, ruolo, societaId, exp }`, `env.KV` con `get/put`.
- Produces: `proprietarioConsentito(codice: string, s: SessioneUtente, env: Env, opts?: { claim?: boolean }): Promise<boolean>` — usato solo internamente a `handler.ts`. Chiave KV `owner:<codice>` con valore `societaId` (string).

- [ ] **Step 1: Scrivere i test che falliscono (scoping per società + rimozione token)**

In `worker/src/handler.test.ts`, subito dopo la riga `const auth = { authorization: ... }` (~riga 32), aggiungere gli helper di sessione riutilizzabili in tutto il file:

```ts
const tokenSoc = (societaId: string) =>
  creaJWT({ sub: `u-${societaId}`, email: `${societaId}@x.it`, ruolo: 'utente', societaId }, AUTH_SECRET)
const authSoc = async (societaId = 's1') => ({ authorization: `Bearer ${await tokenSoc(societaId)}` })
const authAdminSess = async () => ({
  authorization: `Bearer ${await creaJWT({ sub: 'a', email: ADMIN_EMAIL, ruolo: 'admin', societaId: null }, AUTH_SECRET)}`,
})
```

Poi, **dentro** il `describe('handle', ...)`, aggiungere un nuovo blocco (ad es. prima di `describe('auth', ...)`):

```ts
describe('pubblicazione via sessione (scoping società)', () => {
  it('POST /api/torneo senza sessione -> 401', async () => {
    const r = await handle(req('POST', '/api/torneo', { body: { codice: 'ABC', nome: 'C', tipologia: '2x2' } }), env())
    expect(r.status).toBe(401)
  })

  it('POST /api/torneo con sessione pubblica e reclama owner per la società', async () => {
    const e = env()
    const r = await handle(req('POST', '/api/torneo', { headers: await authSoc('s1'), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana' } }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('owner:ABC')).toBe('s1')
  })

  it('GET iscrizioni della propria società -> 200', async () => {
    const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s1') }), e)
    expect(r.status).toBe(200)
  })

  it('GET iscrizioni di un torneo di un\'altra società -> 403', async () => {
    const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s2') }), e)
    expect(r.status).toBe(403)
  })

  it('GET iscrizioni come admin -> 200 anche per società altrui', async () => {
    const e = env({ 'owner:ABC': 's1', 'torneo:ABC': riepilogo() })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authAdminSess() }), e)
    expect(r.status).toBe(200)
  })

  it('torneo legacy senza owner: prima operazione consentita (grazia)', async () => {
    const e = env({ 'torneo:ABC': riepilogo() })
    const r = await handle(req('GET', '/api/iscrizioni/ABC', { headers: await authSoc('s2') }), e)
    expect(r.status).toBe(200)
  })

  it('POST /api/pubblico reclama owner; poi altra società -> 403', async () => {
    const e = env()
    const rPub = await handle(req('POST', '/api/pubblico/ABC', { headers: await authSoc('s1'), body: { codice: 'ABC', nome: 'Coppa', tipologia: '2x2', regolePunteggio: {}, teams: [], groups: [], matches: [] } }), e)
    expect(rPub.status).toBe(200)
    expect(await e.KV.get('owner:ABC')).toBe('s1')
    const rAltra = await handle(req('DELETE', '/api/pubblico/ABC', { headers: await authSoc('s2') }), e)
    expect(rAltra.status).toBe(403)
    expect(await e.KV.get('pubblico:ABC')).not.toBeNull()
  })

  it('DELETE iscrizione della propria società -> 200 e rimuove', async () => {
    const e = env({ 'owner:ABC': 's1', 'iscr:ABC:1': JSON.stringify({ id: '1' }) })
    const r = await handle(req('DELETE', '/api/iscrizioni/ABC/1', { headers: await authSoc('s1') }), e)
    expect(r.status).toBe(200)
    expect(await e.KV.get('iscr:ABC:1')).toBeNull()
  })
})
```

Aggiornare inoltre i **test esistenti** che usavano l'header `auth` (READ_TOKEN) per queste 5 rotte, sostituendo `auth` con `await authSoc()`:
- `POST /api/torneo con token pubblica il riepilogo` → header `await authSoc()`; l'asserzione su `torneo:ABC` resta.
- `GET iscrizioni senza token -> 401` → mantiene (nessun header) ma resta 401.
- `GET iscrizioni con token elenca le iscrizioni` → header `await authSoc('s1')` e seed `{ 'owner:ABC': 's1', ... }`.
- `DELETE iscrizione con token la rimuove` → header `await authSoc('s1')`, seed `{ 'owner:ABC': 's1', 'iscr:ABC:1': ... }`.
- `GET /api/iscrizioni/:codice con token sbagliato -> 401`: sostituire con "con Bearer non valido -> 401" usando `headers: { authorization: 'Bearer non-valido' }` (atteso 401, perché `verificaJWT` fallisce).
- `POST /api/pubblico/:codice con token salva lo snapshot`: header `await authSoc('s1')`; l'asserzione su `pubblico:ABC` resta.
- `POST /api/pubblico/:codice con dati incompleti -> 400`: header `await authSoc('s1')` (il 400 deve scattare **prima** del check owner, quindi resta 400 anche senza owner).
- `POST /api/pubblico/:codice senza token -> 401`: resta (nessun header).
- `DELETE /api/pubblico/:codice con token rimuove lo snapshot`: header `await authSoc('s1')`, seed `{ 'owner:ABC': 's1', 'pubblico:ABC': snapshot() }`.
- `DELETE /api/pubblico/:codice senza token -> 401`: resta.

Infine, nel helper `env(...)` rimuovere la riga `READ_TOKEN: TOKEN,` e la costante `const TOKEN = 'segreto'` e `const auth = ...` (non più usate). Mantenere `WTOKEN`/`WRITE_TOKEN` (fuori scope).

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npm test -- worker/src/handler.test.ts`
Expected: FAIL — la compilazione fallisce perché `proprietarioConsentito`/i nuovi comportamenti non esistono ancora, e le rotte usano ancora `autorizzato`.

- [ ] **Step 3: Aggiungere il guard `proprietarioConsentito` e rimuovere `autorizzato`**

In `worker/src/handler.ts`: rimuovere la funzione `autorizzato` (righe ~73-76) e la riga `READ_TOKEN: string` dall'interfaccia `Env`. Aggiungere, vicino a `emailValida`, il nuovo helper:

```ts
// Scoping per società sulle rotte organizzatore. La proprietà di un torneo è tracciata in KV
// (`owner:<codice>`), reclamata alla prima pubblicazione. Consentito ad admin, al proprietario,
// o se ancora senza proprietario (grazia sui documenti legacy). Con `claim`, registra il proprietario.
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

- [ ] **Step 4: Migrare le 5 rotte a sessione + guard**

In `worker/src/handler.ts`:

`POST /api/torneo` — sostituire `if (!autorizzato(req, env)) return json({ error: 'non autorizzato' }, 401)` con la sessione, e aggiungere il check owner **dopo** la validazione dei campi:

```ts
  if (req.method === 'POST' && p1 === 'torneo' && !p2) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    let b: Partial<Riepilogo>
    try {
      b = (await req.json()) as Partial<Riepilogo>
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (!b.codice || !b.nome || !b.tipologia) return json({ error: 'dati incompleti' }, 400)
    if (!(await proprietarioConsentito(b.codice, s, env, { claim: true }))) return json({ error: 'vietato' }, 403)
    // ...resto invariato (costruzione riepilogo, KV.put, return)
  }
```

`GET /api/iscrizioni/:codice`:

```ts
  if (req.method === 'GET' && p1 === 'iscrizioni' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    if (!(await proprietarioConsentito(p2, s, env))) return json({ error: 'vietato' }, 403)
    // ...resto invariato (KV.list, return)
  }
```

`DELETE /api/iscrizioni/:codice/:id`:

```ts
  if (req.method === 'DELETE' && p1 === 'iscrizioni' && p2 && p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    if (!(await proprietarioConsentito(p2, s, env))) return json({ error: 'vietato' }, 403)
    await env.KV.delete(`iscr:${p2}:${p3}`)
    return json({ ok: true })
  }
```

`POST /api/pubblico/:codice` — check owner **dopo** la validazione dei campi:

```ts
  if (req.method === 'POST' && p1 === 'pubblico' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    let b: Partial<PublicSnapshot>
    try {
      b = (await req.json()) as Partial<PublicSnapshot>
    } catch {
      return json({ error: 'JSON non valido' }, 400)
    }
    if (!b.codice || !b.nome || !b.tipologia) return json({ error: 'dati incompleti' }, 400)
    if (!(await proprietarioConsentito(p2, s, env, { claim: true }))) return json({ error: 'vietato' }, 403)
    // ...resto invariato (snap, KV.put, return)
  }
```

`DELETE /api/pubblico/:codice`:

```ts
  if (req.method === 'DELETE' && p1 === 'pubblico' && p2 && !p3) {
    const s = await sessione(req, env)
    if (!s) return json({ error: 'non autorizzato' }, 401)
    if (!(await proprietarioConsentito(p2, s, env))) return json({ error: 'vietato' }, 403)
    await env.KV.delete(`pubblico:${p2}`)
    return json({ ok: true })
  }
```

- [ ] **Step 5: Ripulire `index.ts` da `READ_TOKEN`**

In `worker/src/index.ts`: rimuovere `READ_TOKEN: string` da `CfEnv` e la riga `READ_TOKEN: cfEnv.READ_TOKEN,` dal literal `env`.

- [ ] **Step 6: Eseguire test e typecheck**

Run: `npm test -- worker/src/handler.test.ts`
Expected: PASS (tutti).
Run: `npx tsc -p worker/tsconfig.json`
Expected: exit 0, nessun errore (nessun riferimento residuo a `autorizzato`/`READ_TOKEN`).

- [ ] **Step 7: Commit**

```bash
git add worker/src/handler.ts worker/src/index.ts worker/src/handler.test.ts
git commit -m "feat(worker): pubblicazione via sessione con scoping per società

Le 5 rotte organizzatore passano da READ_TOKEN a JWT di sessione, con owner:<codice>
in KV reclamato alla prima pubblicazione. Rimosso il plumbing morto di READ_TOKEN.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Client — chiamate su sessione + rimozione parametro `token`

**Files:**
- Modify: `src/services/registrations-api.ts` (5 metodi `auth`→`sessione`; rimozione `token`/`auth`)
- Modify: `src/services/config.ts:41` (`getClient` non passa più `token`)
- Test: `src/services/registrations-api.test.ts`

**Interfaces:**
- Consumes: `creaClient({ baseUrl, sessione? })` (dopo la modifica, senza `token`).
- Produces: le 5 chiamate (`pubblicaRiepilogo`, `elencaIscrizioni`, `eliminaIscrizione`, `pubblicaSnapshot`, `rimuoviSnapshot`) inviano l'header `authorization: Bearer <sessione>`.

- [ ] **Step 1: Aggiornare i test del client**

In `src/services/registrations-api.test.ts`, individuare i test che verificano l'header `Authorization` per le 5 chiamate: sostituire l'aspettativa dal valore del `token` a quello della `sessione`. Costruire il client con `creaClient({ baseUrl, sessione: 'sess-xyz' })` e verificare che le 5 chiamate producano `authorization: Bearer sess-xyz`. Rimuovere ogni asserzione basata sul vecchio parametro `token`. (Le chiamate pubbliche — `getRiepilogo`, `inviaIscrizione`, `getSnapshot` — restano senza header.)

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npm test -- src/services/registrations-api.test.ts`
Expected: FAIL — le 5 chiamate inviano ancora il token (o `undefined`), non la sessione.

- [ ] **Step 3: Migrare il client**

In `src/services/registrations-api.ts`:
- In `creaClient`, cambiare la firma del config da `{ baseUrl: string; token?: string; sessione?: string }` a `{ baseUrl: string; sessione?: string }`.
- In `call(...)`, rimuovere `opts.auth` e il ramo `if (opts.auth && config.token) headers.authorization = ...`. Mantenere il ramo `if (opts.sessione) Object.assign(headers, headerW())`.
- Cambiare le 5 chiamate da `{ ..., auth: true }` a `{ ..., sessione: true }`:
  - `pubblicaRiepilogo`, `elencaIscrizioni`, `eliminaIscrizione`, `pubblicaSnapshot`, `rimuoviSnapshot`.
- Rimuovere `auth?: boolean` dal tipo del parametro `opts` di `call`.

In `src/services/config.ts` (funzione `getClient`, riga 41): cambiare
`return creaClient({ baseUrl: getApiBaseUrl(), token: getReadToken(), sessione: getSessione() })`
in
`return creaClient({ baseUrl: getApiBaseUrl(), sessione: getSessione() })`.
(`getReadToken` resta ancora definita in `config.ts` — verrà rimossa nel Task 3.)

- [ ] **Step 4: Eseguire test e typecheck**

Run: `npm test -- src/services/registrations-api.test.ts`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0. (Nota: `getReadToken` risulta ancora usata da `pubblicazione.ts` e `SettingsScreen`, quindi nessun errore di "unused".)

- [ ] **Step 5: Commit**

```bash
git add src/services/registrations-api.ts src/services/config.ts src/services/registrations-api.test.ts
git commit -m "feat(app): il client pubblica via sessione invece del token di lettura

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rimozione del plumbing morto di `READ_TOKEN` (config, pubblicazione, Impostazioni)

**Files:**
- Modify: `src/services/pubblicazione.ts:54` (gate `getReadToken`→`getSessione`; import)
- Modify: `src/services/config.ts` (rimozione `getReadToken`/`setReadToken`)
- Modify: `src/screens/SettingsScreen.tsx` (rimozione campo "Token di lettura")
- Test: `src/services/config.test.ts` (rimozione test del token)

**Interfaces:**
- Consumes: `getSessione(): string | undefined` (già in `config.ts`).
- Produces: `config.ts` non esporta più `getReadToken`/`setReadToken`.

- [ ] **Step 1: Aggiornare il test di `config`**

In `src/services/config.test.ts`: rimuovere l'import di `getReadToken`/`setReadToken` (riga 2) e il/i test che li verificano (il blocco che fa `setReadToken('tok')` → `expect(getReadToken()).toBe('tok')`). Lasciare invariati i test di `apiBaseUrl`.

- [ ] **Step 2: Aggiornare il gate di `pubblicaSeAttivo`**

In `src/services/pubblicazione.ts`:
- Cambiare l'import `import { getClient, getReadToken } from './config'` in `import { getClient, getSessione } from './config'`.
- Alla riga 54 cambiare `if (!getReadToken()) return` in `if (!getSessione()) return`.

- [ ] **Step 3: Rimuovere il campo "Token di lettura" da Impostazioni**

In `src/screens/SettingsScreen.tsx`: rimuovere lo stato, l'input, la label e l'help-text relativi al "Token di lettura", oltre a ogni chiamata a `getReadToken`/`setReadToken` e al relativo import. Mantenere: campo URL API, stato sessione (Accesso come… / Esci), pulsante "Verifica connessione". Se "Salva" salvava sia URL sia token, farlo salvare solo l'URL.

- [ ] **Step 4: Rimuovere `getReadToken`/`setReadToken` da `config.ts`**

In `src/services/config.ts`: eliminare le funzioni `getReadToken` (righe ~20-22) e `setReadToken` (righe ~24-26). Verificare con un grep che non restino riferimenti:

Run: `grep -rn "getReadToken\|setReadToken\|readToken" src/`
Expected: nessun risultato in codice di produzione (eventuali occorrenze solo in commenti vanno rimosse).

- [ ] **Step 5: Eseguire test e typecheck**

Run: `npm test -- src/services/config.test.ts src/services/pubblicazione.test.ts`
Expected: PASS (se `pubblicazione.test.ts` non esiste, eseguire solo `config.test.ts`).
Run: `npx tsc -b`
Expected: exit 0 (nessun riferimento residuo, nessun "unused import").

- [ ] **Step 6: Commit**

```bash
git add src/services/config.ts src/services/config.test.ts src/services/pubblicazione.ts src/screens/SettingsScreen.tsx
git commit -m "refactor(app): rimuove il plumbing morto del token di lettura

Il gate di pubblicazione automatica ora dipende dalla sessione; rimosso il campo
'Token di lettura' da Impostazioni e le funzioni getReadToken/setReadToken.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: UI — pulsante "Pubblica" abilitato solo con login

**Files:**
- Modify: `src/screens/RiepilogoScreen.tsx` (gate sessione sulla sezione "Condivisione pubblica")
- Test: `src/screens/RiepilogoScreen.test.tsx` (se presente; altrimenti crearlo mirato)

**Interfaces:**
- Consumes: `getSessione(): string | undefined` da `../services/config`.

- [ ] **Step 1: Scrivere il test del gate**

In `src/screens/RiepilogoScreen.test.tsx` (creare se assente), aggiungere due test:
- Senza sessione (`localStorage` senza `sessione`): la sezione "Condivisione pubblica" mostra un CTA "Accedi per pubblicare" con link a `/accesso` e **non** rende cliccabile "Pubblica".
- Con sessione presente (`localStorage.setItem('sessione', '<jwt-finto>')`): il pulsante "Pubblica" è presente e abilitato.

Seguire i pattern di test già usati negli altri `*.test.tsx` (render con router, seed IndexedDB via fake-indexeddb, `screen.getByRole`). Per un torneo non pubblicato serve un torneo in IndexedDB con `pubblicato` falso.

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npm test -- src/screens/RiepilogoScreen.test.tsx`
Expected: FAIL — il CTA "Accedi per pubblicare" non esiste ancora.

- [ ] **Step 3: Implementare il gate**

In `src/screens/RiepilogoScreen.tsx`, nella sezione "Condivisione pubblica": leggere `const sessione = getSessione()` (import da `../services/config`). Se `!sessione`, al posto del pulsante "Pubblica" mostrare un breve testo + link: "Accedi per pubblicare il tabellone" con `<Link to="/accesso">Accedi</Link>`. Se il torneo è già pubblicato, mantenere visibili "Copia link"/QR ma richiedere la sessione per "Interrompi pubblicazione" (stesso gate). Coerente con il pattern di HomeScreen "Carica dal cloud".

- [ ] **Step 4: Eseguire test e typecheck**

Run: `npm test -- src/screens/RiepilogoScreen.test.tsx`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/screens/RiepilogoScreen.tsx src/screens/RiepilogoScreen.test.tsx
git commit -m "feat(app): 'Pubblica' richiede il login (gate sessione)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verifica finale (dopo tutti i task)

- [ ] `npm test -- worker/src/handler.test.ts` → PASS
- [ ] `npx tsc -p worker/tsconfig.json` → exit 0
- [ ] `npx tsc -b` → exit 0
- [ ] `grep -rn "READ_TOKEN\|getReadToken\|setReadToken\|readToken\|autorizzato" src/ worker/src/` → nessun residuo in codice di produzione
- [ ] Review dell'intero branch (opus) prima del merge; poi merge + push + deploy Worker (`npm run deploy:worker`) e web (`npm run deploy:web`).

## Note operative / legacy

- Snapshot già pubblicati (`DEMO24`, `E962D8`): la vista pubblica continua a funzionare; alla prima ripubblicazione autenticata la società li reclama (`owner:<codice>`).
- I tornei "toccati" solo dall'admin (società `null`) restano senza owner (grazia). Prima di onboardare una 2ª società, ripubblicarli da un account con società o impostare gli `owner:<codice>`.
- Il secret `READ_TOKEN` resta su Cloudflare ma non è più letto dal codice: si può rimuovere in un ticket separato.
