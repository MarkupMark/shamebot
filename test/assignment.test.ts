import { describe, expect, it } from "vitest";
import { getDueAt } from "../src/services/policy.js";
import { createTestStore, day } from "./helpers.js";

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  await store.addMember(house.id, luca.id);
  await store.addMember(house.id, anna.id);
  return { store, house, luca, anna };
}

describe("Assegnazione attivita'", () => {
  it("di default tocca a chiunque", async () => {
    const { store, house, luca } = await setup();
    const task = await store.createTask(house.id, luca.id, "Umido", 2 * day, "medium");
    expect(task.assignMode).toBe("anyone");
    expect(task.assigneeId).toBeNull();
  });

  it("solo un utente", async () => {
    const { store, house, luca, anna } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", new Date(), null, { mode: "single", userIds: [anna.id] });
    expect(task.assigneeName).toBe("Anna");
    const done = await store.completeTask(house.id, task.id, luca.id, new Date());
    expect(done?.assigneeName).toBe("Anna");
  });

  it("a turno: passa al prossimo a ogni completamento e non si azzera modificando solo il nome", async () => {
    const { store, house, luca, anna } = await setup();
    const task = await store.createTask(house.id, luca.id, "Piatti", day, "low", new Date(), null, {
      mode: "alternate",
      userIds: [luca.id, anna.id],
    });
    expect(task.assigneeName).toBe("Luca");
    expect((await store.completeTask(house.id, task.id, luca.id, new Date()))?.assigneeName).toBe("Anna");

    const renamed = await store.updateTask(house.id, task.id, luca.id, {
      name: "Lavare i piatti",
      assignment: { mode: "alternate", userIds: [luca.id, anna.id] },
    });
    expect(renamed?.task.assigneeName).toBe("Anna");
    expect(renamed?.changes).toEqual(['nome "Piatti" → "Lavare i piatti"']);

    expect((await store.completeTask(house.id, task.id, anna.id, new Date()))?.assigneeName).toBe("Luca");
  });

  it("personalizzato: il turno piu' vicino decide chi e quando, poi torna a chiunque", async () => {
    const { store, house, luca, anna } = await setup();
    const now = new Date("2026-11-06T10:00:00.000Z");
    const task = await store.createTask(house.id, luca.id, "Vetri", 30 * day, "medium", now, null, {
      mode: "custom",
      slots: [
        { userId: anna.id, kind: "month", startsAt: "2026-12-01T00:00:00.000Z", dueAt: "2027-01-01T00:00:00.000Z" },
        { userId: luca.id, kind: "week", startsAt: "2026-11-09T00:00:00.000Z", dueAt: "2026-11-16T00:00:00.000Z" },
      ],
    });
    expect(task.assigneeName).toBe("Luca");
    expect(getDueAt(task).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect((await store.listOpenSlots(house.id)).length).toBe(2);

    const afterFirst = await store.completeTask(house.id, task.id, luca.id, new Date("2026-11-10T10:00:00.000Z"));
    expect(afterFirst?.assigneeName).toBe("Anna");
    expect(getDueAt(afterFirst!).toISOString()).toBe("2027-01-01T00:00:00.000Z");

    const afterAll = await store.completeTask(house.id, task.id, anna.id, new Date("2026-12-05T10:00:00.000Z"));
    expect(afterAll?.assigneeId).toBeNull();
    expect(getDueAt(afterAll!).toISOString()).toBe(new Date(new Date("2026-12-05T10:00:00.000Z").getTime() + 30 * day).toISOString());
  });

  it("registra il cambio di assegnazione nel registro", async () => {
    const { store, house, luca, anna } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high");
    const result = await store.updateTask(house.id, task.id, luca.id, { assignment: { mode: "alternate", userIds: [anna.id, luca.id] } });
    expect(result?.changes).toEqual(["assegnazione chiunque → a turno: Anna, Luca"]);
    await store.deleteTask(house.id, task.id, luca.id);
  });
});
