import { describe, expect, it } from "vitest";
import { createTestStore, day } from "./helpers.js";
import { getDueAt } from "../src/services/policy.js";

/** Scadenze vecchie (creazione + frequenza) portate alla fine del loro periodo, una volta sola. */
describe("alignDeadlinesToPeriods", () => {
  async function setup() {
    const { store, db } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    return { store, db, luca, house };
  }

  /** Simula un'attivita' di prima dei periodi fissi: scadenza = `due`, mai allineata. */
  async function legacy(db: Awaited<ReturnType<typeof setup>>["db"], id: number, due: Date, intervalMs: number) {
    await db.run("UPDATE tasks SET cycle_anchor_at = ?, period_aligned = 0 WHERE id = ?", [
      new Date(due.getTime() - intervalMs).toISOString(),
      id,
    ]);
  }

  it("settimanale: la scadenza diventa la domenica (mezzanotte di Roma)", async () => {
    const { store, db, luca, house } = await setup();
    const now = new Date("2026-11-10T10:00:00.000Z"); // martedi'
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium", now);
    await legacy(db, task.id, new Date("2026-11-12T15:00:00.000Z"), 7 * day); // giovedi' pomeriggio

    expect(await store.alignDeadlinesToPeriods(now)).toBe(1);
    const after = (await store.getTask(house.id, task.id))!;
    expect(getDueAt(after).toISOString()).toBe("2026-11-15T23:00:00.000Z"); // fine di domenica 15

    // Una volta sola: uno spostamento successivo (es. fuori casa) non viene riallineato.
    await legacy(db, task.id, new Date("2026-11-18T15:00:00.000Z"), 7 * day);
    await db.run("UPDATE tasks SET period_aligned = 1 WHERE id = ?", [task.id]);
    expect(await store.alignDeadlinesToPeriods(now)).toBe(0);
  });

  it("2 volte a settimana: fine della meta' di settimana (mer o dom)", async () => {
    const { store, db, luca, house } = await setup();
    const now = new Date("2026-11-09T08:00:00.000Z"); // lunedi'
    const task = await store.createTask(house.id, luca.id, "Robottino", 3.5 * day, "low", now);
    await legacy(db, task.id, new Date("2026-11-10T12:00:00.000Z"), 3.5 * day); // martedi'

    await store.alignDeadlinesToPeriods(now);
    const after = (await store.getTask(house.id, task.id))!;
    expect(getDueAt(after).toISOString()).toBe("2026-11-11T23:00:00.000Z"); // fine di mercoledi' 11
  });

  it("ogni mese: fine del mese di calendario", async () => {
    const { store, db, luca, house } = await setup();
    const now = new Date("2026-11-05T08:00:00.000Z");
    const task = await store.createTask(house.id, luca.id, "Frigo", 30 * day, "low", now);
    await legacy(db, task.id, new Date("2026-11-20T12:00:00.000Z"), 30 * day);

    await store.alignDeadlinesToPeriods(now);
    const after = (await store.getTask(house.id, task.id))!;
    expect(getDueAt(after).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("non tocca le attivita' gia' in ritardo", async () => {
    const { store, db, luca, house } = await setup();
    const now = new Date("2026-11-12T10:00:00.000Z");
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium", now);
    const lateDue = new Date("2026-11-11T15:00:00.000Z");
    await legacy(db, task.id, lateDue, 7 * day);

    expect(await store.alignDeadlinesToPeriods(now)).toBe(0);
    expect(getDueAt((await store.getTask(house.id, task.id))!).toISOString()).toBe(lateDue.toISOString());
  });
});
