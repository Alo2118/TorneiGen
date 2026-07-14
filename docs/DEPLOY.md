# Deploy di TorneiGen (Cloudflare, gratis)

Due pezzi da pubblicare, entrambi su Cloudflare (piano gratuito):
- **Worker API** (`worker/`) → Cloudflare Workers
- **PWA** (l'app React) → Cloudflare Pages

Tutti i comandi si lanciano dalla root del progetto. I passi con `wrangler login`/`kv`/`secret`/`deploy`
richiedono il **tuo** account Cloudflare (io non posso autenticarmi al posto tuo): lanciali tu, poi
incolla qui gli output che servono (id del KV, URL del Worker) e completo io la config.

## 0. Account + login
Crea un account gratuito su cloudflare.com, poi:
```
npx wrangler login
```
(Si apre il browser per l'autorizzazione. In alternativa: `export CLOUDFLARE_API_TOKEN=...`)

## 1. Crea il namespace KV
```
npx wrangler kv namespace create KV --config worker/wrangler.toml
```
Stampa un `id`. Copialo in `worker/wrangler.toml` al posto di `DA_IMPOSTARE_AL_DEPLOY`
(oppure mandamelo e lo metto io).

## 2. Imposta il token di lettura (secret)
Scegli un token privato (una stringa lunga e casuale — es. `openssl rand -hex 24`). Impostalo:
```
npx wrangler secret put READ_TOKEN --config worker/wrangler.toml
```
Incolla il token quando richiesto. **Tienilo da parte**: lo inserirai nelle Impostazioni dell'app.
Non condividerlo con nessuno (è ciò che protegge la lettura delle iscrizioni).

## 3. Deploy del Worker
```
npm run deploy:worker
```
Annota l'URL pubblicato, del tipo `https://torneigen-api.<tuo-account>.workers.dev`.

## 4. Build + deploy della PWA (Cloudflare Pages)
La build "cuoce" l'URL del Worker nel form pubblico (i partecipanti non hanno il token), quindi
passa `VITE_API_BASE_URL`:
```
VITE_API_BASE_URL="https://torneigen-api.<tuo-account>.workers.dev" npm run deploy:web
```
Al primo run crea il progetto Pages `torneigen`. Annota l'URL, del tipo `https://torneigen.pages.dev`.
(Il file `public/_redirects` fa sì che le rotte SPA come `/iscrizione/CODICE` funzionino anche al
refresh.)

## 5. Configura l'app come organizzatore
Apri l'app pubblicata → **Impostazioni** → imposta:
- **URL API**: l'URL del Worker (passo 3)
- **Token di lettura**: il `READ_TOKEN` scelto (passo 2)

Ora: crea un torneo → **Apri iscrizioni** → condividi il link pubblico → i partecipanti si iscrivono →
**Scarica** e **Importa** le iscrizioni → **Conferma** → genera il torneo.

## Costi e limiti
Tutto nei piani gratuiti: Workers 100.000 richieste/giorno, KV 1.000 scritture/giorno e 1 GB, Pages
statico illimitato. Per un torneo (decine/centinaia di iscrizioni) sei ampiamente sotto i limiti — **0 €**.

## Note
- CORS: il Worker consente qualsiasi origine (adeguato a questo uso).
- `compatibility_date` in `worker/wrangler.toml` è `2026-01-01` (valida).
- Aggiornare l'app dopo modifiche: `npm run deploy:worker` e/o `VITE_API_BASE_URL=... npm run deploy:web`.
- Dominio personalizzato (opzionale, ~10-15 €/anno): collegabile sia al Worker sia alle Pages dal
  pannello Cloudflare; non necessario (gli URL `*.workers.dev` / `*.pages.dev` sono gratuiti).
