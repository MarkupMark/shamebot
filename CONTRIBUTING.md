# Come contribuire

Hai un'idea per ShameBot? Puoi realizzarla anche senza essere un programmatore, facendoti aiutare da un
assistente AI (Claude Code, Cursor, Codex...). La stessa guida è sul sito, alla pagina `/contribuisci`.

## 1. Fork e clone

Fai il fork da GitHub (pulsante **Fork** in alto a destra), poi:

```bash
git clone https://github.com/TUO-UTENTE/shamebot
cd shamebot
npm install
```

Servono Node.js 22+ e git.

## 2. Chiedi al tuo assistente

Apri la cartella con l'assistente. Il file [AGENTS.md](AGENTS.md) contiene struttura e regole del progetto,
e gli assistenti lo leggono da soli. Puoi partire da questo messaggio:

> Sto lavorando su ShameBot, un bot Telegram per le faccende di casa tra coinquilini (TypeScript, grammY,
> Cloudflare Workers + D1). Prima di tutto leggi AGENTS.md e README.md.
> Vorrei: *descrivi qui la modifica*.
> Lavora su un branch nuovo e fai modifiche piccole. Aggiungi o aggiorna i test, poi esegui npm test e npm run build
> finché passano. Se tocchi il portale fammelo vedere con npm run preview. Alla fine spiegami cosa hai cambiato
> e aiutami ad aprire una Pull Request verso il repository originale.

## 3. Prova

```bash
npm test
npm run build
npm run preview   # portale con dati finti su http://localhost:8790
```

Per provare i comandi su Telegram crea un **tuo bot di prova** con [@BotFather](https://t.me/BotFather),
copia `.env.example` in `.env`, metti lì il token del bot di prova e avvia `npm run dev`.
Aggiungilo a un gruppo di prova e scrivi `/start`. Non usare il token del bot vero.

## 4. Pull Request

Fai push sul tuo fork e apri una Pull Request verso `MarkupMark/shamebot`. I test partono in automatico.
Se la PR viene unita, il bot si aggiorna da solo.
