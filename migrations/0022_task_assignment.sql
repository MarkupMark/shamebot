-- Assegnazione delle attivita': chiunque, solo un utente, a turno, oppure turni personalizzati.
ALTER TABLE tasks ADD COLUMN assign_mode TEXT NOT NULL DEFAULT 'anyone';
-- JSON array di id utente: [id] per 'single', l'ordine dei turni per 'alternate'.
ALTER TABLE tasks ADD COLUMN assign_users TEXT;
-- Indice del turno corrente per 'alternate' (avanza a ogni completamento).
ALTER TABLE tasks ADD COLUMN assign_turn INTEGER NOT NULL DEFAULT 0;

-- Turni personalizzati: un utente, una finestra (giorno specifico / entro una settimana / entro un mese).
-- Il turno aperto con la scadenza piu' vicina decide a chi tocca e quando scade l'attivita'.
CREATE TABLE IF NOT EXISTS task_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('day', 'week', 'month')),
  starts_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_slots_open ON task_slots(task_id, completed_at, due_at);
