CREATE TABLE IF NOT EXISTS organizzazioni (
  codice    TEXT PRIMARY KEY,
  doc       TEXT NOT NULL,
  version   INTEGER NOT NULL,
  updatedAt TEXT NOT NULL
);
