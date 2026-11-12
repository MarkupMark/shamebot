-- Periodi fissi: le scadenze di prima vengono allineate una volta alla fine del loro periodo.
-- 0 = da controllare, 1 = gia' allineata (o controllata). Gli spostamenti successivi non vengono toccati.
ALTER TABLE tasks ADD COLUMN period_aligned INTEGER NOT NULL DEFAULT 0;
