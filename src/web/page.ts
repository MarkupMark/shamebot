export type AppTemplateOptions = {
  botUsername: string;
  siteUrl: string;
};

/**
 * Portale della casa: una sola pagina (login Telegram, attivita', registro, coinquilini).
 * Il codice client evita template literal e backslash per poter vivere dentro questa stringa.
 */
export function renderAppPage({ botUsername }: AppTemplateOptions): string {
  return PAGE_TEMPLATE.replace("__BOT_USERNAME__", JSON.stringify(botUsername));
}

const PAGE_TEMPLATE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ShameBot - La casa</title>
<link rel="icon" href="/favicon.png">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: #f5f4f1; --card: #ffffff; --text: #1d1d1f; --muted: #6b6b70; --line: #e4e2dc;
    --accent: #2f6f5e; --accent-text: #ffffff; --ok: #2f6f5e; --warn: #b7791f; --late: #c0392b;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #151618; --card: #202226; --text: #f0f0f2; --muted: #9a9aa2; --line: #31343a; --accent: #5fb89f; --accent-text: #0c1512; --ok: #5fb89f; --warn: #e0a84a; --late: #ef7b6f; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.4 -apple-system, system-ui, "Segoe UI", sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 16px 16px 80px; }
  h1 { font-size: 1.4rem; margin: 8px 0 4px; }
  h2 { font-size: 1.05rem; margin: 20px 0 8px; }
  .muted { color: var(--muted); font-size: .9rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 10px 0; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; min-width: 0; }
  button, select, input[type=text], input[type=number] { font: inherit; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 9px 12px; }
  button { cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-text); border-color: transparent; font-weight: 600; }
  button.danger { color: var(--late); }
  button.ghost { background: transparent; }
  .login-code { font-size: 32px; font-weight: 700; letter-spacing: 6px; text-align: center; margin: 8px 0; font-variant-numeric: tabular-nums; user-select: all; }
  input[type=text] { width: 100%; }
  input[type=number] { width: 80px; }
  nav { display: flex; gap: 6px; margin: 12px 0; }
  nav button { flex: 1; }
  nav button.minor { flex: 0 0 auto; background: transparent; color: var(--muted); font-size: .85rem; padding: 9px 10px; }
  nav button.minor.active { background: var(--card); color: var(--text); border-color: var(--line); }
  @media (max-width: 480px) { nav button.minor .lbl { display: none; } }
  .member { display: flex; align-items: center; gap: 8px; }
  .member .grow small { color: var(--muted); font-size: .8rem; margin-left: 4px; }
  .badge { font-size: .75rem; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
  .badge.out { border-color: var(--warn); color: var(--warn); }
  nav button.active { background: var(--accent); color: var(--accent-text); border-color: transparent; }
  .task-name { font-weight: 600; }
  .group-title { font-size: .8rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin: 14px 2px 2px; }
  .card.task { padding: 10px 12px; margin: 8px 0; }
  .row.tight { gap: 6px; flex-wrap: nowrap; }
  .task-meta { margin-top: 1px; font-size: .85rem; }
  .task-foot { margin-top: 8px; }
  .task-foot .grow { font-size: .9rem; }
  .task-foot button { padding: 5px 12px; }
  .task-foot button.icon { padding: 5px 8px; }
  .due-ok { color: var(--ok); } .due-soon { color: var(--warn); } .due-late { color: var(--late); font-weight: 600; }
  .tag { font-size: .75rem; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--line); color: var(--muted); }
  .tag.high { color: var(--late); border-color: var(--late); }
  label.check { display: flex; gap: 8px; align-items: center; font-size: .92rem; }
  .error { color: var(--late); margin: 8px 0; }
  .hidden { display: none; }
  ul.plain { list-style: none; margin: 0; padding: 0; }
  ul.plain li { padding: 8px 0; border-bottom: 1px solid var(--line); }
  ul.plain li:last-child { border-bottom: 0; }
  input[type=date] { font: inherit; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 8px 10px; }
  .who { font-size: .78rem; padding: 2px 8px; border-radius: 99px; background: var(--bg); color: var(--muted); white-space: nowrap; }
  .who.me { background: var(--accent); color: var(--accent-text); font-weight: 600; }

  /* ---- Timeline scadenze ---- */
  .digest-top { display: flex; align-items: center; gap: 10px; }
  .digest-top .title { flex: 1; font-weight: 600; }
  .digest-top input[type=time] { font: inherit; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 6px 8px; }
  .digest.off .digest-body { opacity: .5; }
  .switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; }
  .switch input { opacity: 0; width: 0; height: 0; position: absolute; }
  .switch span { position: absolute; inset: 0; background: var(--line); border-radius: 99px; transition: background .2s; cursor: pointer; }
  .switch span:before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
  .switch input:checked + span { background: var(--accent); }
  .switch input:checked + span:before { transform: translateX(18px); }
  .bubble { background: var(--bg); border: 1px solid var(--line); border-radius: 12px 12px 12px 4px; padding: 10px 12px; white-space: pre-wrap; font-size: .88rem; line-height: 1.45; margin-top: 6px; }
  .bubble-label { font-size: .75rem; color: var(--muted); margin-top: 10px; }
  .insult-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .insult-row input { flex: 1; min-width: 0; }
  .insult-row button { padding: 6px 10px; }
  .insult-item { margin-top: 10px; }
  .tokens { display: flex; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
  .tokens button { font-size: .78rem; padding: 3px 10px; border-radius: 99px; color: var(--muted); }
  .bubble.empty { color: var(--muted); font-style: italic; }
  .head { align-items: flex-start; flex-wrap: nowrap; }
  .head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; margin-top: 10px; }
  .head-side select { max-width: 150px; }
  .contrib { font-size: .78rem; color: var(--muted); text-decoration: none; padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--card); white-space: nowrap; }
  .contrib:hover { color: var(--accent); border-color: var(--accent); }
  .dl { padding: 14px 14px 8px; }
  .dl-title { font-weight: 700; font-size: 1rem; }
  .dl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .dl-group { display: flex; justify-content: space-between; gap: 8px; font-size: .74rem; font-weight: 700; color: var(--text); margin: 14px 0 2px; text-transform: uppercase; letter-spacing: .03em; }
  .dl-group span:last-child { font-weight: 500; color: var(--muted); text-transform: none; letter-spacing: 0; }
  .dl-group.late, .dl-group.late span:last-child { color: var(--late); }
  .dl-group.soft span:first-child { color: var(--muted); }
  .dl-row { padding: 8px 0; border-bottom: 1px solid var(--line); }
  .dl-row:last-child { border-bottom: 0; }
  .dl-row.done .dl-name { color: var(--muted); font-weight: 500; }
  .dl-line { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .dl-name { min-width: 0; font-size: .92rem; font-weight: 600; line-height: 1.2; }
  .dl-name small { display: block; font-size: .74rem; font-weight: 400; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-who { flex-shrink: 0; font-size: .76rem; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--line); white-space: nowrap; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
  .dl-who.me { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .dl-who.late { border-color: var(--late); color: var(--late); font-weight: 600; }
  .dl-who.late.me { background: var(--late); color: #fff; }
  .dl-who.soft { border-style: dashed; color: var(--muted); }
  .dl-who.soft.me { background: transparent; color: var(--accent); border-color: var(--accent); }
  .dl-track { height: 4px; border-radius: 2px; background: var(--line); margin-top: 7px; overflow: hidden; }
  .dl-track i { display: block; height: 100%; border-radius: 2px; transition: width .4s ease; }
  .dl-track i.ok { background: var(--ok); }
  .dl-track i.soon { background: var(--warn); }
  .dl-track i.urgent { background: var(--late); }
  .dl-more { display: block; width: 100%; margin-top: 8px; font-size: .82rem; padding: 6px; color: var(--muted); }
  .dl-empty { color: var(--muted); font-size: .9rem; padding: 6px 0; }
  .seg { display: inline-flex; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 2px; }
  .seg button { border: 0; background: transparent; padding: 5px 11px; font-size: .85rem; border-radius: 8px; color: var(--muted); }
  .seg button.on { background: var(--card); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
  .away { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); margin: 8px 0; font-size: .9rem; }
  .away .grow small { display: block; color: var(--muted); font-size: .78rem; }
  .away.pending { border-color: var(--warn); }
  .away button { padding: 6px 12px; font-size: .85rem; white-space: nowrap; }
  .due-paused { color: var(--muted); font-weight: 600; }

  /* ---- Assegnazione ---- */
  .assign { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 10px; }
  .assign-title { font-size: .85rem; color: var(--muted); margin-bottom: 6px; }
  .modes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .modes button { font-size: .85rem; padding: 7px 8px; text-align: left; }
  .modes button.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); font-weight: 600; }
  .modes small { display: block; color: var(--muted); font-weight: 400; font-size: .72rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip { border-radius: 99px; padding: 5px 12px; font-size: .85rem; }
  .chip.on { background: var(--accent); color: var(--accent-text); border-color: transparent; }
  ol.turns { list-style: none; margin: 10px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  ol.turns li { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 10px; border-bottom: 1px solid var(--line); font-size: .92rem; }
  ol.turns li:last-child { border-bottom: 0; }
  ol.turns li small { color: var(--accent); font-size: .75rem; font-weight: 600; margin-left: 6px; }
  ol.turns .turn-n { width: 22px; height: 22px; border-radius: 50%; background: var(--bg); color: var(--muted); font-size: .75rem; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  ol.turns li:first-child .turn-n { background: var(--accent); color: var(--accent-text); font-weight: 700; }
  ol.turns button { padding: 4px 10px; }
  .swap-pick { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .swap-note { font-size: .8rem; margin-top: 6px; }
  .slot { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; margin-top: 8px; }
  .slot select, .slot input { width: 100%; min-width: 0; }
  .slot .slot-foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; font-size: .78rem; color: var(--muted); }
  @media (max-width: 420px) { .modes { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main id="root"><p class="muted">Caricamento...</p></main>
<script>
(function () {
  var BOT_USERNAME = __BOT_USERNAME__;
  var savedOrder = null, savedDlMine = null;
  try { savedOrder = localStorage.getItem("taskOrder"); savedDlMine = localStorage.getItem("dlMine"); } catch (e) {}
  var state = { me: null, houseId: null, data: null, tab: "tasks", editing: null, adding: false, error: "",
    order: savedOrder === "mine" || savedOrder === "mineany" ? savedOrder : "all", tlExpanded: false, dlMine: savedDlMine === "1", swapPicking: null, digestDraft: {}, insultDraft: {}, insultSev: "high" };
  var root = document.getElementById("root");
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (key) {
      if (key === "class") el.className = a[key];
      else if (key.indexOf("on") === 0) el.addEventListener(key.slice(2), a[key]);
      else if (a[key] !== false && a[key] !== null && a[key] !== undefined) el.setAttribute(key, a[key] === true ? "" : a[key]);
    });
    function add(child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) { child.forEach(add); return; }
      el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) { var err = new Error(json.error || "Errore"); err.status = res.status; throw err; }
        return json;
      });
    });
  }

  function fail(err) { state.error = err.message || "Errore"; render(); }

  // ---------- Login ----------
  function renderLogin(message) {
    root.replaceChildren(
      h("h1", {}, "ShameBot"),
      h("p", { class: "muted" }, "Le faccende di casa, tra coinquilini."),
      h("div", { class: "card" },
        h("p", {}, "Accedi con Telegram per vedere le attivita' della tua casa."),
        h("button", { class: "primary", onclick: startBotLogin }, "Accedi con Telegram"),
        message ? h("p", { class: "muted" }, message) : null
      )
    );
  }

  function startBotLogin() {
    var popup = window.open("", "_blank");
    api("POST", "/auth/telegram/request").then(function (res) {
      var url = res.request.botUrl;
      if (popup) popup.location = url; else window.location.href = url;
      renderLoginWaiting(url, res.request.code);
      pollLogin(res.request.token, 0);
    }).catch(function (err) { renderLogin(err.message); });
  }

  function renderLoginWaiting(url, code) {
    root.replaceChildren(
      h("h1", {}, "ShameBot"),
      h("p", { class: "muted" }, "Le faccende di casa, tra coinquilini."),
      h("div", { class: "card" },
        h("p", {}, "Per entrare, scrivi questo codice al bot su Telegram:"),
        h("p", { class: "login-code" }, code || "------"),
        h("ol", {},
          h("li", {}, "Apri la chat con il bot (anche dal telefono)"),
          h("li", {}, "Invia il codice qui sopra come messaggio"),
          h("li", {}, "Quando il bot risponde «Login approvato» entri da solo")
        ),
        h("button", { class: "primary", onclick: function () { window.open(url, "_blank"); } }, "Apri il bot"),
        h("p", { class: "muted" }, "In attesa della conferma... Il codice vale 10 minuti.")
      )
    );
  }

  function pollLogin(token, attempts) {
    if (attempts > 300) { renderLogin("Richiesta scaduta, riprova."); return; }
    setTimeout(function () {
      api("GET", "/auth/telegram/request?token=" + encodeURIComponent(token)).then(function (res) {
        var status = res.request.status;
        if (status === "approved") {
          return api("POST", "/auth/telegram/claim", { token: token }).then(boot);
        }
        if (status === "expired" || status === "missing") { renderLogin("Richiesta scaduta, riprova."); return; }
        pollLogin(token, attempts + 1);
      }).catch(function () { pollLogin(token, attempts + 1); });
    }, 2000);
  }

  // ---------- Dati ----------
  function boot() {
    return api("GET", "/api/me").then(function (me) {
      state.me = me;
      if (!me.houses.length) { render(); return; }
      var saved = null;
      try { saved = Number(localStorage.getItem("house")); } catch (e) {}
      var found = me.houses.filter(function (x) { return x.id === saved; })[0];
      state.houseId = (found || me.houses[0]).id;
      return loadHouse();
    }).catch(function (err) {
      if (err.status === 401) {
        if (tg && tg.initData) {
          api("POST", "/auth/telegram/miniapp", { initData: tg.initData }).then(boot).catch(function (e) { renderLogin(e.message); });
        } else { renderLogin(); }
      } else { fail(err); }
    });
  }

  function loadHouse() {
    return api("GET", "/api/houses/" + state.houseId).then(function (data) {
      state.data = data; state.error = ""; render();
    }).catch(fail);
  }

  // ---------- Utilita' ----------
  var HOUR = 3600000, DAY = 24 * HOUR, WEEK = 7 * DAY;
  var FREQUENCIES = [
    { label: "Ogni giorno", value: "1 giorno", ms: DAY },
    { label: "3 volte a settimana", value: "3 volte a settimana", ms: Math.round(WEEK / 3) },
    { label: "2 volte a settimana", value: "2 volte a settimana", ms: Math.round(WEEK / 2) },
    { label: "Ogni settimana", value: "1 settimana", ms: WEEK },
    { label: "Ogni 2 settimane", value: "2 settimane", ms: 2 * WEEK },
    { label: "Ogni mese", value: "30 giorni", ms: 30 * DAY }
  ];
  function intervalToInput(ms) {
    if (ms % WEEK === 0) return { n: ms / WEEK, unit: "settimane" };
    if (ms % DAY === 0) return { n: ms / DAY, unit: "giorni" };
    return { n: Math.max(1, Math.round(ms / HOUR)), unit: "ore" };
  }
  function duration(ms) {
    var m = Math.max(1, Math.round(Math.abs(ms) / 60000));
    var d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d > 0) return d + "g " + hh + "h";
    if (hh > 0) return hh + "h " + mm + "m";
    return mm + "m";
  }
  function dueInfo(task) {
    var left = new Date(task.dueAt).getTime() - Date.now();
    if (left < 0) return { cls: "due-late", text: "In ritardo di " + duration(left) };
    if (isClosed(task, Date.now())) return { cls: "due-ok", text: "✓ Fatta · si riapre " + dayLabel(new Date(task.startAt).getTime()), closed: true };
    var text = task.intervalMs < DAY ? "Entro " + duration(left) : "Entro " + dayLabel(new Date(task.dueAt).getTime() - 1);
    return { cls: left < DAY ? "due-soon" : "due-ok", text: text };
  }
  var SEVERITY = { low: "poco importante", medium: "medio", high: "importante" };
  function when(iso) {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function memberName(id) {
    var m = state.data.members.filter(function (x) { return x.id === id; })[0];
    return m ? m.displayName : "?";
  }
  function whoLabel(task) {
    if (task.assigneeId === null || task.assigneeId === undefined) return "chiunque";
    return task.assigneeId === state.data.viewerId ? "tocca a te" : task.assigneeName;
  }

  // ---------- Prossime scadenze: attivita' raggruppate per scadenza ----------
  var WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  var MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  function dayLabel(t) {
    var d = new Date(t);
    var other = d.getMonth() !== new Date().getMonth();
    return WEEKDAYS[d.getDay()] + " " + d.getDate() + (other ? " " + MONTHS[d.getMonth()] : "");
  }

  function shortLeft(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return Math.max(1, m) + "m";
    var hrs = Math.round(m / 60);
    if (hrs < 48) return hrs + "h";
    return Math.round(hrs / 24) + "g";
  }

  /** Periodi fissi: prima di startAt l'attivita' e' gia' fatta per questo periodo (si riapre a startAt). */
  function isClosed(task, now) { return !task.paused && new Date(task.startAt).getTime() > now; }

  /** "entro dom 15" (scadenza a fine giornata) oppure "entro le 18:00" per le attivita' di poche ore. */
  function deadlineText(task) {
    var due = new Date(task.dueAt).getTime();
    if (task.intervalMs < DAY) return "entro le " + new Date(due).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return "entro " + dayLabel(due - 1);
  }

  /** Gruppi in ordine: oggi, entro domenica, settimana prossima, fine mese, piu' avanti. */
  function dueGroups(now) {
    var today = startOfDay(now);
    var endToday = addDays(today, 1);
    var weekday = new Date(now).getDay();
    var endWeek = addDays(today, weekday === 0 ? 1 : 8 - weekday);
    var endNext = addDays(endWeek, 7);
    var d = new Date(now);
    var endMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    var list = [
      { key: "today", end: endToday, title: "Oggi", hint: "entro stasera", urgent: true },
      { key: "week", end: endWeek, title: "Entro domenica", hint: dayLabel(endWeek - 1), urgent: true },
      { key: "next", end: endNext, title: "Entro " + dayLabel(endNext - 1), hint: "settimana prossima" },
      { key: "month", end: endMonth, title: "Entro fine mese", hint: dayLabel(endMonth - 1) }
    ].sort(function (a, b) { return a.end - b.end; });
    var out = [], last = now;
    list.forEach(function (g) { if (g.end > last) { out.push(g); last = g.end; } });
    out.push({ key: "later", end: Infinity, title: "Piu' avanti", hint: "" });
    return out;
  }

  function dueRow(task, now, kind) {
    var due = new Date(task.dueAt).getTime();
    var start = new Date(task.startAt).getTime();
    var mine = task.assigneeId === state.data.viewerId;
    var chipCls = "dl-who" + (mine ? " me" : "") + (kind === "late" ? " late" : kind === "soft" || kind === "done" ? " soft" : "");
    var sub = kind === "late" ? "in ritardo di " + shortLeft(due - now)
      : kind === "paused" ? "in pausa · fuori casa"
      : kind === "done" ? "fatta" + (task.lastCompletedByName ? " da " + task.lastCompletedByName : "") + " · si riapre " + dayLabel(start)
      : task.frequency + " · " + deadlineText(task);
    var row = h("div", { class: "dl-row" + (kind === "done" ? " done" : ""), title: task.name + " - scade " + when(task.dueAt) },
      h("div", { class: "dl-line" },
        h("div", { class: "dl-name" }, (kind === "done" ? "✓ " : "") + task.name, h("small", {}, sub)),
        h("span", { class: chipCls }, whoLabel(task))
      )
    );
    if (kind !== "late" && kind !== "paused" && kind !== "done") {
      var frac = due > start ? Math.min(1, Math.max(0, (now - start) / (due - start))) : 1;
      var left = due - now;
      var cls = left < DAY ? "urgent" : left < 3 * DAY || frac > 0.7 ? "soon" : "ok";
      row.appendChild(h("div", { class: "dl-track" }, h("i", { class: cls, style: "width:" + Math.max(3, frac * 100) + "%" })));
    }
    return row;
  }

  function viewTimeline() {
    var now = Date.now();
    var tasks = state.data.tasks.slice().sort(function (a, b) { return new Date(a.dueAt) - new Date(b.dueAt); });
    // "Solo mie": solo le attivita' che toccano a chi guarda (non quelle di chiunque).
    if (state.dlMine) tasks = tasks.filter(function (t) { return t.assigneeId === state.data.viewerId; });
    var late = tasks.filter(function (t) { return !t.paused && new Date(t.dueAt).getTime() < now; });
    var paused = tasks.filter(function (t) { return t.paused; });
    var mineCount = tasks.filter(function (t) { return !t.paused && !isClosed(t, now) && t.assigneeId === state.data.viewerId && new Date(t.dueAt).getTime() < addDays(now, 7); }).length;
    var subtitle = late.length ? late.length + " in ritardo" : "Niente in ritardo";
    if (mineCount) subtitle += " · " + mineCount + " tocca" + (mineCount === 1 ? "" : "no") + " a te questa settimana";

    var seg = h("div", { class: "seg", role: "tablist" });
    [[false, "Tutte"], [true, "Solo mie"]].forEach(function (o) {
      seg.appendChild(h("button", { class: state.dlMine === o[0] ? "on" : "", "aria-pressed": state.dlMine === o[0] ? "true" : "false", onclick: function () {
        state.dlMine = o[0]; state.tlExpanded = false;
        try { localStorage.setItem("dlMine", o[0] ? "1" : "0"); } catch (e) {}
        render();
      } }, o[1]));
    });
    var card = h("div", { class: "card dl" },
      h("div", { class: "dl-head" },
        h("div", {}, h("div", { class: "dl-title" }, "Prossime scadenze"), h("div", { class: "muted", style: "font-size:.8rem" }, subtitle)),
        seg
      )
    );
    if (!tasks.length) {
      card.appendChild(h("div", { class: "dl-empty" }, state.dlMine ? "Niente che tocchi a te 🎉" : "Nessuna attivita' da mostrare."));
      return card;
    }

    function group(title, hint, cls, rows) {
      if (!rows.length) return;
      card.appendChild(h("div", { class: "dl-group" + (cls ? " " + cls : "") }, h("span", {}, title), h("span", {}, hint)));
      rows.forEach(function (r) { card.appendChild(r); });
    }

    group("In ritardo", late.length === 1 ? "1 attivita'" : late.length + " attivita'", "late", late.map(function (t) { return dueRow(t, now, "late"); }));
    // Una scadenza a mezzanotte appartiene al giorno prima (due - 1). Le attivita' gia' fatte per questo
    // periodo stanno nel gruppo del periodo appena chiuso, con la spunta e la data in cui si riaprono.
    var open = tasks.filter(function (t) { return !t.paused && new Date(t.dueAt).getTime() >= now; });
    var start = now - 1;
    dueGroups(now).forEach(function (g) {
      var inGroup = open.filter(function (t) {
        var at = isClosed(t, now) ? new Date(t.startAt).getTime() - 1 : new Date(t.dueAt).getTime() - 1;
        return at >= start && at < g.end;
      });
      inGroup.sort(function (a, b) { return (isClosed(a, now) ? 1 : 0) - (isClosed(b, now) ? 1 : 0); });
      start = g.end;
      if (g.key === "later" && inGroup.length && !state.tlExpanded) {
        card.appendChild(h("button", { class: "ghost dl-more", onclick: function () { state.tlExpanded = true; render(); } },
          "Piu' avanti (" + inGroup.length + ")"));
        return;
      }
      group(g.title, g.hint, g.urgent ? "" : "soft", inGroup.map(function (t) { return dueRow(t, now, isClosed(t, now) ? "done" : g.urgent ? "open" : "soft"); }));
    });
    group("In pausa", "fuori casa", "soft", paused.map(function (t) { return dueRow(t, now, "paused"); }));
    if (state.tlExpanded) {
      card.appendChild(h("button", { class: "ghost dl-more", onclick: function () { state.tlExpanded = false; render(); } }, "Mostra meno"));
    }
    return card;
  }

  // ---------- Assegnazione ----------
  var SLOT_KINDS = [["day", "Giorno specifico"], ["week", "Entro una settimana"], ["month", "Entro un mese"]];
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function toDateInput(t) { var d = new Date(t); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function slotWindow(dateStr, kind) {
    var p = dateStr.split("-");
    var start = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var end = new Date(start.getTime());
    if (kind === "day") end.setDate(end.getDate() + 1);
    else if (kind === "week") end.setDate(end.getDate() + 7);
    else end.setMonth(end.getMonth() + 1);
    return { startsAt: start.toISOString(), dueAt: end.toISOString() };
  }
  function slotDescription(kind, dateStr) {
    if (!dateStr) return "";
    var w = slotWindow(dateStr, kind);
    var lastDay = new Date(new Date(w.dueAt).getTime() - 1);
    var fmt = { weekday: "short", day: "numeric", month: "short" };
    if (kind === "day") return "Solo " + lastDay.toLocaleDateString("it-IT", fmt);
    return "Dal " + new Date(w.startsAt).toLocaleDateString("it-IT", fmt) + " al " + lastDay.toLocaleDateString("it-IT", fmt);
  }

  /** Rotazione "a turno" a partire da chi e' di turno ora (cosi' nell'editor il primo e' sempre quello attuale). */
  function currentFirst(task) {
    var ids = task.assignUserIds.slice();
    var at = ids.indexOf(task.assigneeId);
    return at > 0 ? ids.slice(at).concat(ids.slice(0, at)) : ids;
  }

  /** Editor dell'assegnazione: restituisce { el, value() } dove value() da' il payload per l'API. */
  function assignmentEditor(task) {
    var members = state.data.members;
    var a = {
      mode: task ? task.assignMode : "anyone",
      single: task && task.assignMode === "single" ? task.assignUserIds[0] : (members[0] ? members[0].id : null),
      rotation: task && task.assignMode === "alternate" ? currentFirst(task) : members.map(function (m) { return m.id; }),
      slots: task && task.slots ? task.slots.map(function (s) { return { userId: s.userId, kind: s.kind, date: toDateInput(s.startsAt) }; }) : []
    };
    if (a.mode === "custom" && !a.slots.length) a.slots.push({ userId: state.data.viewerId, kind: "week", date: toDateInput(Date.now()) });
    var wrap = h("div", { class: "assign" });

    var MODES = [
      ["anyone", "Chiunque", "Chi capita"],
      ["single", "Solo un utente", "Sempre la stessa persona"],
      ["alternate", "A turno", "Una volta a testa"],
      ["custom", "Personalizzato", "Chi e quando, a scelta"]
    ];

    function draw() {
      var modes = h("div", { class: "modes" });
      MODES.forEach(function (m) {
        modes.appendChild(h("button", { type: "button", class: a.mode === m[0] ? "on" : "", onclick: function () {
          a.mode = m[0];
          if (a.mode === "custom" && !a.slots.length) a.slots.push({ userId: state.data.viewerId, kind: "week", date: toDateInput(Date.now()) });
          draw();
        } }, m[1], h("small", {}, m[2])));
      });
      var body = null;

      if (a.mode === "single") {
        body = h("div", { class: "chips" });
        members.forEach(function (m) {
          body.appendChild(h("button", { type: "button", class: "chip" + (a.single === m.id ? " on" : ""), onclick: function () { a.single = m.id; draw(); } }, m.displayName));
        });
      } else if (a.mode === "alternate") {
        var moveTo = function (from, to) {
          var id = a.rotation.splice(from, 1)[0];
          a.rotation.splice(to, 0, id);
          draw();
        };
        var list = h("ol", { class: "turns" }, a.rotation.map(function (id, i) {
          var last = i === a.rotation.length - 1;
          return h("li", {},
            h("span", { class: "turn-n" }, String(i + 1)),
            h("span", { class: "grow" }, memberName(id), i === 0 ? h("small", {}, task ? "di turno ora" : "inizia") : null),
            h("button", { type: "button", class: "icon ghost", title: "Prima", "aria-label": "Sposta prima", disabled: i === 0, onclick: function () { moveTo(i, i - 1); } }, "↑"),
            h("button", { type: "button", class: "icon ghost", title: "Dopo", "aria-label": "Sposta dopo", disabled: last, onclick: function () { moveTo(i, i + 1); } }, "↓"));
        }));
        body = h("div", {},
          h("div", { class: "chips" }, members.map(function (m) {
            var on = a.rotation.indexOf(m.id) >= 0;
            return h("button", { type: "button", class: "chip" + (on ? " on" : ""), onclick: function () {
              if (on) a.rotation = a.rotation.filter(function (x) { return x !== m.id; }); else a.rotation.push(m.id);
              draw();
            } }, m.displayName);
          })),
          a.rotation.length >= 2 ? h("div", {},
            list,
            h("div", { class: "row", style: "margin-top:6px" },
              h("div", { class: "grow muted", style: "font-size:.8rem" }, "Dopo l'ultimo si ricomincia dal primo."),
              h("button", { type: "button", class: "chip", onclick: function () { a.rotation.reverse(); draw(); } }, "⇅ Inverti ordine"))
          ) : h("div", { class: "muted", style: "margin-top:6px;font-size:.8rem" }, "Scegli almeno due persone.")
        );
      } else if (a.mode === "custom") {
        body = h("div", {});
        a.slots.forEach(function (slot, i) {
          var who = h("select", { onchange: function (e) { slot.userId = Number(e.target.value); } });
          members.forEach(function (m) { var o = h("option", { value: String(m.id) }, m.displayName); if (m.id === slot.userId) o.selected = true; who.appendChild(o); });
          var kind = h("select", { onchange: function (e) { slot.kind = e.target.value; draw(); } });
          SLOT_KINDS.forEach(function (k) { var o = h("option", { value: k[0] }, k[1]); if (k[0] === slot.kind) o.selected = true; kind.appendChild(o); });
          var date = h("input", { type: "date", value: slot.date, onchange: function (e) { slot.date = e.target.value; draw(); } });
          body.appendChild(h("div", { class: "slot" }, who, kind,
            h("div", { style: "grid-column: 1 / -1" }, date),
            h("div", { class: "slot-foot" }, h("span", {}, slotDescription(slot.kind, slot.date)),
              h("button", { type: "button", class: "danger ghost", onclick: function () { a.slots.splice(i, 1); draw(); } }, "Rimuovi"))
          ));
        });
        body.appendChild(h("button", { type: "button", style: "margin-top:8px", onclick: function () {
          var last = a.slots[a.slots.length - 1];
          var next = last ? new Date(slotWindow(last.date, last.kind).dueAt).getTime() : Date.now();
          var nextUser = last ? members[(members.map(function (m) { return m.id; }).indexOf(last.userId) + 1) % members.length].id : state.data.viewerId;
          a.slots.push({ userId: nextUser, kind: last ? last.kind : "week", date: toDateInput(next) });
          draw();
        } }, "+ Aggiungi turno"));
        body.appendChild(h("div", { class: "muted", style: "margin-top:6px;font-size:.8rem" },
          "Il turno con la scadenza piu' vicina decide a chi tocca. Finiti i turni, l'attivita' torna a chiunque con la frequenza normale."));
      }
      wrap.replaceChildren(h("div", { class: "assign-title" }, "A chi tocca"), modes);
      if (body) wrap.appendChild(body);
    }
    draw();

    return {
      el: wrap,
      value: function () {
        if (a.mode === "single") return { mode: "single", userIds: a.single ? [a.single] : [] };
        if (a.mode === "alternate") {
          // Ordine non toccato: rimanda la rotazione salvata cosi' il turno attuale non si azzera.
          var same = task && task.assignMode === "alternate" && a.rotation.join(",") === currentFirst(task).join(",");
          return { mode: "alternate", userIds: same ? task.assignUserIds : a.rotation };
        }
        if (a.mode === "custom") return { mode: "custom", slots: a.slots.filter(function (s) { return s.date; }).map(function (s) {
          var w = slotWindow(s.date, s.kind);
          return { userId: s.userId, kind: s.kind, startsAt: w.startsAt, dueAt: w.dueAt };
        }) };
        return { mode: "anyone" };
      }
    };
  }

  // ---------- Form attivita' ----------
  function taskForm(task) {
    var startMs = task ? task.intervalMs : WEEK;
    var preset = FREQUENCIES.filter(function (f) { return f.ms === startMs; })[0];
    var current = intervalToInput(startMs);
    var name = h("input", { type: "text", maxlength: "80", placeholder: "Es. Pulire il bagno", value: task ? task.name : "" });
    var freq = { value: preset ? preset.value : "custom" };
    var freqChips = h("div", { class: "chips" });
    function drawFrequency() {
      var options = FREQUENCIES.concat([{ label: "Personalizzata...", value: "custom" }]);
      freqChips.replaceChildren.apply(freqChips, options.map(function (f) {
        return h("button", { type: "button", class: "chip" + (freq.value === f.value ? " on" : ""), onclick: function () {
          freq.value = f.value; drawFrequency(); syncFrequency();
        } }, f.label);
      }));
    }
    var n = h("input", { type: "number", min: "1", value: String(current.n) });
    var unit = h("select", {});
    ["ore", "giorni", "settimane"].forEach(function (u) {
      var opt = h("option", { value: u }, u); if (u === current.unit) opt.selected = true; unit.appendChild(opt);
    });
    var customRow = h("div", { class: "row", style: "margin-top:8px" }, "Ogni", n, unit);
    function syncFrequency() { customRow.style.display = freq.value === "custom" ? "" : "none"; }
    drawFrequency(); syncFrequency();
    var severity = h("select", {});
    ["low", "medium", "high"].forEach(function (s) {
      var opt = h("option", { value: s }, SEVERITY[s]); if ((task ? task.severity : "medium") === s) opt.selected = true; severity.appendChild(opt);
    });
    var assign = assignmentEditor(task);
    var notify = h("input", { type: "checkbox" }); notify.checked = state.data.house.notifyChanges;
    var label = task ? "Avvisa il gruppo della modifica" : "Avvisa il gruppo della nuova attivita'";

    function save() {
      var body = { name: name.value, interval: freq.value === "custom" ? n.value + " " + unit.value : freq.value, severity: severity.value, notify: notify.checked, assignment: assign.value() };
      var request = task ? api("PATCH", "/api/houses/" + state.houseId + "/tasks/" + task.id, body) : api("POST", "/api/houses/" + state.houseId + "/tasks", body);
      request.then(function () { state.editing = null; state.adding = false; return loadHouse(); }).catch(fail);
    }

    return h("div", { class: "card" },
      h("div", { class: "row" }, h("div", { class: "grow" }, name)),
      h("div", { class: "assign-title", style: "margin-top:10px" }, "Frequenza"),
      freqChips,
      customRow,
      h("div", { class: "row", style: "margin-top:8px" }, severity),
      assign.el,
      h("label", { class: "check", style: "margin-top:10px" }, notify, label),
      h("div", { class: "row", style: "margin-top:10px" },
        h("button", { class: "primary", onclick: save }, "Salva"),
        h("button", { class: "ghost", onclick: function () { state.editing = null; state.adding = false; render(); } }, "Annulla")
      )
    );
  }

  function taskCard(task) {
    if (state.editing === task.id) return taskForm(task);
    var due = task.paused ? { cls: "due-paused", text: "⏸ In pausa: " + task.assigneeName + " e' fuori casa" } : dueInfo(task);
    function done() { api("POST", "/api/houses/" + state.houseId + "/tasks/" + task.id + "/complete").then(loadHouse).catch(fail); }
    function remove() {
      if (!confirm("Eliminare \\"" + task.name + "\\"?")) return;
      var notify = state.data.house.notifyChanges ? "1" : "0";
      api("DELETE", "/api/houses/" + state.houseId + "/tasks/" + task.id + "?notify=" + notify).then(loadHouse).catch(fail);
    }
    var extra = [task.frequency];
    if (task.assignMode === "alternate") {
      var turns = currentFirst(task);
      extra.push(turns.length > 1 ? "a turno, poi " + (turns[1] === state.data.viewerId ? "tu" : memberName(turns[1])) : "a turno");
    }
    var pendingSwap = (state.data.swaps || []).filter(function (w) { return w.taskId === task.id; })[0];
    var canSwap = task.assignMode === "alternate" && !pendingSwap && task.assignUserIds.indexOf(state.data.viewerId) >= 0 && task.assignUserIds.length > 1;
    if (task.assignMode === "custom" && task.slots.length > 1) extra.push("poi " + task.slots[1].userName);
    return h("div", { class: "card task" },
      h("div", { class: "row tight" },
        h("div", { class: "grow task-name" }, task.name),
        h("span", { class: "tag " + task.severity }, SEVERITY[task.severity])
      ),
      h("div", { class: "muted task-meta" },
        h("span", { class: "who" + (task.assigneeId === state.data.viewerId ? " me" : "") }, "👤 " + whoLabel(task)),
        " · " + extra.join(" · ")
      ),
      h("div", { class: "row tight task-foot" },
        h("div", { class: "grow " + due.cls }, due.text),
        due.closed ? null : h("button", { class: "primary", onclick: done }, "Fatto"),
        canSwap ? h("button", { class: "icon", title: "Scambia turno", "aria-label": "Chiedi di scambiare il turno", onclick: function () { askSwap(task); } }, "🔄") : null,
        h("button", { class: "icon", title: "Modifica", "aria-label": "Modifica", onclick: function () { state.editing = task.id; state.adding = false; render(); } }, "✏️"),
        h("button", { class: "icon danger ghost", title: "Elimina", "aria-label": "Elimina", onclick: remove }, "🗑")
      ),
      state.swapPicking === task.id ? swapPicker(task) : null,
      pendingSwap ? h("div", { class: "muted swap-note" }, "🔄 Scambio in attesa: " + pendingSwap.requesterName + " ↔ " + pendingSwap.targetName) : null
    );
  }

  // ---------- Scambi di turno ----------
  /** "a Luca" ma "ad Anna". */
  function toName(name) { return (name.charAt(0).toLowerCase() === "a" ? "ad " : "a ") + name; }
  function swapAction(path) {
    api("POST", "/api/houses/" + state.houseId + path).then(function (data) { state.data = data; state.error = ""; state.swapPicking = null; render(); }).catch(fail);
  }

  function sendSwap(task, targetId) {
    api("POST", "/api/houses/" + state.houseId + "/tasks/" + task.id + "/swap", { targetId: targetId })
      .then(function (data) { state.data = data; state.error = ""; state.swapPicking = null; render(); }).catch(fail);
  }

  /** Con due persone in rotazione chiede subito all'altra; con di piu' mostra la scelta sotto la card. */
  function askSwap(task) {
    var others = task.assignUserIds.filter(function (id) { return id !== state.data.viewerId; });
    if (others.length === 1) {
      if (confirm("Chiedere " + toName(memberName(others[0])) + " di scambiarvi il turno di «" + task.name + "»?")) sendSwap(task, others[0]);
      return;
    }
    state.swapPicking = state.swapPicking === task.id ? null : task.id;
    render();
  }

  function swapPicker(task) {
    var others = task.assignUserIds.filter(function (id) { return id !== state.data.viewerId; });
    return h("div", { class: "swap-pick" },
      h("div", { class: "muted", style: "font-size:.85rem" }, "Con chi vuoi scambiare il turno?"),
      h("div", { class: "chips" },
        others.map(function (id) { return h("button", { class: "chip", onclick: function () { sendSwap(task, id); } }, memberName(id)); }),
        h("button", { class: "chip ghost", onclick: function () { state.swapPicking = null; render(); } }, "Annulla")));
  }

  /** Banner in alto: richieste di scambio di turno in attesa (rispondi, annulla o solo informativo). */
  function viewSwaps() {
    var list = state.data.swaps || [];
    if (!list.length) return null;
    var me = state.data.viewerId;
    return h("div", {}, list.map(function (w) {
      var base = "/swaps/" + w.id;
      if (w.targetId === me) {
        return h("div", { class: "away pending" },
          h("div", { class: "grow" }, "🔄 " + w.requesterName + " ti chiede di scambiarvi il turno",
            h("small", {}, "«" + w.taskName + "»: se accetti vi invertite nella rotazione.")),
          h("button", { class: "ghost", onclick: function () { swapAction(base + "/reject"); } }, "Rifiuto"),
          h("button", { class: "primary", onclick: function () { swapAction(base + "/accept"); } }, "✅ Accetto"));
      }
      if (w.requesterId === me) {
        return h("div", { class: "away" },
          h("div", { class: "grow" }, "🔄 Hai chiesto " + toName(w.targetName) + " di scambiarvi il turno",
            h("small", {}, "«" + w.taskName + "» · in attesa della risposta")),
          h("button", { class: "ghost", onclick: function () { swapAction(base + "/cancel"); } }, "Annulla"));
      }
      return h("div", { class: "away" },
        h("div", { class: "grow" }, "🔄 " + w.requesterName + " ha chiesto " + toName(w.targetName) + " di scambiarsi il turno",
          h("small", {}, "«" + w.taskName + "» · in attesa della risposta")));
    }));
  }

  // ---------- Viste ----------
  var ORDERS = [
    ["all", "Tutte", "In ordine di scadenza"],
    ["mine", "Prima le mie", "Le tue, poi di chiunque, poi degli altri"],
    ["mineany", "Mie + chiunque", "Le tue e di chiunque insieme, poi degli altri"]
  ];
  // Gruppi in cui dividere le attivita' secondo l'ordinamento scelto: [titolo, filtro].
  function taskGroups(tasks) {
    var me = state.data.viewerId;
    function byDue(a, b) { return new Date(a.dueAt) - new Date(b.dueAt); }
    var sorted = tasks.slice().sort(byDue);
    function mine(t) { return t.assigneeId === me; }
    function anyone(t) { return t.assigneeId === null || t.assigneeId === undefined; }
    var groups = [];
    if (state.order === "mine") groups = [["Tue", mine], ["Di chiunque", anyone], ["Degli altri", function (t) { return !mine(t) && !anyone(t); }]];
    else if (state.order === "mineany") groups = [["Tue e di chiunque", function (t) { return mine(t) || anyone(t); }], ["Degli altri", function (t) { return !mine(t) && !anyone(t); }]];
    else return [{ title: null, tasks: sorted }];
    return groups.map(function (g) { return { title: g[0], tasks: sorted.filter(g[1]) }; }).filter(function (g) { return g.tasks.length; });
  }

  function orderPicker() {
    var seg = h("div", { class: "seg", role: "tablist" });
    ORDERS.forEach(function (o) {
      seg.appendChild(h("button", { class: state.order === o[0] ? "on" : "", onclick: function () {
        state.order = o[0];
        try { localStorage.setItem("taskOrder", o[0]); } catch (e) {}
        render();
      } }, o[1]));
    });
    var hint = ORDERS.filter(function (o) { return o[0] === state.order; })[0][2];
    return h("div", { style: "margin:10px 0 4px" }, seg, h("div", { class: "muted", style: "font-size:.8rem;margin-top:4px" }, hint));
  }

  function viewTasks() {
    var groups = taskGroups(state.data.tasks);
    var items = [];
    groups.forEach(function (g) {
      if (g.title) items.push(h("div", { class: "group-title" }, g.title));
      g.tasks.forEach(function (t) { items.push(taskCard(t)); });
    });
    return h("div", {},
      state.adding ? taskForm(null) : h("button", { class: "primary", onclick: function () { state.adding = true; state.editing = null; render(); } }, "+ Nuova attivita'"),
      state.data.tasks.length > 1 ? orderPicker() : null,
      items.length ? items : h("p", { class: "muted" }, "Nessuna attivita' ancora.")
    );
  }

  function logText(entry) {
    if (entry.kind === "done") return "ha fatto \\"" + entry.taskName + "\\"";
    if (entry.kind === "created") return (entry.detail === "ripristinata" ? "ha ripristinato \\"" : "ha aggiunto \\"") + entry.taskName + "\\"";
    if (entry.kind === "deleted") return "ha eliminato \\"" + entry.taskName + "\\"";
    return "ha modificato \\"" + entry.taskName + "\\"" + (entry.detail ? " (" + entry.detail + ")" : "");
  }

  function viewLog() {
    if (!state.data.log.length) return h("p", { class: "muted" }, "Il registro e' ancora vuoto.");
    var list = h("ul", { class: "plain" });
    state.data.log.forEach(function (entry) {
      var restore = entry.restorable ? h("button", { onclick: function () {
        api("POST", "/api/houses/" + state.houseId + "/log/" + entry.id + "/restore").then(loadHouse).catch(fail);
      } }, "Ripristina") : null;
      list.appendChild(h("li", { class: "row" },
        h("div", { class: "grow" }, h("div", {}, h("strong", {}, entry.userName), " " + logText(entry)), h("div", { class: "muted" }, when(entry.createdAt))),
        restore
      ));
    });
    return h("div", { class: "card" }, list);
  }

  // ---------- Fuori casa ----------
  function sinceLabel(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < HOUR) return "da poco";
    return "da " + shortLeft(ms);
  }
  function absenceAction(path, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    api("POST", "/api/houses/" + state.houseId + path).then(function (data) { state.data = data; state.error = ""; render(); }).catch(fail);
  }

  /** Banner sopra la timeline: chi e' fuori casa e le richieste da confermare. */
  function viewAbsences() {
    var list = state.data.absences || [];
    if (!list.length) return null;
    var me = state.data.viewerId;
    return h("div", {}, list.map(function (a) {
      var mine = a.userId === me;
      var base = "/absences/" + a.id;
      if (a.status === "pending") {
        return h("div", { class: "away pending" },
          h("div", { class: "grow" }, mine ? "🧳 Hai detto che sei fuori casa" : "🧳 " + a.userName + " dice di essere fuori casa",
            h("small", {}, mine ? "Serve l'ok di un coinquilino, poi le tue attivita' vanno in pausa." : "Se e' vero conferma: le sue attivita' andranno in pausa.")),
          mine ? h("button", { class: "ghost", onclick: function () { absenceAction(base + "/cancel"); } }, "Annulla")
               : h("button", { class: "primary", onclick: function () { absenceAction(base + "/approve"); } }, "✅ Confermo")
        );
      }
      return h("div", { class: "away" },
        h("div", { class: "grow" }, mine ? "🧳 Sei fuori casa " + sinceLabel(a.startsAt) : "🧳 " + a.userName + " e' fuori casa " + sinceLabel(a.startsAt),
          h("small", {}, (mine ? "Le tue attivita' sono in pausa" : "Le sue attivita' sono in pausa") + (a.approvedByName ? " · ok di " + a.approvedByName : ""))),
        h("button", { class: mine ? "primary" : "", onclick: function () {
          absenceAction(base + "/end", mine ? null : "Segnare il rientro di " + a.userName + "?");
        } }, mine ? "🏠 Sono rientrato" : "🏠 Segna rientro")
      );
    }));
  }

  function awayCard() {
    var open = (state.data.absences || []).filter(function (a) { return a.userId === state.data.viewerId; })[0];
    return h("div", { class: "card" },
      h("p", { style: "margin:0 0 6px" }, "Vai via qualche giorno? Dillo qui: quando un coinquilino conferma, le attivita' che toccano a te vanno in pausa (niente avvisi ne' insulti)."),
      h("p", { class: "muted", style: "margin:0 0 10px" }, "Al rientro, quelle scadute mentre eri via vanno fatte entro la fine di quel giorno; le altre slittano di tutti i giorni in cui sei stato fuori. Il rientro lo segni tu o un coinquilino. Dal gruppo Telegram: /fuori e /rientro."),
      open ? h("p", { class: "muted", style: "margin:0" }, open.status === "pending" ? "Richiesta inviata: aspetta l'ok di un coinquilino (lo vedi in alto)." : "Sei fuori casa: quando torni premi «Sono rientrato» in alto.")
           : h("button", { class: "primary", onclick: function () { absenceAction("/absences", "Avvisare il gruppo che sei fuori casa?"); } }, "🧳 Sono fuori casa")
    );
  }

  // ---------- Promemoria giornalieri ----------
  var DIGEST_TITLES = { morning: "☀️ Buongiorno", evening: "🌙 Riepilogo serale" };
  var DIGEST_HINTS = {
    morning: "Cosa e' in ritardo e cosa scade oggi o domani, piu' le prossime 3 attivita' se vuoi portarti avanti.",
    evening: "Cosa dovrai fare domani."
  };
  var NL2 = String.fromCharCode(10) + String.fromCharCode(10);

  function digestCard(d) {
    var draft = state.digestDraft[d.kind];
    if (!draft) {
      draft = { enabled: d.enabled, time: d.time, intro: d.intro || "", skipIfEmpty: d.skipIfEmpty, dirty: false };
      state.digestDraft[d.kind] = draft;
    }
    var bodyText = d.preview.indexOf(NL2) >= 0 ? d.preview.slice(d.preview.indexOf(NL2)) : "";
    var bubble = h("div", { class: "bubble" });
    var note = h("div", { class: "muted", style: "font-size:.8rem;margin-top:4px" });
    var save = h("button", { class: "primary", onclick: function () {
      var payload = { digests: {} };
      payload.digests[d.kind] = { enabled: draft.enabled, time: draft.time, intro: draft.intro, skipIfEmpty: draft.skipIfEmpty };
      api("PATCH", "/api/houses/" + state.houseId, payload).then(function (data) {
        delete state.digestDraft[d.kind];
        state.data = data; state.error = ""; render();
      }).catch(fail);
    } }, "Salva");

    function refresh() {
      bubble.textContent = (draft.intro.trim() || d.defaultIntro) + bodyText;
      note.textContent = d.previewEmpty && draft.skipIfEmpty ? "Con la situazione di adesso non partirebbe: niente da segnalare." : "";
      save.disabled = !draft.dirty;
      card.className = "card digest" + (draft.enabled ? "" : " off");
    }
    function change() { draft.dirty = true; refresh(); }

    var toggle = h("input", { type: "checkbox", onchange: function (e) { draft.enabled = e.target.checked; change(); } });
    toggle.checked = draft.enabled;
    var time = h("input", { type: "time", value: draft.time, onchange: function (e) { if (e.target.value) { draft.time = e.target.value; change(); } } });
    var intro = h("input", { type: "text", maxlength: "200", placeholder: d.defaultIntro, value: draft.intro, oninput: function (e) { draft.intro = e.target.value; change(); } });
    var skip = h("input", { type: "checkbox", onchange: function (e) { draft.skipIfEmpty = e.target.checked; change(); } });
    skip.checked = draft.skipIfEmpty;

    var card = h("div", { class: "card digest" },
      h("div", { class: "digest-top" },
        h("label", { class: "switch" }, toggle, h("span", {})),
        h("div", { class: "title" }, DIGEST_TITLES[d.kind]),
        time
      ),
      h("div", { class: "digest-body" },
        h("p", { class: "muted", style: "margin:6px 0 10px" }, DIGEST_HINTS[d.kind]),
        h("div", { class: "muted", style: "font-size:.8rem;margin-bottom:4px" }, "Frase iniziale (l'elenco sotto e' automatico)"),
        intro,
        h("label", { class: "check", style: "margin-top:8px" }, skip, "Non inviare se non c'e' niente da segnalare"),
        h("div", { class: "bubble-label" }, "Anteprima, se partisse adesso"),
        bubble,
        note
      ),
      h("div", { class: "row", style: "margin-top:10px" },
        save,
        h("button", { class: "ghost", onclick: function () { draft.intro = ""; intro.value = ""; change(); } }, "Testo predefinito")
      )
    );
    refresh();
    return card;
  }

  // ---------- Insulti ----------
  var SEV_SHORT = { low: "Poco importante", medium: "Medio", high: "Importante" };

  function fillInsultPreview(template) {
    return template.split("{nome}").join(state.me.user.displayName).split("{attivita}").join("Pulire il bagno").split("{attività}").join("Pulire il bagno");
  }

  function insultsCard() {
    var sev = state.insultSev;
    var info = state.data.insults.filter(function (x) { return x.severity === sev; })[0];
    var draft = state.insultDraft[sev];
    if (!draft) { draft = { messages: info.mine.length ? info.mine.slice() : [""], dirty: false, active: 0 }; state.insultDraft[sev] = draft; }

    var seg = h("div", { class: "seg" });
    ["low", "medium", "high"].forEach(function (k) {
      seg.appendChild(h("button", { class: k === sev ? "on" : "", onclick: function () { state.insultSev = k; render(); } }, SEV_SHORT[k]));
    });

    var list = h("div", {});
    var save = h("button", { class: "primary" }, "Salva");
    var example = h("div", { class: "bubble" });
    var someone = (state.data.members.filter(function (m) { return m.id !== state.data.viewerId; })[0] || { displayName: "Anna" }).displayName;
    function refresh() {
      save.disabled = !draft.dirty;
      // Esempio: il messaggio che stai scrivendo (o il primo scritto); niente esempio finche' non scrivi nulla.
      var current = draft.messages[draft.active];
      var text = current && current.trim() ? current : draft.messages.filter(function (m) { return m.trim(); })[0];
      if (!text) {
        example.className = "bubble empty";
        example.textContent = "Scrivi un insulto per vedere come arrivera' nel gruppo.";
        return;
      }
      example.className = "bubble";
      example.textContent = "😬 Pulire il bagno · scaduta · doveva farla " + someone + String.fromCharCode(10) +
        text.split("{nome}").join(someone).split("{attivita}").join("Pulire il bagno").split("{attività}").join("Pulire il bagno").replace(/ +([,.!?;:])/g, "$1");
    }
    function drawList(focusIndex) {
      list.replaceChildren();
      if (!draft.messages.length) list.appendChild(h("p", { class: "muted", style: "margin:8px 0 0" }, "Non hai ancora scritto insulti per questa gravita'."));
      draft.messages.forEach(function (msg, i) {
        var input = h("input", { type: "text", maxlength: "200", value: msg, placeholder: "Scrivi il tuo insulto...",
          onfocus: function () { draft.active = i; refresh(); },
          oninput: function (e) { draft.messages[i] = e.target.value; draft.active = i; draft.dirty = true; refresh(); } });
        // Inserisce il segnaposto dove si trova il cursore (o in fondo).
        function insert(token) {
          var start = input.selectionStart === null ? input.value.length : input.selectionStart;
          var end = input.selectionEnd === null ? start : input.selectionEnd;
          var before = input.value.slice(0, start), after = input.value.slice(end);
          var spaced = (before && before.slice(-1) !== " " ? " " : "") + token + (after.charAt(0) !== " " ? " " : "");
          input.value = (before + spaced + after).slice(0, 200);
          var caret = Math.min(input.value.length, before.length + spaced.length);
          draft.messages[i] = input.value; draft.active = i; draft.dirty = true;
          input.focus(); input.setSelectionRange(caret, caret);
          refresh();
        }
        function tokenButton(label, token) {
          // mousedown + preventDefault: il campo non perde il cursore quando premi il pulsante.
          return h("button", { type: "button", onmousedown: function (e) { e.preventDefault(); }, onclick: function () { insert(token); } }, label);
        }
        list.appendChild(h("div", { class: "insult-item" },
          h("div", { class: "insult-row" },
            input,
            h("button", { class: "danger ghost", title: "Elimina", onclick: function () { draft.messages.splice(i, 1); draft.active = 0; draft.dirty = true; drawList(); refresh(); } }, "✕")
          ),
          h("div", { class: "tokens" }, tokenButton("+ 👤 nome", "{nome}"), tokenButton("+ 🧹 attivita'", "{attivita}"))
        ));
        if (focusIndex === i) setTimeout(function () { input.focus(); }, 0);
      });
    }
    drawList();
    save.addEventListener("click", function () {
      var payload = { insults: {} };
      payload.insults[sev] = draft.messages;
      api("PATCH", "/api/houses/" + state.houseId, payload).then(function (data) {
        delete state.insultDraft[sev]; state.data = data; state.error = ""; render();
      }).catch(fail);
    });
    refresh();

    var others = info.byOthers === 0 ? "Gli altri non ne hanno ancora scritti: contro di te il bot usa quelli predefiniti."
      : "Gli altri ne hanno scritti " + info.byOthers + " (segreti anche per te 🤫).";

    return h("div", { class: "card" },
      h("p", { class: "muted", style: "margin:0 0 10px" }, "🤫 Solo tu vedi i tuoi insulti. Quando un'attivita' scade (e al sollecito) il bot ne sceglie uno a caso tra quelli scritti dai coinquilini: i tuoi colpiscono gli altri, mai te. Con i pulsanti 👤 nome e 🧹 attivita' puoi inserire chi la doveva fare e cosa: sono facoltativi."),
      seg,
      list,
      h("button", { style: "margin-top:10px", onclick: function () { draft.messages.push(""); draft.active = draft.messages.length - 1; drawList(draft.active); refresh(); } }, "+ Aggiungi un altro"),
      h("div", { class: "muted", style: "font-size:.8rem;margin-top:8px" }, others),
      h("div", { class: "bubble-label" }, "Esempio"),
      example,
      h("div", { class: "row", style: "margin-top:10px" }, save)
    );
  }

  /** Scheda Membri: chi c'e' in casa, chi e' fuori, e il pulsante "Sono fuori casa". */
  function viewMembers() {
    var absences = state.data.absences || [];
    var members = h("ul", { class: "plain" });
    state.data.members.forEach(function (m) {
      var absence = absences.filter(function (a) { return a.userId === m.id; })[0];
      var badge = !absence ? null
        : absence.status === "active" ? h("span", { class: "badge out" }, "🧳 fuori casa " + sinceLabel(absence.startsAt))
        : h("span", { class: "badge" }, "🧳 attende l'ok");
      members.appendChild(h("li", { class: "member" },
        h("div", { class: "grow" }, m.displayName, m.id === state.data.viewerId ? h("small", {}, "(tu)") : (m.username ? h("small", {}, "@" + m.username) : null)),
        badge
      ));
    });
    return h("div", {},
      h("h2", {}, "Coinquilini"),
      h("div", { class: "card" }, members),
      h("h2", {}, "Fuori casa"),
      awayCard(),
      h("div", { class: "row", style: "margin-top:16px" },
        h("button", { onclick: function () { api("POST", "/logout").then(function () { state.me = null; renderLogin(); }); } }, "Esci")
      )
    );
  }

  /** Scheda Messaggi: tutto cio' che il bot scrive nel gruppo (promemoria, insulti, avvisi sulle modifiche). */
  function viewMessages() {
    var notify = h("input", { type: "checkbox", onchange: function (e) {
      api("PATCH", "/api/houses/" + state.houseId, { notifyChanges: e.target.checked }).then(loadHouse).catch(fail);
    } });
    notify.checked = state.data.house.notifyChanges;
    return h("div", {},
      h("h2", {}, "Promemoria nel gruppo"),
      state.data.digests.map(digestCard),
      h("h2", {}, "I tuoi insulti segreti"),
      insultsCard(),
      h("h2", {}, "Avvisi sulle modifiche"),
      h("div", { class: "card" },
        h("label", { class: "check" }, notify, "Avvisa il gruppo quando un'attivita' viene creata o modificata"),
        h("p", { class: "muted" }, "E' il valore predefinito: puoi cambiarlo caso per caso quando salvi.")
      )
    );
  }

  function render() {
    if (!state.me) { renderLogin(); return; }
    if (!state.me.houses.length) {
      root.replaceChildren(
        h("h1", {}, "Ciao " + state.me.user.displayName),
        h("div", { class: "card" },
          h("p", {}, "Non fai ancora parte di nessuna casa."),
          h("p", { class: "muted" }, "Aggiungi @" + BOT_USERNAME + " al gruppo Telegram della casa e scrivi /start nel gruppo. Poi usa un comando (es. /attivita) per entrare tra i coinquilini.")
        )
      );
      return;
    }
    if (!state.data) { root.replaceChildren(h("p", { class: "muted" }, "Caricamento...")); return; }

    var side = h("div", { class: "head-side" },
      h("a", { class: "contrib", href: "/contribuisci", title: "Hai un'idea per il bot? Miglioralo tu" }, "🛠 Migliora"));
    var header = h("div", { class: "row head" }, h("div", { class: "grow" }, h("h1", {}, state.data.house.name), h("div", { class: "muted" }, state.me.user.displayName)), side);
    if (state.me.houses.length > 1) {
      var select = h("select", { onchange: function (e) {
        state.houseId = Number(e.target.value); state.data = null; state.editing = null; state.adding = false; state.digestDraft = {}; state.insultDraft = {};
        try { localStorage.setItem("house", String(state.houseId)); } catch (err) {}
        loadHouse();
      } });
      state.me.houses.forEach(function (x) { var o = h("option", { value: String(x.id) }, x.name); if (x.id === state.houseId) o.selected = true; select.appendChild(o); });
      side.appendChild(select);
    }

    var tabs = h("nav", {});
    [["tasks", "Attivita'"], ["members", "Membri"], ["messages", "Messaggi"]].forEach(function (t) {
      tabs.appendChild(h("button", { class: state.tab === t[0] ? "active" : "", onclick: function () { state.tab = t[0]; render(); } }, t[1]));
    });
    // Il registro e' secondario: un pulsante piccolo in fondo alla barra (solo icona su telefono).
    tabs.appendChild(h("button", { class: "minor" + (state.tab === "log" ? " active" : ""), title: "Registro", "aria-label": "Registro",
      onclick: function () { state.tab = "log"; render(); } }, "🧾", h("span", { class: "lbl" }, " Registro")));

    var view = state.tab === "members" ? viewMembers() : state.tab === "messages" ? viewMessages() : state.tab === "log" ? viewLog() : viewTasks();
    var parts = [header, viewAbsences(), viewSwaps(), viewTimeline(), tabs, state.error ? h("p", { class: "error" }, state.error) : null, view].filter(Boolean);
    root.replaceChildren.apply(root, parts);
  }

  setInterval(function () {
    var typing = document.activeElement && root.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (state.data && !state.editing && !state.adding && !typing) render();
  }, 60000);
  boot();
})();
</script>
</body>
</html>`;
