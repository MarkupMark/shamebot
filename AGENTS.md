# Istruzioni per assistenti AI (e per chi contribuisce)

ShameBot è un bot Telegram per le faccende di casa tra coinquilini, con un portale web / Mini App.
Gira su **Cloudflare Workers + D1** in produzione e su **Node + SQLite** in locale.
Ogni merge su `main` va **subito in produzione** (vedi `.github/workflows/deploy.yml`), quindi le modifiche
arrivano solo tramite Pull Request da un fork.

## Comandi

| Comando | A cosa serve |
| --- | --- |
| `npm install` | Dipendenze (Node 22+) |
| `npm test` | Test (vitest). Devono passare prima di ogni PR |
| `npm run build` | Type-check TypeScript. Deve passare |
| `npm run preview` | Portale con dati finti su http://localhost:8790, senza login né database |
| `npm run dev` | Bot in polling con SQLite locale. Serve un **bot di prova** (token da @BotFather in `.env`) |

## Struttura

- `src/worker.ts`: entry Cloudflare. Routing HTTP, API JSON `/api/...`, webhook Telegram, cron.
- `src/index.ts`: entry locale (Node, polling + scheduler a intervalli).
- `src/bot/handlers.ts`: comandi Telegram (`/attivita`, `/fatto`, `/nuova`...).
- `src/services/store.ts`: tutte le query SQL (`HouseStore`). Unico punto che parla col database.
- `src/services/houses.ts`: operazioni sulle attività (salva, registro, avvisi al gruppo).
- `src/services/policy.ts`: scadenze e promemoria. `src/services/scheduler.ts` li invia.
- `src/services/notify.ts`: testi dei messaggi del bot.
- `src/web/page.ts`: il portale (HTML + CSS + JS in un'unica stringa). `src/web/contribute.ts` è la pagina `/contribuisci`.
- `src/types/domain.ts`: tipi condivisi.
- `migrations/`: schema SQL, applicato in ordine (D1 in produzione, SQLite in locale e nei test).
- `test/`: test vitest. `test/helpers.ts` crea uno store su SQLite in memoria.

## Regole (importanti)

1. **Il JavaScript del portale in `src/web/page.ts` vive dentro un template literal.** Nel codice client
   non usare template literal (backtick), `${...}` né backslash: usa concatenazione con `+` e `var`/`function`
   come il codice esistente. Un backslash sbagliato rompe la pagina senza errori di build.
2. **Migrazioni:** mai modificare un file esistente in `migrations/`. Per cambiare lo schema aggiungi un nuovo file
   con il numero successivo (es. `0023_...sql`). Usa `ALTER TABLE ... ADD COLUMN` o `CREATE TABLE IF NOT EXISTS`,
   mai `DROP` di dati esistenti. La migrazione deve funzionare sia su SQLite sia su D1.
3. **Query SQL solo in `store.ts`**, sempre con parametri `?`, mai concatenando input dell'utente.
4. **Testi in italiano.** I messaggi del bot sono volutamente brevi (una riga, emoji iniziale).
5. **Test:** ogni modifica di comportamento ha un test in `test/`. Prima della PR `npm test` e `npm run build` devono passare.
6. **Non toccare** senza chiedere: `wrangler.toml`, `.github/workflows/`, segreti, token, `database_id`.
   Non committare mai `.env`, `data/` o token, nemmeno quelli di prova.
7. **Portale:** dopo una modifica visibile controlla con `npm run preview`, anche a larghezza telefono (~375px):
   il portale si usa soprattutto come Mini App dentro Telegram.
8. Modifiche piccole e mirate: una PR = una funzionalità o un fix. Aggiorna il `README.md` se cambi comandi o comportamento.

## Concetti del dominio

- **Casa** = un gruppo Telegram. I membri entrano usando un comando nel gruppo.
- **Attività**: nome, frequenza (`intervalMs`), gravità (`low`/`medium`/`high`). La scadenza è
  `cycleAnchorAt + intervalMs`, e "Fatto" fa ripartire il ciclo.
- **Assegnazione**: `anyone`, `single`, `alternate` (a turno, avanza a ogni "Fatto") oppure `custom`
  (turni in `task_slots`; il turno aperto più vicino decide a chi tocca e la scadenza).
- **Registro** (`house_log`): tutto ciò che succede in una casa.
- `BOT_PAUSED=true` spegne gli invii senza perdere dati.
