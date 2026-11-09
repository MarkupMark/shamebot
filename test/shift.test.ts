import { describe, expect, it } from "vitest";
import { getDueAt } from "../src/services/policy.js";
import { createTestStore, day } from "./helpers.js";

async function setup() {
  const { store, db } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  await store.addMember(house.id, luca.id);
  await store.addMember(house.id, anna.id);
  return { store, db, house, luca, anna };
}

const start = new Date("2026-11-01T10:00:00.000Z");
const now = new Date("2026-11-03T10:00:00.000Z");

describe("Centro di comando: sposta scadenze", () => {
  it("sposta solo le attivita' scelte, avanti o indietro, e scrive il registro", async () => {
    const { store, house, luca } = await setup();
    const bagno = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", start);
    const cucina = await store.createTask(house.id, luca.id, "Cucina", 3 * day, "medium", start);

    const later = await store.shiftTaskDeadlines(house.id, luca.id, [bagno.id], 3 * day, now);
    expect(later.map((task) => getDueAt(task).toISOString())).toEqual(["2026-11-11T10:00:00.000Z"]);

    await store.shiftTaskDeadlines(house.id, luca.id, [bagno.id, cucina.id], -2 * day, now);
    const byName = Object.fromEntries((await store.listTasks(house.id)).map((task) => [task.name, getDueAt(task).toISOString()]));
    expect(byName).toEqual({ Bagno: "2026-11-09T10:00:00.000Z", Cucina: "2026-11-02T10:00:00.000Z" });

    const log = await store.listLog(house.id);
    expect(log.slice(0, 3).map((entry) => entry.detail)).toEqual([
      "scadenza anticipata di 2 giorni",
      "scadenza anticipata di 2 giorni",
      "scadenza posticipata di 3 giorni",
    ]);
  });

  it("ignora attivita' di altre case e azzera i promemoria gia' inviati", async () => {
    const { store, db, house, luca } = await setup();
    const { house: other } = await store.getOrCreateHouse(-200, "Altra", luca.id);
    const foreign = await store.createTask(other.id, luca.id, "Altrui", 7 * day, "low", start);
    const mine = await store.createTask(house.id, luca.id, "Mia", 7 * day, "low", start);
    await db.run("UPDATE tasks SET overdue_notice_sent_at = ?, nudge_sent_at = ? WHERE id = ?", [now.toISOString(), now.toISOString(), mine.id]);

    const shifted = await store.shiftTaskDeadlines(house.id, luca.id, [foreign.id, mine.id], day, now);
    expect(shifted.map((task) => task.name)).toEqual(["Mia"]);
    expect(getDueAt((await store.getTask(other.id, foreign.id))!).toISOString()).toBe("2026-11-08T10:00:00.000Z");
    const row = await db.first("SELECT overdue_notice_sent_at, nudge_sent_at FROM tasks WHERE id = ?", [mine.id]);
    expect(row).toEqual({ overdue_notice_sent_at: null, nudge_sent_at: null });
  });

  it("per i turni personalizzati sposta tutti i turni aperti", async () => {
    const { store, house, luca, anna } = await setup();
    const task = await store.createTask(house.id, luca.id, "Vetri", 30 * day, "medium", start, null, {
      mode: "custom",
      slots: [
        { userId: luca.id, kind: "week", startsAt: "2026-11-09T00:00:00.000Z", dueAt: "2026-11-16T00:00:00.000Z" },
        { userId: anna.id, kind: "day", startsAt: "2026-11-20T00:00:00.000Z", dueAt: "2026-11-21T00:00:00.000Z" },
      ],
    });
    const [shifted] = await store.shiftTaskDeadlines(house.id, luca.id, [task.id], 2 * day, now);
    expect(getDueAt(shifted!).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect((await store.listOpenSlots(house.id)).map((slot) => [slot.startsAt, slot.dueAt])).toEqual([
      ["2026-11-11T00:00:00.000Z", "2026-11-18T00:00:00.000Z"],
      ["2026-11-22T00:00:00.000Z", "2026-11-23T00:00:00.000Z"],
    ]);
  });
});
