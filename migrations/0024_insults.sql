-- Insulti scritti dai coinquilini: ognuno scrive i suoi (segreti), il bot ne sceglie uno a caso tra quelli
-- degli altri quando un'attivita' scade o arriva il sollecito. Nessun insulto per una gravita' = predefiniti.
CREATE TABLE IF NOT EXISTS insults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insults_house_severity ON insults(house_id, severity);
