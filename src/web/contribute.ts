export type ContributePageOptions = {
  repoUrl: string;
};

/** Prompt da incollare nell'assistente AI: lo porta a leggere le regole del progetto prima di toccare il codice. */
export const contributorPrompt = [
  "Sto lavorando su ShameBot, un bot Telegram per le faccende di casa tra coinquilini (TypeScript, grammY, Cloudflare Workers + D1). Prima di tutto leggi AGENTS.md e README.md.",
  "",
  "Vorrei: <descrivi qui la modifica>",
  "",
  "Lavora su un branch nuovo e fai modifiche piccole. Aggiungi o aggiorna i test, poi esegui npm test e npm run build finche' passano. Se tocchi il portale fammelo vedere con npm run preview.",
  "",
  "Alla fine spiegami cosa hai cambiato e aiutami ad aprire una Pull Request verso il repository originale.",
].join("\n");

/** Pagina pubblica "Migliora il bot": come proporre modifiche con l'aiuto di un LLM, via fork + Pull Request. */
export function renderContributePage({ repoUrl }: ContributePageOptions): string {
  const repo = escapeHtml(repoUrl);
  const repoPath = escapeHtml(repoUrl.replace(/^https:\/\/github\.com\//, ""));
  const repoName = escapeHtml(repoUrl.split("/").pop() || "shamebot");

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Migliora ShameBot</title>
<link rel="icon" href="/favicon.png">
<style>
  :root {
    --bg: #f5f4f1; --card: #ffffff; --text: #1d1d1f; --muted: #6b6b70; --line: #e4e2dc;
    --accent: #2f6f5e; --accent-text: #ffffff; --code: #efede8;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #151618; --card: #202226; --text: #f0f0f2; --muted: #9a9aa2; --line: #31343a; --accent: #5fb89f; --accent-text: #0c1512; --code: #16171a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 16px 16px 64px; }
  a { color: var(--accent); }
  .back { display: inline-block; font-size: .9rem; text-decoration: none; margin: 4px 0 12px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .lead { color: var(--muted); margin: 0 0 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin: 10px 0; }
  .step { display: grid; grid-template-columns: 28px 1fr; gap: 10px; }
  .num { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: var(--accent-text); font-weight: 700; display: grid; place-items: center; font-size: .9rem; }
  h2 { font-size: 1rem; margin: 2px 0 6px; }
  p { margin: 6px 0; }
  .muted { color: var(--muted); font-size: .9rem; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85rem; }
  pre { background: var(--code); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 8px 0; white-space: pre-wrap; word-break: break-word; }
  code { background: var(--code); padding: 1px 5px; border-radius: 5px; }
  .prompt-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; }
  button, .button { font: inherit; font-size: .9rem; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 7px 12px; cursor: pointer; text-decoration: none; display: inline-block; }
  .primary { background: var(--accent); color: var(--accent-text); border-color: transparent; font-weight: 600; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
</style>
</head>
<body>
<main>
  <a class="back" href="/">&larr; Torna alla casa</a>
  <h1>Migliora il bot</h1>
  <p class="lead">ShameBot e' open source. Se hai un'idea puoi realizzarla tu, anche senza essere un programmatore:
  ti fai aiutare da un assistente AI e poi proponi la modifica. Se va bene la unisco e va online da sola.</p>

  <div class="card">
    <h2>Cosa ti serve</h2>
    <ul>
      <li>Un account <a href="https://github.com/signup" target="_blank" rel="noopener">GitHub</a></li>
      <li><a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a> 22 o piu' recente e <code>git</code></li>
      <li>Un assistente AI che lavora sul codice (Claude Code, Cursor, Codex...)</li>
    </ul>
  </div>

  <div class="card step">
    <div class="num">1</div>
    <div>
      <h2>Fai il fork e clonalo</h2>
      <p>Il fork e' la tua copia personale del progetto: li' puoi cambiare tutto senza toccare il bot vero.</p>
      <p><a class="button primary" href="${repo}/fork" target="_blank" rel="noopener">Crea il fork su GitHub</a></p>
      <pre>git clone https://github.com/TUO-UTENTE/${repoName}
cd ${repoName}
npm install</pre>
    </div>
  </div>

  <div class="card step">
    <div class="num">2</div>
    <div>
      <h2>Chiedi al tuo assistente</h2>
      <p>Apri la cartella con l'assistente e incolla questo messaggio, scrivendo al posto giusto cosa vuoi cambiare.
      Nel progetto c'e' <code>AGENTS.md</code> con tutte le regole: l'assistente lo legge e sa come muoversi.</p>
      <div class="prompt-head"><span class="muted">Prompt da copiare</span><button id="copy" class="primary" type="button">Copia</button></div>
      <pre id="prompt">${escapeHtml(contributorPrompt)}</pre>
    </div>
  </div>

  <div class="card step">
    <div class="num">3</div>
    <div>
      <h2>Prova le modifiche</h2>
      <pre>npm test          # i test devono passare
npm run preview   # il portale con dati finti, su http://localhost:8790</pre>
      <p class="muted">Per provare i comandi su Telegram crea un tuo bot di prova con @BotFather, metti il suo token in
      <code>.env</code> (vedi <code>.env.example</code>) e avvia <code>npm run dev</code>. Non usare il token del bot vero.</p>
    </div>
  </div>

  <div class="card step">
    <div class="num">4</div>
    <div>
      <h2>Apri una Pull Request</h2>
      <p>Fai push sul tuo fork e apri una Pull Request verso <a href="${repo}" target="_blank" rel="noopener">${repoPath}</a>.
      I test partono da soli; io la guardo e, se va, la unisco: da li' il bot si aggiorna in automatico.</p>
      <p class="muted">Per domande o idee puoi anche aprire una <a href="${repo}/issues" target="_blank" rel="noopener">issue</a>.</p>
    </div>
  </div>
</main>
<script>
  document.getElementById("copy").addEventListener("click", function () {
    var button = this;
    var text = document.getElementById("prompt").textContent;
    function done(label) { button.textContent = label; setTimeout(function () { button.textContent = "Copia"; }, 2000); }
    function fallback() {
      var range = document.createRange(); range.selectNodeContents(document.getElementById("prompt"));
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      done(ok ? "Copiato!" : "Selezionato: copia a mano");
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done("Copiato!"); }, fallback);
    else fallback();
  });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
