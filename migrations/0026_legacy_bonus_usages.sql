-- Tabella della prima versione del bot (bonus di proroga), ancora presente nel database di produzione.
-- Punta a tasks(id): finche' ha righe di un'attivita', quell'attivita' non si puo' eliminare.
-- La creiamo anche dove manca (SQLite locale, test) cosi' gli schemi coincidono e deleteTask la puo' ripulire.
CREATE TABLE IF NOT EXISTS bonus_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  hours INTEGER NOT NULL CHECK (hours >= 1 AND hours <= 12),
  extension_ms INTEGER NOT NULL,
  used_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
