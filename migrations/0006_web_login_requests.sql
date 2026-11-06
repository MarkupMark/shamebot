CREATE TABLE IF NOT EXISTS web_login_requests (
  token TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'claimed', 'expired')),
  telegram_id INTEGER,
  username TEXT,
  display_name TEXT,
  approved_at TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_login_requests_status_expires_at
  ON web_login_requests(status, expires_at);
