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
  .tl { padding: 14px 14px 10px; }
  .tl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .tl-title { font-weight: 700; font-size: 1rem; }
  .seg { display: inline-flex; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 2px; }
  .seg button { border: 0; background: transparent; padding: 5px 11px; font-size: .85rem; border-radius: 8px; color: var(--muted); }
  .seg button.on { background: var(--card); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
  .tl-axis { position: relative; height: 18px; margin-left: var(--tl-label); font-size: .7rem; color: var(--muted); }
  .tl-axis span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
  .tl-axis span:first-child { transform: none; }
  .tl-rows { position: relative; }
  .tl-grid { position: absolute; top: 0; bottom: 0; left: var(--tl-label); right: 0; pointer-events: none; }
  .tl-grid i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .tl-row { display: grid; grid-template-columns: var(--tl-label) 1fr; align-items: center; min-height: 34px; position: relative; }
  .tl-label { padding-right: 8px; min-width: 0; line-height: 1.15; }
  .tl-name { font-size: .86rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tl-sub { font-size: .72rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tl-sub.me { color: var(--accent); font-weight: 600; }
  .tl-track { position: relative; height: 22px; }
  .tl-bar { position: absolute; top: 4px; height: 14px; left: 0; border-radius: 0 7px 7px 0; min-width: 6px; transition: width .4s ease; }
  .tl-bar.ok { background: color-mix(in srgb, var(--ok) 70%, transparent); }
  .tl-bar.soon { background: var(--warn); }
  .tl-bar.urgent { background: var(--late); }
  .tl-bar.far { background: linear-gradient(90deg, color-mix(in srgb, var(--ok) 70%, transparent) 70%, transparent); border-radius: 0; }
  .tl-bar.paused { width: 100%; border-radius: 7px; background: repeating-linear-gradient(135deg, var(--line) 0 6px, transparent 6px 12px); border: 1px dashed var(--muted); opacity: .8; }
  .tl-paused-label { position: absolute; left: 8px; top: 3px; font-size: .72rem; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .away { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); margin: 8px 0; font-size: .9rem; }
  .away .grow small { display: block; color: var(--muted); font-size: .78rem; }
  .away.pending { border-color: var(--warn); }
  .away button { padding: 6px 12px; font-size: .85rem; white-space: nowrap; }
  .due-paused { color: var(--muted); font-weight: 600; }
  .tl-bar.late { background: repeating-linear-gradient(135deg, var(--late) 0 6px, color-mix(in srgb, var(--late) 70%, transparent) 6px 12px); width: 100%; border-radius: 7px; opacity: .9; }
  .tl-when { position: absolute; top: 3px; font-size: .72rem; font-weight: 600; white-space: nowrap; padding-left: 6px; }
  .tl-when.inside { color: #fff; padding: 0 8px 0 0; transform: translateX(-100%); }
  .tl-late-label { position: absolute; left: 8px; top: 3px; font-size: .72rem; font-weight: 700; color: #fff; white-space: nowrap; }
  .tl-now { position: absolute; top: -4px; bottom: -4px; left: var(--tl-label); width: 2px; background: var(--text); border-radius: 2px; opacity: .55; }
  .tl-foot { font-size: .78rem; color: var(--muted); margin-top: 6px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .tl-foot button { font-size: .78rem; padding: 2px 8px; }
  .tl-empty { color: var(--muted); font-size: .9rem; padding: 6px 0; }

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
  var savedRange = null;
  try { savedRange = localStorage.getItem("tlRange"); } catch (e) {}
  var state = { me: null, houseId: null, data: null, tab: "tasks", editing: null, adding: false, error: "",
    range: savedRange === "month" || savedRange === "all" ? savedRange : "week", tlExpanded: false, digestDraft: {}, insultDraft: {}, insultSev: "high" };
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
      renderLogin("Conferma il login nel bot, poi torna qui...");
      pollLogin(res.request.token, 0);
    }).catch(function (err) { renderLogin(err.message); });
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
    return { cls: left < 6 * HOUR ? "due-soon" : "due-ok", text: "Entro " + duration(left) };
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

  // ---------- Timeline scadenze ----------
  var RANGES = [["week", "Settimana"], ["month", "Mese"], ["all", "Tutto"]];
  var WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function timelineSpan(now, tasks) {
    if (state.range === "week") return 7 * DAY;
    if (state.range === "month") return 30 * DAY;
    var far = now + DAY;
    tasks.forEach(function (t) { far = Math.max(far, new Date(t.dueAt).getTime()); });
    return Math.max(DAY, (far - now) * 1.04);
  }

  function timelineTicks(now, span) {
    var ticks = [], stepDays;
    if (span <= 8 * DAY) stepDays = 1;
    else if (span <= 35 * DAY) stepDays = 7;
    else stepDays = Math.max(7, Math.ceil(span / DAY / 5 / 7) * 7);
    var t = startOfDay(now) + stepDays * DAY;
    if (stepDays === 1) t = startOfDay(now) + DAY;
    var compact = root.clientWidth < 520;
    while (t < now + span) {
      var d = new Date(t);
      var label = stepDays === 1 ? (compact ? WEEKDAYS[d.getDay()].charAt(0).toUpperCase() + d.getDate() : WEEKDAYS[d.getDay()] + " " + d.getDate())
        : compact ? d.getDate() + "/" + (d.getMonth() + 1) : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      ticks.push({ at: (t - now) / span, label: label });
      t += stepDays * DAY;
    }
    return ticks;
  }

  function shortLeft(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return Math.max(1, m) + "m";
    var hrs = Math.round(m / 60);
    if (hrs < 48) return hrs + "h";
    return Math.round(hrs / 24) + "g";
  }

  function viewTimeline() {
    var now = Date.now();
    var tasks = state.data.tasks.slice().sort(function (a, b) { return new Date(a.dueAt) - new Date(b.dueAt); });
    var span = timelineSpan(now, tasks);
    var visible = tasks.filter(function (t) { return new Date(t.dueAt).getTime() - now <= span; });
    var hidden = tasks.length - visible.length;
    var limit = 8;
    var shown = state.tlExpanded ? visible : visible.slice(0, limit);

    var seg = h("div", { class: "seg", role: "tablist" });
    RANGES.forEach(function (r) {
      seg.appendChild(h("button", { class: state.range === r[0] ? "on" : "", onclick: function () {
        state.range = r[0]; state.tlExpanded = false;
        try { localStorage.setItem("tlRange", r[0]); } catch (e) {}
        render();
      } }, r[1]));
    });

    var lateCount = tasks.filter(function (t) { return !t.paused && new Date(t.dueAt).getTime() < now; }).length;
    var mineCount = visible.filter(function (t) { return t.assigneeId === state.data.viewerId; }).length;
    var subtitle = lateCount ? lateCount + " in ritardo" : "Niente in ritardo";
    if (mineCount) subtitle += " · " + mineCount + " tocca" + (mineCount === 1 ? "" : "no") + " a te";

    var card = h("div", { class: "card tl", style: "--tl-label: min(38%, 150px)" },
      h("div", { class: "tl-head" },
        h("div", {}, h("div", { class: "tl-title" }, "Prossime scadenze"), h("div", { class: "muted", style: "font-size:.8rem" }, subtitle)),
        seg
      )
    );

    if (!tasks.length) { card.appendChild(h("div", { class: "tl-empty" }, "Nessuna attivita' da mostrare.")); return card; }

    var ticks = timelineTicks(now, span).filter(function (tick) { return tick.at >= 0.06 && tick.at <= 0.97; });
    var axis = h("div", { class: "tl-axis" }, ticks.length && ticks[0].at < 0.3 ? null : h("span", { style: "left:0" }, "adesso"));
    var grid = h("div", { class: "tl-grid" });
    ticks.forEach(function (tick) {
      axis.appendChild(h("span", { style: "left:" + (tick.at * 100) + "%" }, tick.label));
      grid.appendChild(h("i", { style: "left:" + (tick.at * 100) + "%" }));
    });

    var rows = h("div", { class: "tl-rows" }, grid);
    if (!visible.length) {
      rows.appendChild(h("div", { class: "tl-empty" }, state.range === "week" ? "Nulla in scadenza questa settimana." : "Nulla in scadenza nei prossimi 30 giorni."));
    }
    shown.forEach(function (task) {
      var due = new Date(task.dueAt).getTime();
      var left = due - now;
      var mine = task.assigneeId === state.data.viewerId;
      var track = h("div", { class: "tl-track", title: task.name + " - scade " + when(task.dueAt) });
      if (task.paused) {
        track.appendChild(h("div", { class: "tl-bar paused" }));
        track.appendChild(h("span", { class: "tl-paused-label" }, "⏸ in pausa · fuori casa"));
      } else if (left < 0) {
        track.appendChild(h("div", { class: "tl-bar late" }));
        track.appendChild(h("span", { class: "tl-late-label" }, "in ritardo di " + shortLeft(left)));
      } else {
        var frac = Math.min(1, left / span);
        var cls = left < DAY ? "urgent" : left < 3 * DAY ? "soon" : "ok";
        track.appendChild(h("div", { class: "tl-bar " + cls, style: "width:" + (frac * 100) + "%" }));
        var inside = frac > 0.78;
        track.appendChild(h("span", { class: "tl-when" + (inside ? " inside" : ""), style: "left:" + (frac * 100) + "%" }, shortLeft(left)));
      }
      rows.appendChild(h("div", { class: "tl-row" },
        h("div", { class: "tl-label" },
          h("div", { class: "tl-name" }, task.name),
          h("div", { class: "tl-sub" + (mine ? " me" : "") }, whoLabel(task))
        ),
        track
      ));
    });
    rows.appendChild(h("div", { class: "tl-now" }));
    card.appendChild(axis);
    card.appendChild(rows);

    var foot = h("div", { class: "tl-foot" });
    if (visible.length > limit) {
      foot.appendChild(h("button", { class: "ghost", onclick: function () { state.tlExpanded = !state.tlExpanded; render(); } },
        state.tlExpanded ? "Mostra meno" : "Mostra tutte (" + visible.length + ")"));
    } else { foot.appendChild(h("span", {})); }
    if (hidden > 0) {
      foot.appendChild(h("span", {}, "+" + hidden + " piu' avanti"));
    }
    card.appendChild(foot);
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

  /** Editor dell'assegnazione: restituisce { el, value() } dove value() da' il payload per l'API. */
  function assignmentEditor(task) {
    var members = state.data.members;
    var a = {
      mode: task ? task.assignMode : "anyone",
      single: task && task.assignMode === "single" ? task.assignUserIds[0] : (members[0] ? members[0].id : null),
      rotation: task && task.assignMode === "alternate" ? task.assignUserIds.slice() : members.map(function (m) { return m.id; }),
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
        var order = a.rotation.map(memberName);
        body = h("div", {},
          h("div", { class: "chips" }, members.map(function (m) {
            var on = a.rotation.indexOf(m.id) >= 0;
            return h("button", { type: "button", class: "chip" + (on ? " on" : ""), onclick: function () {
              if (on) a.rotation = a.rotation.filter(function (x) { return x !== m.id; }); else a.rotation.push(m.id);
              draw();
            } }, m.displayName);
          })),
          h("div", { class: "muted", style: "margin-top:6px;font-size:.8rem" },
            a.rotation.length >= 2 ? "Ordine: " + order.join(" → ") + " → di nuovo " + order[0] : "Scegli almeno due persone.")
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
        if (a.mode === "alternate") return { mode: "alternate", userIds: a.rotation };
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
    return h("div", { class: "card" },
      h("div", { class: "row" },
        h("div", { class: "grow" },
          h("div", { class: "task-name" }, task.name),
          h("div", { class: "muted" }, task.frequency)
        ),
        h("span", { class: "tag " + task.severity }, SEVERITY[task.severity])
      ),
      h("div", { class: "row", style: "margin-top:6px" },
        h("span", { class: "who" + (task.assigneeId === state.data.viewerId ? " me" : "") }, "👤 " + whoLabel(task)),
        task.assignMode === "alternate" ? h("span", { class: "muted", style: "font-size:.8rem" }, "a turno") : null,
        task.assignMode === "custom" && task.slots.length > 1 ? h("span", { class: "muted", style: "font-size:.8rem" }, "poi " + task.slots[1].userName) : null
      ),
      h("div", { class: due.cls, style: "margin:6px 0" }, due.text),
      task.lastCompletedByName ? h("div", { class: "muted" }, "Ultima volta: " + task.lastCompletedByName) : null,
      h("div", { class: "row", style: "margin-top:10px" },
        h("button", { class: "primary", onclick: done }, "Fatto"),
        h("button", { onclick: function () { state.editing = task.id; state.adding = false; render(); } }, "Modifica"),
        h("button", { class: "danger ghost", onclick: remove }, "Elimina")
      )
    );
  }

  // ---------- Viste ----------
  function viewTasks() {
    var items = state.data.tasks.map(taskCard);
    return h("div", {},
      state.adding ? taskForm(null) : h("button", { class: "primary", onclick: function () { state.adding = true; state.editing = null; render(); } }, "+ Nuova attivita'"),
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
    morning: "Cosa e' in ritardo e cosa scade oggi, piu' le prossime 3 attivita' se vuoi portarti avanti.",
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
      example.textContent = "😬 Pulire il bagno · scaduta · tocca a " + someone + String.fromCharCode(10) +
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
    var parts = [header, viewAbsences(), viewTimeline(), tabs, state.error ? h("p", { class: "error" }, state.error) : null, view].filter(Boolean);
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
