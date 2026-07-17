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
