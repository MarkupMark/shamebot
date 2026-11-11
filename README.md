# ShameBot

Bot Telegram per coinquilini: le faccende di casa vivono in un gruppo Telegram, il bot ricorda cosa va fatto
e tiene un registro di chi ha fatto cosa. La "vergogna" e' solo interna alla casa: nessuno fuori dal gruppo viene coinvolto.


## Come funziona

- **Una casa = un gruppo Telegram.** Aggiungi il bot al gruppo e scrivi `/start`: nasce la casa.
  Ogni persona che usa un comando nel gruppo entra tra i coinquilini.
- **Attivita' condivise.** Ognuna ha nome, frequenza e gravita' (`poco importante`, `medio`, `importante`).
  Chiunque nella casa puo' aggiungerle, modificarle, eliminarle e segnarle come fatte.
  Una modifica non fa mai scattare un ritardo: se si accorcia la frequenza la nuova scadenza e' al massimo
  un ciclo da adesso (mai oltre la vecchia), e chi era gia' in ritardo non riceve un secondo avviso.
- **Promemoria nel gruppo.** 3 ore e 30 minuti prima della scadenza, poi un messaggio a scadenza avvenuta.
  Per `medio` e `importante` c'e' un secondo sollecito dopo 2 giorni / 1 giorno di ritardo.
  I messaggi citano chi ha fatto l'attivita' l'ultima volta.
- **Assegnazione.** Ogni attivita' puo' toccare a: *chiunque* (predefinito), *solo un utente*, *a turno*
  (passa al prossimo della lista a ogni "Fatto") oppure *personalizzato*: una lista di turni, ognuno con una persona
  e un periodo (un giorno specifico, entro una settimana, entro un mese). Il turno aperto con la scadenza piu' vicina
  decide a chi tocca e quando scade; finiti i turni l'attivita' torna a chiunque con la frequenza normale.
  Promemoria ed elenco nel gruppo mostrano a chi tocca. Si imposta dal portale.
- **Turni.** Per le attivita' *a turno* l'editor mostra l'ordine (il primo e' di turno ora): si riordina con ↑ ↓
  o con "Inverti ordine". Dal pulsante 🔄 sulla card un coinquilino chiede a un altro della rotazione di scambiarsi il
  turno; nel gruppo compaiono "✅ Accetto" / "❌ Rifiuto" (risponde solo chi l'ha ricevuta, anche dal portale).
  Se accetta, i due si invertono nella rotazione. Chi ha chiesto puo' annullare finche' non c'e' risposta.
- **Ordine delle attivita'.** Nella scheda Attivita' ognuno sceglie come vederle: *Tutte* (per scadenza), *Prima le mie* (tue, di chiunque, degli altri)
  o *Mie + chiunque* (tue e di chiunque insieme, poi gli altri). La scelta resta salvata nel browser.
- **Fuori casa.** Dal portale (scheda Membri) o con `/fuori` un coinquilino dice "🧳 Sono fuori casa"; nel gruppo compare la richiesta con il pulsante
  "✅ Confermo" e serve l'ok di un **altro** coinquilino (dal gruppo o dal portale). Da quel momento le attivita' che
  toccano a lui sono in pausa: niente promemoria, avvisi o insulti. Al rientro (lo segna lui o chiunque, dal portale o con `/rientro [nome]`) le
  attivita' scadute mentre era via vanno fatte entro la fine di quel giorno, le altre slittano di tutto il tempo in cui
  e' stato fuori. Le attivita' di "chiunque" non vanno in pausa.
- **Insulti segreti.** Ogni coinquilino scrive dal portale (scheda Messaggi) i suoi insulti per attivita' poco importanti,
  medie e importanti: li vede solo lui. Quando un'attivita' scade, e al sollecito, il bot ne aggiunge uno a caso tra
  quelli scritti dagli **altri**, mai da chi lo riceve. Se nessuno ne ha scritti usa quelli predefiniti.
  `{nome}` diventa chi la doveva fare («ragazzi» se tocca a chiunque), `{attivita}` il nome dell'attivita'.
- **Promemoria giornalieri.** ☀️ *Buongiorno* (cosa e' in ritardo, cosa scade oggi e cosa scade domani, poi
  "se vuoi fare altro oggi" con le prossime 3 attivita' in scadenza; predefinito alle 9:00, attivo) e 🌙 *Riepilogo serale* (cosa dovrai fare
  domani; predefinito alle 21:00, spento). Dalla scheda Messaggi del portale si accendono, si sceglie l'ora e si personalizza
  la frase iniziale: l'elenco sotto e' sempre automatico. Partono una volta al giorno e, se non c'e' niente da segnalare,
  di default non partono.
- **Registro.** Ogni attivita' fatta, creata, modificata o eliminata finisce nel log (`/log` o portale).
- **Login al portale.** "Accedi con Telegram" mostra un codice di 6 cifre (valido 10 minuti): lo si invia al bot in
  chat privata (da solo o con `/login 123456`, anche dal telefono) e il sito entra da solo. Il link diretto al bot
  conferma da solo solo se la chat non era gia' avviata, per questo serve il codice.
- **Centro di comando.** La pagina `/admin` (non linkata dal portale, serve lo stesso login) sposta in blocco la
  scadenza delle attivita' scelte di N giorni, avanti o indietro. Ogni spostamento finisce nel registro.
- **Avvisi sulle modifiche.** Quando si crea o modifica un'attivita' il bot puo' avvisare il gruppo
  (es. `✏️ Luca · Lavare il bagno` / `frequenza 1×/sett → 2×/sett`). I messaggi del bot sono volutamente brevi.
  Valore predefinito per casa con `/notifiche on|off`; per la singola azione c'e' la spunta nel portale
  o `| silenzioso` in fondo al comando.

## Comandi (nel gruppo)

| Comando | Cosa fa |
| --- | --- |
| `/start` | Attiva la casa per questo gruppo |
| `/attivita` | Le 5 attivita' piu' urgenti ("Mostra altre" per tutte) |
| `/fatto [n]` | Segna come fatta (senza numero mostra i pulsanti) |
| `/nuova nome \| frequenza \| gravita'` | Es. `/nuova Pulire il bagno \| 2 volte a settimana \| importante` |
| `/modifica n \| nome \| frequenza \| gravita'` | `-` lascia invariato un campo |
| `/elimina n` | Elimina un'attivita' |
| `/log [n]` | Ultime attivita' svolte e modifiche |
| `/fuori` | Sei fuori casa: un altro coinquilino conferma col pulsante, poi le tue attivita' vanno in pausa |
| `/rientro [nome]` | Rientro (tuo o di un coinquilino): sposta le scadenze |
| `/notifiche on\|off` | Avvisi sulle modifiche |
| `/membri`, `/casa`, `/app`, `/help` | Info e aiuto |

Frequenze accettate: `3 giorni`, `1 settimana`, `12 ore`, `2 volte a settimana`, `3 volte al mese`.

Digitando `/` Telegram mostra il menu dei comandi (diverso in chat privata e nel gruppo); `/start` e `/help` nel gruppo
aggiungono i pulsanti rapidi Attività, Fatto e Log. Dopo ogni deploy che cambia i comandi apri `/setup` una volta.

`/attivita` mostra un elenco puntato compatto (nome · entro quando) con le 5 attivita' piu' vicine alla scadenza;
il pulsante "Mostra altre" apre l'elenco completo. I numeri di `/fatto`, `/modifica` e `/elimina` sono la posizione
nell'elenco, contando dall'alto.

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
npm run cf:d1:migrate   # applica le migrazioni nuove
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
