CREATE TABLE IF NOT EXISTS organizzazioni (
  codice    TEXT PRIMARY KEY,
  doc       TEXT NOT NULL,
  version   INTEGER NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Colonna di ownership (Fase multi-organizzatore). ALTER separata dal CREATE
-- cosi' la tabella e' creata "fresca" senza colonna e poi allineata sia sui
-- DB nuovi che su quelli remoti gia' esistenti. Se rieseguita su un DB che
-- ha gia' la colonna, fallisce con "duplicate column name" (atteso: va
-- eseguita una sola volta).
ALTER TABLE organizzazioni ADD COLUMN societa_id TEXT;
-- Indice per l'elenco dei tornei di una societa' (GET /api/org filtra su societa_id):
-- senza, ogni chiamata farebbe un full scan della tabella.
CREATE INDEX IF NOT EXISTS idx_org_societa ON organizzazioni(societa_id);

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
