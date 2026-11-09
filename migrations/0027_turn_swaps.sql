-- Scambio di turno sulle attivita' "a turno": un coinquilino chiede a un altro di invertire le rispettive
-- posizioni nella rotazione; l'altro accetta o rifiuta (dal gruppo Telegram o dal portale).
-- task_id senza vincolo di chiave esterna: eliminare un'attivita' non deve essere bloccato dalle richieste.
CREATE TABLE IF NOT EXISTS turn_swaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  task_id INTEGER NOT NULL,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  target_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  -- Messaggio nel gruppo con i pulsanti Accetto / Rifiuto, per aggiornarlo alla risposta.
  message_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_turn_swaps_house_status ON turn_swaps(house_id, status);
