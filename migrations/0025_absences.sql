-- "Sono fuori casa": un coinquilino dichiara di essere via, un altro conferma. Finche' l'assenza e' attiva
-- le attivita' assegnate a lui sono in pausa (niente avvisi ne' insulti); al rientro le scadenze si spostano.
CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'ended', 'cancelled')),
  -- Inizio dell'assenza (quando l'ha dichiarata): da qui si contano i giorni "regalati".
  starts_at TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  ended_by INTEGER REFERENCES users(id),
  ended_at TEXT,
  -- Messaggio nel gruppo con il pulsante "Confermo", per aggiornarlo quando qualcuno conferma.
  message_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_absences_house_status ON absences(house_id, status);
