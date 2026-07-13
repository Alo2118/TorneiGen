# TorneiGen — Design: gestione tornei di beach volley

**Data:** 2026-07-13
**Stato:** approvato per implementazione
**Repo:** https://github.com/Alo2118/TorneiGen

## 1. Obiettivo e contesto

Webapp per gestire tornei di beach volley in contesto di **eventi pubblici**. Due esigenze
distinte:

1. **Iscrizioni online** — i partecipanti si iscrivono da soli tramite un link pubblico
   (installabile come PWA). L'organizzatore può anche aggiungere/modificare squadre a mano.
2. **Gestione del torneo in locale/offline** — tutta la logica (gironi, tabelloni, punteggi,
   classifiche) gira nel browser dell'organizzatore, senza dipendenza da internet durante
   l'evento. I punteggi li inserisce solo l'organizzatore da un pannello di controllo.

La parte online serve **esclusivamente** a raccogliere le iscrizioni; tutto il resto è locale.

## 2. Decisioni di architettura

| Ambito | Scelta | Motivazione |
|---|---|---|
| Frontend | **PWA** — Vite + React | Installabile, offline via service worker; un solo deploy statico |
| Hosting | **GitHub Pages** | Statico, gratuito, collegato al repo esistente |
| Casella iscrizioni | **Supabase** (free tier) | Adatto a form anonimi da pagina statica: solo `INSERT` pubblico via anon key + RLS |
| Stato torneo (locale) | **IndexedDB** (Dexie) + export/import **JSON** | Offline, zero server; JSON per backup e trasferimento tra dispositivi |
| Motore tornei | **Funzioni pure** in `engine/` | Nessuna UI/IO → sviluppabile in TDD e testabile in isolamento |

Trade-off accettato: Supabase è l'unica dipendenza esterna, usata solo come "casella" per
ricevere le iscrizioni anonime (cosa che GitHub Pages da solo non può fare in modo sicuro).

## 3. Moduli e confini

| Modulo | Responsabilità | Dipende da |
|---|---|---|
| `engine/` | Logica pura tornei: round robin, tabelloni, King of the Court, classifiche e spareggi. Nessuna UI/IO | niente |
| `db/` | Persistenza locale IndexedDB (schema Dexie, repository per squadre/partite/gironi/torneo) | — |
| `sync/` | Client Supabase: scarica le iscrizioni nella modalità organizzatore | Supabase |
| `io/` | Export/import JSON (backup, trasferimento tra dispositivi) | db |
| `ui/` | React: iscrizione pubblica, dashboard organizzatore, setup torneo, gestione squadre, calendario/tabellone, inserimento punteggi, classifiche | engine, db, sync, io |
| PWA | manifest + service worker (plugin Vite PWA) | — |

Principio guida: `engine/` è il cuore, puro e indipendente. La UI consuma engine + db; nessuna
logica di torneo vive nella UI.

## 4. Modello dati

### 4.1 Locale (IndexedDB)

**Tournament**
- `id`
- `nome`
- `tipologia`: `2x2` | `4x4` (determina il numero di giocatori per squadra — vedi Team)
- `formato`: `gironi_eliminazione` | `eliminazione_diretta` | `girone_italiana` | `king_of_the_court`
- `data`
- `stato`: `bozza` | `iscrizioni_aperte` | `in_corso` | `concluso`
- `regolePunteggio`: `{ setAlMeglioDi: 1|3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, cap?: number }`
  — **interamente configurabile per ogni torneo**, indipendente da tipologia e formato; i valori
  mostrati sono solo default modificabili. Nessuna riserva/titolare distinta nel 4x4: lista
  giocatori unica.
- `codiceIscrizione`: stringa usata dal form pubblico per associare le iscrizioni al torneo

`tipologia` e `formato` sono **dimensioni indipendenti** (es. un 4x4 a gironi+eliminazione).

**Player** (embedded nella squadra)
- `nome`
- `cognome`
- `email`
- `telefono`

**Team**
- `id`
- `tournamentId`
- `nome`
- `players[]`: elementi `Player`, in numero secondo la `tipologia`:
  - **2x2** → esattamente 2 giocatori
  - **4x4** → da 4 fino a **8** giocatori (4 in campo + fino a 4 riserve/rotazione)
