-- Promemoria giornalieri nel gruppo: "buongiorno" e "riepilogo serale", impostabili dal portale.
-- Senza riga si usano i valori predefiniti (buongiorno attivo alle 09:00, serale spento alle 21:00).
CREATE TABLE IF NOT EXISTS house_digests (
  house_id INTEGER NOT NULL REFERENCES houses(id),
  kind TEXT NOT NULL CHECK (kind IN ('morning', 'evening')),
  enabled INTEGER NOT NULL,
  send_time TEXT NOT NULL,
  -- Frase iniziale personalizzata (NULL = testo predefinito). L'elenco sotto e' sempre automatico.
  intro TEXT,
  skip_if_empty INTEGER NOT NULL DEFAULT 1,
  -- Data locale (YYYY-MM-DD) dell'ultimo giorno gestito: evita doppi invii.
  last_sent_date TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (house_id, kind)
);
