-- ShameBot v2: case condivise tra coinquilini, ognuna collegata a un gruppo Telegram.

CREATE TABLE IF NOT EXISTS houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  chat_id INTEGER NOT NULL UNIQUE,
  notify_changes INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS house_members (
  house_id INTEGER NOT NULL REFERENCES houses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (house_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_house_members_user_id ON house_members(user_id);

-- Le attivita' esistenti (house_id NULL) vengono adottate dalla prima casa creata.
ALTER TABLE tasks ADD COLUMN house_id INTEGER REFERENCES houses(id);
ALTER TABLE tasks ADD COLUMN last_completed_by INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN overdue_notice_sent_at TEXT;
ALTER TABLE tasks ADD COLUMN nudge_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_house_id ON tasks(house_id);

-- Registro di tutto cio' che succede in una casa: attivita' fatte, create, modificate, eliminate.
CREATE TABLE IF NOT EXISTS house_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES houses(id),
  user_id INTEGER REFERENCES users(id),
  task_id INTEGER,
  task_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('done', 'created', 'updated', 'deleted')),
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_house_log_house_created ON house_log(house_id, created_at DESC);
