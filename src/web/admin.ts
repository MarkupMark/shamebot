/**
 * Centro di comando (/admin): pagina non linkata dal portale per spostare in blocco le scadenze.
 * Usa la stessa sessione del portale (cookie o Mini App) e l'API /api/houses/:id/tasks/shift.
 * Come in page.ts, il codice client evita template literal e backslash.
 */
export function renderAdminPage(): string {
  return ADMIN_TEMPLATE;
}

const ADMIN_TEMPLATE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>ShameBot - Centro di comando</title>
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
  main { max-width: 640px; margin: 0 auto; padding: 16px 16px 110px; }
  h1 { font-size: 1.35rem; margin: 6px 0 2px; }
  a { color: var(--accent); }
  .muted { color: var(--muted); font-size: .9rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin: 12px 0; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .back { font-size: .8rem; text-decoration: none; padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--card); color: var(--muted); white-space: nowrap; margin-top: 8px; }
  button, select { font: inherit; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); padding: 9px 12px; cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-text); border-color: transparent; font-weight: 600; }
  button.primary.confirm { background: var(--warn); }
  .label { font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
  .stepper { display: flex; align-items: center; gap: 10px; }
  .stepper button { width: 46px; height: 46px; padding: 0; font-size: 1.4rem; line-height: 1; border-radius: 12px; flex-shrink: 0; }
  .stepper .value { flex: 1; text-align: center; }
  .stepper .num { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .stepper .num.plus { color: var(--ok); } .stepper .num.minus { color: var(--late); }
  .stepper .what { font-size: .85rem; color: var(--muted); }
  .chips { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
  .chips button { flex: 1; min-width: 44px; padding: 6px 0; font-size: .85rem; border-radius: 99px; font-variant-numeric: tabular-nums; }
  .chips button.on { background: var(--text); color: var(--bg); border-color: transparent; font-weight: 600; }
  .selbar { display: flex; align-items: center; gap: 8px; margin: 18px 2px 6px; }
  .selbar .grow { flex: 1; font-size: .88rem; color: var(--muted); }
  .selbar button { padding: 4px 10px; font-size: .82rem; border-radius: 99px; }
  .task { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin: 6px 0; cursor: pointer; user-select: none; }
  .task.on { border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
  .task input { width: 20px; height: 20px; accent-color: var(--accent); flex-shrink: 0; margin: 0; }
  .task .grow { flex: 1; min-width: 0; }
  .task .name { font-weight: 600; font-size: .95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task .sub { font-size: .8rem; color: var(--muted); }
  .dates { font-size: .82rem; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .dates .old { color: var(--muted); }
  .task.on .dates .old { text-decoration: line-through; }
  .dates .new { font-weight: 600; color: var(--accent); }
  .late, .dates .late { color: var(--late); font-weight: 600; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); border-top: 1px solid var(--line); }
  .bar-in { max-width: 608px; margin: 0 auto; display: flex; gap: 10px; align-items: center; }
  .bar button.primary { flex: 1; padding: 12px; }
  .toast { margin: 10px 0; padding: 10px 12px; border-radius: 12px; font-size: .9rem; background: color-mix(in srgb, var(--ok) 15%, var(--card)); border: 1px solid var(--ok); }
  .toast.err { background: color-mix(in srgb, var(--late) 12%, var(--card)); border-color: var(--late); }
</style>
</head>
<body>
<main id="app"><p class="muted">Caricamento...</p></main>
<script>
(function () {
  var DAY = 86400000;
  var QUICK = [-7, -3, -1, 1, 3, 7];
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.ready) tg.ready();
  var app = document.getElementById("app");
  var state = { houses: [], houseId: null, tasks: [], selected: {}, days: 1, confirm: false, busy: false, toast: null };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (key) {
      if (key.indexOf("on") === 0) el.addEventListener(key.slice(2), a[key]);
      else if (key === "checked" || key === "disabled" || key === "selected") el[key] = !!a[key];
      else if (a[key] !== null && a[key] !== undefined) el.setAttribute(key, a[key]);
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
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) { var err = new Error(json.error || "Errore " + res.status); err.status = res.status; throw err; }
        return json;
      });
    });
  }

  function boot() {
    return api("GET", "/api/me").then(function (me) {
      state.houses = me.houses;
      if (!me.houses.length) { message("Non sei ancora in nessuna casa. Entra da un gruppo Telegram col bot."); return; }
      var saved = null;
      try { saved = Number(localStorage.getItem("house")); } catch (e) {}
      var found = me.houses.filter(function (x) { return x.id === saved; })[0];
      state.houseId = (found || me.houses[0]).id;
      return loadHouse();
    }).catch(function (err) {
      if (err.status === 401 && tg && tg.initData) {
        return api("POST", "/auth/telegram/miniapp", { initData: tg.initData }).then(boot).catch(function (e) { message(e.message); });
      }
      if (err.status === 401) { loginNeeded(); return; }
      message(err.message);
    });
  }

  function loadHouse() {
    return api("GET", "/api/houses/" + state.houseId).then(function (data) {
      state.tasks = data.tasks.slice().sort(function (a, b) { return new Date(a.dueAt) - new Date(b.dueAt); });
      var ids = {};
      state.tasks.forEach(function (t) { ids[t.id] = true; });
      Object.keys(state.selected).forEach(function (id) { if (!ids[id]) delete state.selected[id]; });
      render();
    }).catch(function (err) { message(err.message); });
  }

  function message(text) {
    app.replaceChildren(h("h1", null, "🛠 Centro di comando"), h("p", { class: "muted" }, text));
  }

  function loginNeeded() {
    app.replaceChildren(
      h("h1", null, "🛠 Centro di comando"),
      h("p", { class: "muted" }, "Prima accedi al portale con Telegram, poi torna su questa pagina."),
      h("p", null, h("a", { href: "/" }, "Vai al portale"))
    );
  }

  function selectedIds() {
    return state.tasks.filter(function (t) { return state.selected[t.id]; }).map(function (t) { return t.id; });
  }

  function fmt(iso) {
    return new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function daysText(n) {
    var abs = Math.abs(n);
    return (n > 0 ? "Posticipa" : "Anticipa") + " di " + abs + (abs === 1 ? " giorno" : " giorni");
  }

  function setDays(n) {
    if (n === 0) n = state.days > 0 ? -1 : 1;
    state.days = Math.max(-365, Math.min(365, n));
    state.confirm = false;
    render();
  }

  function toggle(id) {
    if (state.selected[id]) delete state.selected[id]; else state.selected[id] = true;
    state.confirm = false;
    render();
  }

  function apply() {
    var ids = selectedIds();
    if (!ids.length || state.busy) return;
    if (!state.confirm) { state.confirm = true; render(); return; }
    state.busy = true; state.confirm = false; render();
    api("POST", "/api/houses/" + state.houseId + "/tasks/shift", { taskIds: ids, days: state.days }).then(function (res) {
      state.toast = { ok: true, text: "✅ " + daysText(state.days).replace("Posticipa", "Posticipate").replace("Anticipa", "Anticipate") + ": " + res.shifted + " attività" };
      state.busy = false;
      return loadHouse();
    }).catch(function (err) {
      state.busy = false;
      state.toast = { ok: false, text: err.message };
      render();
    });
  }

  function render() {
    var now = Date.now();
    var ids = selectedIds();
    var shift = state.days * DAY;

    var top = h("div", { class: "top" },
      h("div", null,
        h("h1", null, "🛠 Centro di comando"),
        h("div", { class: "muted" }, "Sposta in blocco le scadenze delle attività.")),
      h("a", { class: "back", href: "/" }, "← Portale"));

    var houseSel = null;
    if (state.houses.length > 1) {
      houseSel = h("select", { style: "width:100%;margin-top:12px", onchange: function (e) {
        state.houseId = Number(e.target.value); state.selected = {}; state.toast = null;
        try { localStorage.setItem("house", String(state.houseId)); } catch (err) {}
        loadHouse();
      } }, state.houses.map(function (x) { return h("option", { value: String(x.id), selected: x.id === state.houseId }, x.name); }));
    }

    var stepper = h("div", { class: "card" },
      h("div", { class: "label" }, "Quanti giorni"),
      h("div", { class: "stepper" },
        h("button", { "aria-label": "Un giorno in meno", onclick: function () { setDays(state.days - 1); } }, "−"),
        h("div", { class: "value" },
          h("div", { class: "num " + (state.days > 0 ? "plus" : "minus") }, (state.days > 0 ? "+" : "−") + Math.abs(state.days)),
          h("div", { class: "what" }, daysText(state.days))),
        h("button", { "aria-label": "Un giorno in più", onclick: function () { setDays(state.days + 1); } }, "+")),
      h("div", { class: "chips" }, QUICK.map(function (n) {
        return h("button", { class: state.days === n ? "on" : "", onclick: function () { setDays(n); } }, (n > 0 ? "+" : "−") + Math.abs(n));
      })));

    var allOn = state.tasks.length > 0 && ids.length === state.tasks.length;
    var selbar = h("div", { class: "selbar" },
      h("div", { class: "grow" }, ids.length + " di " + state.tasks.length + " selezionate"),
      h("button", { onclick: function () {
        if (allOn) state.selected = {};
        else state.tasks.forEach(function (t) { state.selected[t.id] = true; });
        state.confirm = false; render();
      } }, allOn ? "Nessuna" : "Tutte"));

    var list = state.tasks.length ? state.tasks.map(function (t) {
      var on = !!state.selected[t.id];
      var due = new Date(t.dueAt).getTime();
      var late = due < now;
      var sub = [t.frequency, t.assigneeName ? "👤 " + t.assigneeName : (t.assignMode === "anyone" ? "chiunque" : null)].filter(Boolean).join(" · ");
      var dates = h("div", { class: "dates" },
        h("span", { class: "old" + (late && !on ? " late" : "") }, (late ? "in ritardo · " : "") + fmt(t.dueAt)),
        on ? h("span", null, " → ", h("span", { class: "new" + (due + shift < now ? " late" : "") }, fmt(new Date(due + shift).toISOString()))) : null);
      return h("label", { class: "task" + (on ? " on" : "") },
        h("input", { type: "checkbox", checked: on, onchange: function () { toggle(t.id); } }),
        h("div", { class: "grow" },
          h("div", { class: "name" }, t.name),
          h("div", { class: "sub" }, sub),
          dates));
    }) : h("p", { class: "muted" }, "Nessuna attività in questa casa.");

    var toast = state.toast ? h("div", { class: "toast" + (state.toast.ok ? "" : " err") }, state.toast.text) : null;

    var label = state.busy ? "Applico..." : !ids.length ? "Seleziona le attività" :
      state.confirm ? "Confermi? " + daysText(state.days).toLowerCase() + " (" + ids.length + ")" :
      daysText(state.days) + " · " + ids.length + " attività";
    var bar = h("div", { class: "bar" }, h("div", { class: "bar-in" },
      h("button", { class: "primary" + (state.confirm ? " confirm" : ""), disabled: !ids.length || state.busy, onclick: apply }, label)));

    app.replaceChildren.apply(app, [top, houseSel, toast, stepper, selbar, h("div", null, list), bar].filter(Boolean));
  }

  boot();
})();
</script>
</body>
</html>
`;
