-- Copia dei dati dell'attivita' nel registro, per poter ripristinare quelle eliminate.
ALTER TABLE house_log ADD COLUMN task_interval_ms INTEGER;
ALTER TABLE house_log ADD COLUMN task_severity TEXT;
ALTER TABLE house_log ADD COLUMN restored_at TEXT;
