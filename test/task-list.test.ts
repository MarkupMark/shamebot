import { describe, expect, it } from "vitest";
import { formatTaskList } from "../src/services/notify.js";
import { sortTasksByDueDate } from "../src/utils/tasks.js";
import { anchorAtCreation, createTestStore, day, hour } from "./helpers.js";

describe("Elenco /attivita", () => {
  it("e' un elenco puntato con solo nome e scadenza, limitato alle prime N", async () => {
    const { store, db } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const start = new Date("2026-11-06T10:00:00.000Z");
    for (let i = 1; i <= 7; i += 1) {
      await store.createTask(house.id, luca.id, `Attivita ${i}`, i * day, "medium", start);
    }
    await store.createTask(house.id, luca.id, "Umido", 2 * hour, "high", new Date(start.getTime() - 7 * hour));
    await anchorAtCreation(db);

    const tasks = sortTasksByDueDate(await store.listTasks(house.id));
    const compact = formatTaskList(tasks, start, 5).split("\n");
    expect(compact).toEqual([
      "• Umido · ⚠️ in ritardo di 5h",
      "• Attivita 1 · entro sab 7",
      "• Attivita 2 · entro dom 8",
      "• Attivita 3 · entro lun 9",
      "• Attivita 4 · entro mar 10",
    ]);
    expect(formatTaskList(tasks, start).split("\n")).toHaveLength(8);
  });
});
