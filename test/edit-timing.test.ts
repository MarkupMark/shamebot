import { describe, expect, it } from "vitest";
import { getDueAt, getDueNotice } from "../src/services/policy.js";
import { createTestStore, day } from "./helpers.js";

const hour = 60 * 60 * 1000;
const week = 7 * day;
/** Ora italiana (novembre = UTC+1). */
const rome = (local: string) => new Date(`${local}+01:00`);

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  return { store, luca, house };
}

describe("modificare un'attivita' non fa scattare ritardi", () => {
  it("accorciare la frequenza non rende in ritardo chi era in regola", async () => {
    const { store, luca, house } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 2 * week, "high", rome("2026-11-09T10:00:00"));
    const now = rome("2026-11-12T10:00:00"); // giovedi', la vecchia scadenza e' domenica 22

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 3.5 * day }, now);
    const updated = result!.task;
    expect(getDueAt(updated).toISOString()).toBe(rome("2026-11-16T00:00:00").toISOString()); // fine di gio-dom
    expect(getDueNotice(updated, now)).toBeNull();
  });

  it("accorciando non si supera mai la vecchia scadenza", async () => {
    const { store, luca, house } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 2 * week, "high", rome("2026-11-02T10:00:00"));
    const oldDue = getDueAt(task).getTime();
    const now = new Date(oldDue - day); // manca 1 giorno

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: week }, now);
    expect(getDueAt(result!.task).getTime()).toBe(oldDue);
  });

  it("allungare la frequenza non anticipa mai la scadenza", async () => {
    const { store, luca, house } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 3.5 * day, "high", rome("2026-11-09T10:00:00"));
    const now = rome("2026-11-10T10:00:00");

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 30 * day }, now);
    expect(getDueAt(result!.task).toISOString()).toBe(rome("2026-12-01T00:00:00").toISOString()); // fine mese
  });

  it("un'attivita' gia' in ritardo resta in ritardo uguale e non riceve un altro avviso", async () => {
    const { store, luca, house } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", week, "low", rome("2026-11-02T10:00:00"));
    const due = getDueAt(task).getTime();
    const now = new Date(due + 10 * hour);
    await store.markNoticesHandled(task.id, ["three_hours", "overdue"], new Date(due));

    for (const updates of [{ name: "Bagno grande" }, { intervalMs: 3 * day }, { severity: "high" as const }]) {
      const result = await store.updateTask(house.id, task.id, luca.id, updates, now);
      expect(getDueAt(result!.task).getTime()).toBe(due);
      expect(getDueNotice(result!.task, now)).toBeNull();
    }
  });

  it("gli avvisi spostati nel futuro ripartono", async () => {
    const { store, luca, house } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", day, "low", rome("2026-11-02T07:00:00"));
    const now = rome("2026-11-02T10:00:00");
    await store.markNoticesHandled(task.id, ["three_hours"], now);

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: week }, now);
    expect(result!.task.reminderThreeHoursSentAt).toBeNull();
    expect(getDueNotice(result!.task, rome("2026-11-08T10:00:00"))?.send.key).toBe("three_hours"); // domenica alle 9
  });
});
