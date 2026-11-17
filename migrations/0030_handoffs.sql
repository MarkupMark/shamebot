-- "Passa a...": chi deve fare un'attivita' chiede a un coinquilino di farla al posto suo, solo per questa volta.
-- La richiesta usa la stessa tabella degli scambi di turno, distinta da `kind`.
ALTER TABLE turn_swaps ADD COLUMN kind TEXT NOT NULL DEFAULT 'swap';
-- Se valorizzato, l'attivita' tocca a questo utente fino al prossimo "Fatto" (poi torna l'assegnazione normale).
ALTER TABLE tasks ADD COLUMN handoff_user_id INTEGER;
