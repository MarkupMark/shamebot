/**
 * Anteprima del portale con dati finti, senza login Telegram ne' database:
 *   npm run preview  ->  http://localhost:8790
 * Le modifiche (Fatto, Salva...) vengono solo stampate in console, i dati non cambiano.
 * Si riavvia da solo quando modifichi i file in src/.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { renderAppPage } from "../src/web/page.js";
import { renderContributePage } from "../src/web/contribute.js";
import { defaultInsults } from "../src/services/insults.js";

const port = Number(process.env.PORT ?? 8790);

// Impostazioni dei promemoria: le modifiche dal portale restano in memoria finche' il server gira.
const digests: Record<string, { enabled: boolean; time: string; intro: string | null; skipIfEmpty: boolean }> = {
  morning: { enabled: true, time: "09:00", intro: null, skipIfEmpty: true },
  evening: { enabled: false, time: "21:00", intro: null, skipIfEmpty: true },
};
// I "tuoi" insulti; quelli degli altri coinquilini sono simulati solo come numero (sono segreti).
const insults: Record<string, string[]> = { low: [], medium: ["{nome}, {attivita} ti aspetta da ore"], high: [] };
// Fuori casa: Marco e' via da 2 giorni (confermato), Anna ha appena chiesto.
type PreviewAbsence = { id: number; userId: number; userName: string; status: string; startsAt: string; approvedByName: string | null };
let absences: PreviewAbsence[] = [
  { id: 1, userId: 3, userName: "Marco", status: "active", startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), approvedByName: "Tu" },
  { id: 2, userId: 2, userName: "Anna", status: "pending", startsAt: new Date(Date.now() - 20 * 60_000).toISOString(), approvedByName: null },
];
const insultsByOthers: Record<string, number> = { low: 0, medium: 2, high: 5 };

const digestText = {
  morning: { intro: "☀️ Buongiorno! Ecco cosa c'è da fare oggi", body: "In ritardo\n• Buttare l'umido · da 5h · 👤 Tu\n\nOggi\n• Lavatrice · entro le 21:00 · 👤 Anna\n\nSe vuoi fare altro oggi:\n• Pavimenti · entro dom 8\n• Pulire il bagno · entro mer 11 · 👤 Marco\n• Superfici cucina · entro gio 12" },
  evening: { intro: "🌙 Ecco cosa dovrai fare domani", body: "Domani\n• Pavimenti · entro le 14:00" },
};
const H = 3_600_000;
const D = 24 * H;

function buildData() {
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const task = (id: number, name: string, dueIn: number, extra: Record<string, unknown> = {}) => ({
    id, name, intervalMs: 7 * D, frequency: "ogni settimana", severity: "medium",
    dueAt: iso(dueIn), startAt: iso(dueIn - 7 * D), lastCompletedByName: "Anna", completedCount: 3,
    assignMode: "anyone", assignUserIds: [], assigneeId: null, assigneeName: null, slots: [], ...extra,
  });
  return {
    house: { id: 1, name: "Casa di prova", notifyChanges: true },
    viewerId: 1,
    now: iso(0),
    members: [
      { id: 1, displayName: "Tu", username: "tu" },
      { id: 2, displayName: "Anna", username: null },
      { id: 3, displayName: "Marco", username: null },
    ],
    digests: (["morning", "evening"] as const).map((kind) => ({
      kind,
      ...digests[kind],
      defaultIntro: digestText[kind].intro,
      preview: `${digests[kind].intro || digestText[kind].intro}\n\n${digestText[kind].body}`,
      previewEmpty: false,
    })),
    timezone: "Europe/Rome",
    absences,
    insults: (["low", "medium", "high"] as const).map((severity) => ({
      severity,
      mine: insults[severity],
      byOthers: insultsByOthers[severity],
      defaults: defaultInsults[severity],
    })),
    log: [
      { id: 1, houseId: 1, userId: 2, userName: "Anna", taskId: 2, taskName: "Lavatrice", kind: "done", detail: null, restorable: false, createdAt: iso(-3 * H) },
      { id: 2, houseId: 1, userId: 3, userName: "Marco", taskId: 4, taskName: "Pulire il bagno", kind: "updated", detail: "assegnazione chiunque → personalizzata (2 turni)", restorable: false, createdAt: iso(-D) },
    ],
    tasks: ([
      task(1, "Buttare l'umido", -5 * H, { assignMode: "alternate", assignUserIds: [1, 2], assigneeId: 1, assigneeName: "Tu", severity: "high" }),
      task(2, "Lavatrice", 9 * H, { assignMode: "single", assignUserIds: [2], assigneeId: 2, assigneeName: "Anna" }),
      task(3, "Pavimenti", 2.2 * D),
      task(4, "Pulire il bagno", 4.5 * D, {
        assignMode: "custom", assigneeId: 3, assigneeName: "Marco",
        slots: [
          { id: 1, userId: 3, userName: "Marco", kind: "week", startsAt: iso(-2.5 * D), dueAt: iso(4.5 * D) },
          { id: 2, userId: 1, userName: "Tu", kind: "day", startsAt: iso(10 * D), dueAt: iso(11 * D) },
        ],
      }),
      task(5, "Superfici cucina", 6.6 * D),
      task(6, "Vetri", 19 * D, { assignMode: "single", assignUserIds: [1], assigneeId: 1, assigneeName: "Tu" }),
      task(7, "Frigo", 52 * D),
    ] as Array<ReturnType<typeof task>>).map((t) => ({
      ...t,
      paused: t.assigneeId !== null && absences.some((a) => a.status === "active" && a.userId === t.assigneeId),
    })),
  };
}

createServer((req, res) => {
  const url = req.url ?? "/";
  if (url === "/" || url === "/login") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end(renderAppPage({ botUsername: "vergognati_bot", siteUrl: "" }));
  }
  if (url === "/contribuisci") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end(renderContributePage({ repoUrl: "https://github.com/MarkupMark/shamebot" }));
  }
  if (url === "/favicon.png") {
    res.setHeader("content-type", "image/png");
    return res.end(readFileSync(new URL("../favicon.png", import.meta.url)));
  }

  res.setHeader("content-type", "application/json");
  if (url === "/api/me") {
    return res.end(JSON.stringify({ user: { id: 1, displayName: "Tu", username: "tu" }, houses: [{ id: 1, name: "Casa di prova" }] }));
  }
  const absenceAction = url.match(/^\/api\/houses\/1\/absences(?:\/(\d+)\/(approve|cancel|end))?$/);
  if (absenceAction && req.method === "POST") {
    const [, id, action] = absenceAction;
    if (!id && !absences.some((a) => a.userId === 1)) {
      absences.push({ id: Date.now(), userId: 1, userName: "Tu", status: "pending", startsAt: new Date().toISOString(), approvedByName: null });
    } else if (action === "approve") {
      absences = absences.map((a) => (a.id === Number(id) ? { ...a, status: "active", approvedByName: "Tu" } : a));
    } else if (action) {
      absences = absences.filter((a) => a.id !== Number(id));
    }
    console.log(`[anteprima] POST ${url}`);
    return res.end(JSON.stringify(buildData()));
  }
  if (url.startsWith("/api/houses/1") || url === "/logout") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method !== "GET") console.log(`[anteprima] ${req.method} ${url} ${body}`);
      if (req.method === "PATCH" && url === "/api/houses/1") {
        const parsed = JSON.parse(body || "{}") as {
          digests?: Record<string, Partial<(typeof digests)[string]>>;
          insults?: Record<string, string[]>;
        };
        for (const [severity, messages] of Object.entries(parsed.insults ?? {})) {
          insults[severity] = messages.map((m) => m.trim()).filter(Boolean);
        }
        for (const [kind, update] of Object.entries(parsed.digests ?? {})) {
          if (digests[kind]) digests[kind] = { ...digests[kind], ...update, intro: update.intro?.trim() || null };
        }
        return res.end(JSON.stringify(buildData()));
      }
      res.end(JSON.stringify(req.method === "GET" ? buildData() : { ok: true }));
    });
    return;
  }
  res.statusCode = 404;
  res.end("{}");
}).listen(port, () => console.log(`Anteprima portale: http://localhost:${port}  (contribuisci: /contribuisci)`));
