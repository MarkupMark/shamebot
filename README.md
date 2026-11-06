# ShameBot

Bot Telegram per coinquilini: le faccende di casa vivono in un gruppo Telegram, il bot ricorda cosa va fatto
e tiene un registro di chi ha fatto cosa. La "vergogna" e' solo interna alla casa: nessuno fuori dal gruppo viene coinvolto.


## Come funziona

- **Una casa = un gruppo Telegram.** Aggiungi il bot al gruppo e scrivi `/start`: nasce la casa.
  Ogni persona che usa un comando nel gruppo entra tra i coinquilini.
- **Attivita' condivise.** Ognuna ha nome, frequenza e gravita' (`poco importante`, `medio`, `importante`).
  Chiunque nella casa puo' aggiungerle, modificarle, eliminarle e segnarle come fatte.
- **Promemoria nel gruppo.** 3 ore e 30 minuti prima della scadenza, poi un messaggio a scadenza avvenuta.
  Per `medio` e `importante` c'e' un secondo sollecito dopo 2 giorni / 1 giorno di ritardo.
  I messaggi citano chi ha fatto l'attivita' l'ultima volta.
- **Assegnazione.** Ogni attivita' puo' toccare a: *chiunque* (predefinito), *solo un utente*, *a turno*
  (passa al prossimo della lista a ogni "Fatto") oppure *personalizzato*: una lista di turni, ognuno con una persona
  e un periodo (un giorno specifico, entro una settimana, entro un mese). Il turno aperto con la scadenza piu' vicina
  decide a chi tocca e quando scade; finiti i turni l'attivita' torna a chiunque con la frequenza normale.
  Promemoria ed elenco nel gruppo mostrano a chi tocca. Si imposta dal portale.
- **Registro.** Ogni attivita' fatta, creata, modificata o eliminata finisce nel log (`/log` o portale).
- **Avvisi sulle modifiche.** Quando si crea o modifica un'attivita' il bot puo' avvisare il gruppo
  (es. `✏️ Luca · Lavare il bagno` / `frequenza 1×/sett → 2×/sett`). I messaggi del bot sono volutamente brevi.
  Valore predefinito per casa con `/notifiche on|off`; per la singola azione c'e' la spunta nel portale
  o `| silenzioso` in fondo al comando.

## Comandi (nel gruppo)

| Comando | Cosa fa |
| --- | --- |
| `/start` | Attiva la casa per questo gruppo |
| `/attivita` | Elenco con scadenze |
| `/fatto [n]` | Segna come fatta (senza numero mostra i pulsanti) |
| `/nuova nome \| frequenza \| gravita'` | Es. `/nuova Pulire il bagno \| 2 volte a settimana \| importante` |
| `/modifica n \| nome \| frequenza \| gravita'` | `-` lascia invariato un campo |
| `/elimina n` | Elimina un'attivita' |
| `/log [n]` | Ultime attivita' svolte e modifiche |
| `/notifiche on\|off` | Avvisi sulle modifiche |
| `/membri`, `/casa`, `/app`, `/help` | Info e aiuto |

Frequenze accettate: `3 giorni`, `1 settimana`, `12 ore`, `2 volte a settimana`, `3 volte al mese`.

Digitando `/` Telegram mostra il menu dei comandi (diverso in chat privata e nel gruppo); `/start` e `/help` nel gruppo
aggiungono i pulsanti rapidi Attività, Fatto e Log. Dopo ogni deploy che cambia i comandi apri `/setup` una volta.

I numeri di `/fatto`, `/modifica` e `/elimina` sono quelli dell'ultimo `/attivita` (ordinato per scadenza).

## Portale web / Mini App

Pagina unica su `/`: accesso con Telegram (automatico dentro la Mini App, altrimenti tramite il bot).
In cima c'e' la timeline **Prossime scadenze**: una barra per attivita' che si accorcia avvicinandosi alla scadenza,
con vista Settimana, Mese o Tutto (scala fino all'attivita' piu' lontana). Sotto:
elenco attivita' con "Fatto / Modifica / Elimina", registro, coinquilini e impostazione degli avvisi.
Si vedono solo le case di cui si fa parte.

## Attivita' preesistenti

Le 7 attivita' della versione precedente (umido, lavatrice, panni cucina/tappetino, pavimenti, superfici,
ordine, bagno) non hanno una casa: la **prima casa creata con `/start` le adotta** e i loro cicli ripartono da quel momento.

## Setup locale (Node, polling)

```bash
cp .env.example .env   # inserisci BOT_TOKEN
npm install
npm run dev
```

Le migrazioni in `migrations/` vengono applicate in automatico all'avvio sul file SQLite (`DATABASE_PATH`).

## Deploy automatico

Ogni push su `main` fa partire [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
test e build, poi `wrangler d1 migrations apply` e `wrangler deploy`. Servono due secret del repository:
`CLOUDFLARE_API_TOKEN` (token con permessi Workers Scripts:Edit e D1:Edit) e `CLOUDFLARE_ACCOUNT_ID`.
I secret del Worker (`BOT_TOKEN`, `WEBHOOK_SECRET`) restano su Cloudflare e non passano da GitHub.

## Deploy Cloudflare manuale (Workers + D1)

```bash
npm run cf:d1:migrate   # applica le migrazioni nuove (0020 case, 0021 ripristino, 0022 assegnazione)
npm run cf:deploy
```

`BOT_PAUSED = "true"` in `wrangler.toml` tiene il bot spento (nessun messaggio, webhook ignorato):
impostalo a `"false"` quando vuoi attivarlo. Dopo il deploy apri `/setup` una volta per registrare i comandi.
Servono i secret `BOT_TOKEN` e `WEBHOOK_SECRET`.

## Test

```bash
npm test
npm run build
```

## Contribuire

Le modifiche arrivano tramite fork + Pull Request: vedi [CONTRIBUTING.md](CONTRIBUTING.md) (o la pagina `/contribuisci`
del portale). Regole e struttura per gli assistenti AI sono in [AGENTS.md](AGENTS.md). Anteprima del portale con dati
finti: `npm run preview`.

## Licenza

[MIT](LICENSE)
