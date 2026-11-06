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

describe("Pagina /contribuisci", () => {
  it("e' pubblica e punta al repository con fork e prompt", async () => {
    const { call } = await setup();
    const { status, json } = await call(null, "GET", "/contribuisci");
    expect(status).toBe(200);
    expect(json).toContain("https://github.com/MarkupMark/shamebot/fork");
    expect(json).toContain("AGENTS.md");
  });
});