- `contatto`: opzionale a livello squadra (referente); i contatti principali sono sui singoli giocatori
- `testaDiSerie`: numero opzionale per il seeding
- `stato`: `in_attesa` | `confermata`
- `origine`: `online` | `manuale`

**Group** (girone)
- `id`
- `tournamentId`
- `nome`
- `teamIds[]`

**Match**
- `id`
- `tournamentId`
- `fase`: `girone` | `tabellone` | `kotc`
- `groupId`: opzionale
- `round`: numero
- `posizioneTabellone`: opzionale (per l'avanzamento nel bracket)
- `teamAId`, `teamBId`
- `set[]`: `[{ puntiA, puntiB }]`
- `vincitoreId`: opzionale
- `stato`: `programmata` | `in_corso` | `conclusa`
- `campo`: opzionale
- `orario`: opzionale

### 4.2 Online (Supabase, tabella `registrations`)

- `id`
- `codice_torneo`
- `nome_squadra`
- `giocatori`: JSON con `[{ nome, cognome, email, telefono }]` (2 o 4 elementi)
- `created_at`
- `importata`: booleano (gestito lato organizzatore dopo l'import)

**RLS:** consentito solo `INSERT` pubblico anonimo; nessuna `SELECT` pubblica. La lettura per
l'import avviene con credenziali dell'organizzatore.

## 5. Flussi utente

1. **Creazione torneo** — l'organizzatore imposta nome, tipologia (2x2/4x4), formato, data,
   regole punteggio → ottiene un **codice/link di iscrizione**.
2. **Apertura iscrizioni** — stato `iscrizioni_aperte`. I partecipanti aprono il link, compilano
   il **form pubblico** (nome squadra + per ogni giocatore: nome, cognome, email, telefono; 2
   giocatori per il 2x2, da 4 a 8 per il 4x4 con aggiunta dinamica dei giocatori) → salvato su
   Supabase.
3. **Import** — l'organizzatore preme **"Scarica iscrizioni"** → le squadre entrano in IndexedDB;
   può confermare/modificare e aggiungere squadre manuali.
4. **Generazione** — **"Genera"** crea gironi/tabellone/calendario secondo formato e teste di serie.
5. **Svolgimento (offline)** — l'organizzatore inserisce i punteggi dei set per ogni partita →
   classifiche e avanzamento tabellone si aggiornano automaticamente.
6. **Backup e chiusura** — export JSON in qualsiasi momento; vista finale con vincitori e
   classifiche.

## 6. Motore tornei (`engine/`)

- **Round robin** — metodo del cerchio, per girone all'italiana e per i gironi.
- **Tabellone** — eliminazione singola e doppia, con teste di serie e avanzamento automatico dei
  vincitori.
- **Gironi + finale** — genera i gironi → round robin → classifica → i qualificati entrano nel
  tabellone.
- **King of the Court** — scheduler a rotazione su singolo campo + punteggio a rotazione (motore
  separato dagli altri).
- **Classifiche** — ordinamento per: vittorie → quoziente set → quoziente punti → scontro diretto
  (criteri di spareggio configurabili).

Tutte funzioni pure `(input) -> output`, senza accesso a DB o UI.

## 7. Testing e deploy

- **TDD sul motore**: casi per ogni formato, generazione gironi/tabelloni, avanzamento vincitori,
  calcolo classifiche e spareggi, gestione bye/numeri dispari di squadre.
- **Deploy**: GitHub Actions → build Vite → GitHub Pages.
- **Supabase**: un progetto, tabella `registrations` + policy RLS "solo INSERT pubblico".

## 8. Ordine di sviluppo

Per avere valore utilizzabile presto:

1. **Motore + gestione locale + inserimento punteggi** — il grosso, usabile offline da subito
   (formati basati su round robin/tabellone: gironi+eliminazione, eliminazione diretta, girone
   all'italiana).
2. **Iscrizioni online** — PWA pubblica + Supabase + import.
3. **King of the Court** — motore separato, aggiunto per ultimo.

## 9. Fuori scope (per ora)

- Scoring live distribuito (arbitri/squadre che inseriscono punteggi): l'inserimento è solo
  dell'organizzatore.
- Display pubblico dei risultati in tempo reale.
- Pagamenti / gestione quote di iscrizione.
- Piattaforma multi-organizzatore (SaaS).
