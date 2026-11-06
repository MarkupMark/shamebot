CREATE INDEX IF NOT EXISTS idx_web_sessions_expires_at
  ON web_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_web_login_requests_status_claimed_at
  ON web_login_requests(status, claimed_at);
