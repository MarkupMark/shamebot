-- Codice breve (6 cifre) per confermare il login dal bot scrivendolo in chat:
-- il link t.me/...?start=login_... non invia il token se la chat col bot era gia' avviata.
ALTER TABLE web_login_requests ADD COLUMN code TEXT;

CREATE INDEX IF NOT EXISTS idx_web_login_requests_code ON web_login_requests(code, status);
