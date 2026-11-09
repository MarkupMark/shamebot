import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { HouseStore } from "../src/services/store.js";
import { createD1Db } from "../src/services/db.js";

/** D1 finto basato su SQLite in memoria. */
function createFakeD1() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  const statement = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async <T>() => ((sqlite.prepare(sql).get(...params) as T | undefined) ?? null),
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...params) as T[] }),
    run: async () => {
      const result = sqlite.prepare(sql).run(...params);
      return { meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
    },
  });

  return {
    prepare: (sql: string) => statement(sql),
    batch: async () => [],
    exec: async () => ({}),
  } as unknown as D1Database;
}

async function setup() {
  const d1 = createFakeD1();
  const store = new HouseStore(createD1Db(d1));
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  const { house } = await store.getOrCreateHouse(-100, "Via Roma", luca.id);
  await store.addMember(house.id, luca.id);
  const lucaSession = await store.createWebSession(luca.id);
  const annaSession = await store.createWebSession(anna.id);

  const env = { BOT_TOKEN: "1:test", WEBHOOK_SECRET: "s", SHAMEBOT_DB: d1, BOT_PAUSED: "true", SITE_URL: "https://example.test" };
  const call = async (session: string | null, method: string, path: string, body?: unknown) => {
    const response = await worker.fetch(
      new Request(`https://example.test${path}`, {
        method,
        headers: { ...(session ? { Cookie: `shamebot_session=${session}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
    const text = await response.text();
    return { status: response.status, json: text.startsWith("{") ? JSON.parse(text) : text };
  };

  return { store, house, luca, anna, lucaSession, annaSession, call };
}

describe("portale", () => {
  it("serve la pagina e richiede l'autenticazione per le API", async () => {
    const { call } = await setup();
    const page = await call(null, "GET", "/");
    expect(page.status).toBe(200);
    expect(page.json).toContain("ShameBot");
    expect((await call(null, "GET", "/api/me")).status).toBe(401);
  });

  it("mostra solo le case di cui l'utente e' membro", async () => {
    const { call, lucaSession, annaSession, house } = await setup();
    const me = await call(lucaSession, "GET", "/api/me");
    expect(me.json.houses).toEqual([{ id: house.id, name: "Via Roma" }]);

    expect((await call(annaSession, "GET", "/api/me")).json.houses).toEqual([]);
    expect((await call(annaSession, "GET", `/api/houses/${house.id}`)).status).toBe(404);
  });

  it("crea, modifica, completa ed elimina attivita' scrivendo il registro", async () => {
    const { call, lucaSession, house } = await setup();
    const base = `/api/houses/${house.id}`;

    const created = await call(lucaSession, "POST", `${base}/tasks`, { name: "Lavare il bagno", interval: "1 volta a settimana", severity: "importante", notify: false });
    expect(created.status).toBe(201);
    const taskId = created.json.task.id as number;
    expect(created.json.task.frequency).toBe("1 volta a settimana");

    const patched = await call(lucaSession, "PATCH", `${base}/tasks/${taskId}`, { interval: "2 volte a settimana", notify: false });
    expect(patched.json.changes).toEqual(["frequenza 1×/sett → 2×/sett"]);

    expect((await call(lucaSession, "POST", `${base}/tasks/${taskId}/complete`)).status).toBe(200);

    const detail = await call(lucaSession, "GET", base);
    expect(detail.json.tasks[0]).toMatchObject({ name: "Lavare il bagno", lastCompletedByName: "Luca", frequency: "2 volte a settimana" });
    expect(detail.json.log.map((entry: { kind: string }) => entry.kind)).toEqual(["done", "updated", "created"]);

    expect((await call(lucaSession, "DELETE", `${base}/tasks/${taskId}?notify=0`)).status).toBe(200);
    expect((await call(lucaSession, "GET", base)).json.tasks).toEqual([]);
  });

  it("ripristina dal registro un'attivita' eliminata", async () => {
    const { call, lucaSession, house } = await setup();
    const base = `/api/houses/${house.id}`;
    const created = await call(lucaSession, "POST", `${base}/tasks`, { name: "Cucina", interval: "3 giorni", severity: "medio", notify: false });
    await call(lucaSession, "DELETE", `${base}/tasks/${created.json.task.id}?notify=0`);

    const log = (await call(lucaSession, "GET", base)).json.log as Array<{ id: number; kind: string; restorable: boolean }>;
    const deleted = log.find((entry) => entry.kind === "deleted")!;
    expect(deleted.restorable).toBe(true);

    const restored = await call(lucaSession, "POST", `${base}/log/${deleted.id}/restore`);
    expect(restored.status).toBe(201);
    expect(restored.json.task).toMatchObject({ name: "Cucina", frequency: "ogni 3 giorni" });
    expect((await call(lucaSession, "GET", base)).json.tasks.length).toBe(1);

    expect((await call(lucaSession, "POST", `${base}/log/${deleted.id}/restore`)).status).toBe(409);
  });

  it("rifiuta dati non validi", async () => {
    const { call, lucaSession, house } = await setup();
    const base = `/api/houses/${house.id}/tasks`;
    expect((await call(lucaSession, "POST", base, { name: "", interval: "1 settimana" })).status).toBe(400);
    expect((await call(lucaSession, "POST", base, { name: "Bagno", interval: "boh" })).status).toBe(400);
    expect((await call(lucaSession, "POST", base, { name: "Bagno", interval: "1 settimana", severity: "?" })).status).toBe(400);
  });

  it("aggiorna l'impostazione degli avvisi della casa", async () => {
    const { call, lucaSession, house } = await setup();
    const result = await call(lucaSession, "PATCH", `/api/houses/${house.id}`, { notifyChanges: false });
    expect(result.json.house.notifyChanges).toBe(false);
  });
});

describe("Centro di comando /admin", () => {
  it("serve la pagina e sposta le scadenze solo ai membri, validando i giorni", async () => {
    const { call, lucaSession, annaSession, house } = await setup();
    const page = await call(null, "GET", "/admin");
    expect(page.status).toBe(200);
    expect(page.json).toContain("Centro di comando");

    const base = `/api/houses/${house.id}`;
    const created = await call(lucaSession, "POST", `${base}/tasks`, { name: "Bagno", interval: "1 settimana", notify: false });
    const taskId = created.json.task.id as number;
    const before = new Date(created.json.task.dueAt).getTime();

    expect((await call(null, "POST", `${base}/tasks/shift`, { taskIds: [taskId], days: 2 })).status).toBe(401);
    expect((await call(annaSession, "POST", `${base}/tasks/shift`, { taskIds: [taskId], days: 2 })).status).toBe(404);
    expect((await call(lucaSession, "POST", `${base}/tasks/shift`, { taskIds: [taskId], days: 0 })).status).toBe(400);
    expect((await call(lucaSession, "POST", `${base}/tasks/shift`, { taskIds: [taskId], days: 1.5 })).status).toBe(400);
    expect((await call(lucaSession, "POST", `${base}/tasks/shift`, { taskIds: [], days: 2 })).status).toBe(400);

    const shifted = await call(lucaSession, "POST", `${base}/tasks/shift`, { taskIds: [taskId], days: -3 });
    expect(shifted.json.shifted).toBe(1);
    expect(new Date(shifted.json.tasks[0].dueAt).getTime()).toBe(before - 3 * 86_400_000);
  });
});

describe("Pagina /contribuisci", () => {
  it("e' pubblica e punta al repository con fork e prompt", async () => {
    const { call } = await setup();
    const { status, json } = await call(null, "GET", "/contribuisci");
    expect(status).toBe(200);
    expect(json).toContain("https://github.com/MarkupMark/shamebot/fork");
    expect(json).toContain("AGENTS.md");
  });
});

describe("Promemoria dal portale", () => {
  it("restituisce le impostazioni con anteprima e le salva validandole", async () => {
    const { lucaSession, house, call } = await setup();
    const initial = await call(lucaSession, "GET", `/api/houses/${house.id}`);
    expect(initial.json.digests.map((d: { kind: string; enabled: boolean; time: string }) => [d.kind, d.enabled, d.time])).toEqual([
      ["morning", true, "09:00"],
      ["evening", false, "21:00"],
    ]);
    expect(initial.json.digests[0].preview).toContain("Buongiorno");

    const saved = await call(lucaSession, "PATCH", `/api/houses/${house.id}`, {
      digests: { evening: { enabled: true, time: "22:15", intro: "  Notte!  " } },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.digests[1]).toMatchObject({ enabled: true, time: "22:15", intro: "Notte!" });
    expect(saved.json.digests[1].preview.startsWith("Notte!")).toBe(true);

    expect((await call(lucaSession, "PATCH", `/api/houses/${house.id}`, { digests: { evening: { time: "25:00" } } })).status).toBe(400);
    expect((await call(lucaSession, "PATCH", `/api/houses/${house.id}`, { digests: { pranzo: { enabled: true } } })).status).toBe(400);
  });
});

describe("Insulti dal portale", () => {
  it("ognuno vede e modifica solo i propri; degli altri vede solo quanti sono", async () => {
    const { store, lucaSession, annaSession, house, anna, call } = await setup();
    await store.addMember(house.id, anna.id);

    const saved = await call(lucaSession, "PATCH", `/api/houses/${house.id}`, { insults: { high: ["  {nome}, vergogna!  ", ""] } });
    expect(saved.status).toBe(200);
    expect(saved.json.insults[2]).toMatchObject({ severity: "high", mine: ["{nome}, vergogna!"], byOthers: 0 });

    const annaView = await call(annaSession, "GET", `/api/houses/${house.id}`);
    expect(annaView.json.insults[2]).toMatchObject({ mine: [], byOthers: 1 });
    expect(JSON.stringify(annaView.json)).not.toContain("vergogna");

    // Anna non puo' toccare quelli di Luca: salva i suoi e quelli di Luca restano.
    await call(annaSession, "PATCH", `/api/houses/${house.id}`, { insults: { high: [] } });
    const lucaView = await call(lucaSession, "GET", `/api/houses/${house.id}`);
    expect(lucaView.json.insults[2].mine).toEqual(["{nome}, vergogna!"]);

    expect((await call(lucaSession, "PATCH", `/api/houses/${house.id}`, { insults: { altissima: ["x"] } })).status).toBe(400);
  });
});

describe("Fuori casa dal portale", () => {
  it("richiesta, conferma di un altro, attivita' in pausa e rientro", async () => {
    const { store, lucaSession, annaSession, house, luca, anna, call } = await setup();
    await store.addMember(house.id, anna.id);
    await store.createTask(house.id, luca.id, "Bagno", 7 * 24 * 3600 * 1000, "high", new Date(), null, { mode: "single", userIds: [luca.id] });

    const requested = await call(lucaSession, "POST", `/api/houses/${house.id}/absences`);
    expect(requested.status).toBe(201);
    const absence = requested.json.absences[0];
    expect(absence).toMatchObject({ userId: luca.id, status: "pending" });

    expect((await call(lucaSession, "POST", `/api/houses/${house.id}/absences/${absence.id}/approve`)).status).toBe(409);
    const approved = await call(annaSession, "POST", `/api/houses/${house.id}/absences/${absence.id}/approve`);
    expect(approved.json.absences[0].status).toBe("active");
    expect(approved.json.tasks[0].paused).toBe(true);

    const ended = await call(annaSession, "POST", `/api/houses/${house.id}/absences/${absence.id}/end`);
    expect(ended.json.absences).toEqual([]);
    expect(ended.json.tasks[0].paused).toBe(false);
  });
});
