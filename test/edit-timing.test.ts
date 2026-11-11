import { describe, expect, it } from "vitest";
import { getDueAt, getDueNotice } from "../src/services/policy.js";
import { createTestStore, day } from "./helpers.js";

const hour = 60 * 60 * 1000;

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  return { store, luca, house };
}

describe("modificare un'attivita' non fa scattare ritardi", () => {
  it("accorciare la frequenza non rende in ritardo chi era in regola", async () => {
    const { store, luca, house } = await setup();
    const start = new Date("2026-11-01T10:00:00Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 14 * day, "high", start);
    const now = new Date(start.getTime() + 10 * day); // mancano 4 giorni alla vecchia scadenza

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 3.5 * day }, now);
    const updated = result!.task;
    expect(getDueAt(updated).getTime()).toBe(now.getTime() + 3.5 * day);
    expect(getDueNotice(updated, now)).toBeNull();
  });

  it("accorciando non si supera mai la vecchia scadenza", async () => {
    const { store, luca, house } = await setup();
    const start = new Date("2026-11-01T10:00:00Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 14 * day, "high", start);
    const now = new Date(start.getTime() + 13 * day); // manca 1 giorno

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 3.5 * day }, now);
    expect(getDueAt(result!.task).getTime()).toBe(start.getTime() + 14 * day);
  });

  it("allungare la frequenza conta dall'ultimo Fatto", async () => {
    const { store, luca, house } = await setup();
    const start = new Date("2026-11-01T10:00:00Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 3.5 * day, "high", start);
    const now = new Date(start.getTime() + 1 * day);

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 14 * day }, now);
    expect(getDueAt(result!.task).getTime()).toBe(start.getTime() + 14 * day);
  });

  it("un'attivita' gia' in ritardo resta in ritardo uguale e non riceve un altro avviso", async () => {
    const { store, luca, house } = await setup();
    const start = new Date("2026-11-01T10:00:00Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "low", start);
    const due = start.getTime() + 7 * day;
    const now = new Date(due + 5 * hour);
    await store.markNoticesHandled(task.id, ["three_hours", "thirty_minutes", "overdue"], new Date(due));

    for (const updates of [{ name: "Bagno grande" }, { intervalMs: 3 * day }, { severity: "high" as const }]) {
      const result = await store.updateTask(house.id, task.id, luca.id, updates, now);
      expect(getDueAt(result!.task).getTime()).toBe(due);
      expect(getDueNotice(result!.task, now)).toBeNull();
    }
  });

  it("gli avvisi spostati nel futuro ripartono", async () => {
    const { store, luca, house } = await setup();
    const start = new Date("2026-11-01T10:00:00Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 1 * day, "low", start);
    const now = new Date(start.getTime() + 22 * hour);
    await store.markNoticesHandled(task.id, ["three_hours"], now);

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 7 * day }, now);
    expect(result!.task.reminderThreeHoursSentAt).toBeNull();
    expect(getDueNotice(result!.task, new Date(start.getTime() + 7 * day - 2 * hour))?.send.key).toBe("three_hours");
  });
});
