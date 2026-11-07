import { describe, expect, it } from "vitest";
import { createTestStore, day } from "./helpers.js";

async function setup() {
  const { store, db } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  return { store, db, luca, anna };
}

describe("HouseStore", () => {
  it("crea la casa una sola volta per gruppo e gestisce i membri", async () => {
    const { store, luca, anna } = await setup();
    const first = await store.getOrCreateHouse(-100, "Via Roma", luca.id);
    const second = await store.getOrCreateHouse(-100, "Altro nome", anna.id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.house.id).toBe(first.house.id);

    expect(await store.addMember(first.house.id, luca.id)).toBe(true);
    expect(await store.addMember(first.house.id, luca.id)).toBe(false);
    await store.addMember(first.house.id, anna.id);
    expect((await store.listMembers(first.house.id)).map((m) => m.displayName)).toEqual(["Luca", "Anna"]);
    expect((await store.listHousesForUser(anna.id)).length).toBe(1);
  });

  it("la prima casa adotta le attivita' preesistenti senza casa, azzerando i cicli", async () => {
    const { store, db, luca } = await setup();
    await db.run(
      `INSERT INTO tasks (owner_id, name, interval_ms, severity, cycle_anchor_at, created_at, updated_at)
       VALUES (?, 'Pulire il bagno', ?, 'high', '2026-03-14T00:00:00.000Z', '2026-03-14T00:00:00.000Z', '2026-03-14T00:00:00.000Z')`,
      [luca.id, 7 * day],
    );

    const now = new Date("2026-11-06T10:00:00.000Z");
    const { house, adoptedTasks } = await store.getOrCreateHouse(-100, "Casa", luca.id, now);
    expect(adoptedTasks).toBe(1);
    const tasks = await store.listTasks(house.id);
    expect(tasks[0]?.name).toBe("Pulire il bagno");
    expect(tasks[0]?.cycleAnchorAt).toBe(now.toISOString());

    const secondHouse = await store.getOrCreateHouse(-200, "Altra", luca.id);
    expect(secondHouse.adoptedTasks).toBe(0);
  });

  it("completa un'attivita', ricorda chi l'ha fatta e scrive il registro", async () => {
    const { store, luca, anna } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Umido", 4 * day, "high", new Date("2026-11-05T10:00:00.000Z"));

    const done = await store.completeTask(house.id, task.id, anna.id, new Date("2026-11-06T10:00:00.000Z"));
    expect(done?.lastCompletedByName).toBe("Anna");
    expect(done?.completedCount).toBe(1);
    expect(done?.cycleAnchorAt).toBe("2026-11-06T10:00:00.000Z");

    const log = await store.listLog(house.id);
    expect(log.map((entry) => [entry.kind, entry.userName])).toEqual([["done", "Anna"], ["created", "Luca"]]);
  });

  it("modifica registrando cosa e' cambiato e ignorando le modifiche nulle", async () => {
    const { store, luca } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium");

    const noop = await store.updateTask(house.id, task.id, luca.id, { name: "Bagno" });
    expect(noop?.changes).toEqual([]);

    const result = await store.updateTask(house.id, task.id, luca.id, { intervalMs: 3.5 * day });
    expect(result?.changes).toEqual(["frequenza 1×/sett → 2×/sett"]);
    const log = await store.listLog(house.id);
    expect(log[0]).toMatchObject({ kind: "updated", detail: "frequenza 1×/sett → 2×/sett" });
  });

  it("non tocca le attivita' di un'altra casa", async () => {
    const { store, luca } = await setup();
    const a = await store.getOrCreateHouse(-100, "A", luca.id);
    const b = await store.getOrCreateHouse(-200, "B", luca.id);
    const task = await store.createTask(a.house.id, luca.id, "Bagno", 7 * day, "medium");

    expect(await store.getTask(b.house.id, task.id)).toBeNull();
    expect(await store.updateTask(b.house.id, task.id, luca.id, { name: "X" })).toBeNull();
    expect(await store.completeTask(b.house.id, task.id, luca.id, new Date())).toBeNull();
    expect(await store.deleteTask(b.house.id, task.id, luca.id)).toBeNull();
  });

  it("elimina anche un'attivita' con righe della vecchia versione (bonus_usages)", async () => {
    const { store, db, luca } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium");
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO bonus_usages (owner_id, task_id, hours, extension_ms, used_at, created_at) VALUES (?, ?, 2, 7200000, ?, ?)",
      [luca.id, task.id, now, now],
    );

    expect((await store.deleteTask(house.id, task.id, luca.id))?.name).toBe("Bagno");
    expect(await store.listTasks(house.id)).toEqual([]);
  });

  it("elimina l'attivita' ma ne conserva la traccia nel registro", async () => {
    const { store, luca } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium");
    await store.completeTask(house.id, task.id, luca.id, new Date());

    expect((await store.deleteTask(house.id, task.id, luca.id))?.name).toBe("Bagno");
    expect(await store.listTasks(house.id)).toEqual([]);
    const log = await store.listLog(house.id);
    expect(log.map((entry) => entry.kind)).toEqual(["deleted", "done", "created"]);
  });

  it("segna le fasi di notifica e le azzera quando l'attivita' viene completata", async () => {
    const { store, luca } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium");

    await store.markNoticesHandled(task.id, ["three_hours", "overdue"], new Date());
    const marked = await store.getTask(house.id, task.id);
    expect(marked?.reminderThreeHoursSentAt).not.toBeNull();
    expect(marked?.overdueNoticeSentAt).not.toBeNull();
    expect(marked?.nudgeSentAt).toBeNull();

    const completed = await store.completeTask(house.id, task.id, luca.id, new Date());
    expect(completed?.reminderThreeHoursSentAt).toBeNull();
    expect(completed?.overdueNoticeSentAt).toBeNull();
  });

  it("gestisce login web e sessioni", async () => {
    const { store, luca } = await setup();
    const request = await store.createWebLoginRequest(new Date(Date.now() + 60_000));
    expect((await store.getWebLoginRequest(request.token))?.status).toBe("pending");
    expect(await store.claimWebLoginRequest(request.token, new Date())).toBeNull();

    await store.approveWebLoginRequest(request.token, { telegramId: luca.telegramId, username: "luca", displayName: "Luca" }, new Date());
    expect((await store.claimWebLoginRequest(request.token, new Date()))?.status).toBe("claimed");

    const session = await store.createWebSession(luca.id);
    expect((await store.getUserBySession(session))?.id).toBe(luca.id);
    await store.destroyWebSession(session);
    expect(await store.getUserBySession(session)).toBeNull();
  });

  it("ripristina un'attivita' eliminata dal registro, una sola volta", async () => {
    const { store, luca, anna } = await setup();
    const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 3.5 * day, "high", new Date("2026-11-01T10:00:00.000Z"));

    // Finche' l'attivita' esiste nessuna voce e' ripristinabile.
    expect((await store.listLog(house.id)).some((entry) => entry.restorable)).toBe(false);

    await store.deleteTask(house.id, task.id, luca.id);
    const log = await store.listLog(house.id);
    expect(log.filter((entry) => entry.restorable).map((entry) => entry.kind).sort()).toEqual(["created", "deleted"]);

    const deletedEntry = log.find((entry) => entry.kind === "deleted")!;
    const restored = await store.restoreTask(house.id, deletedEntry.id, anna.id);
    expect(restored).toMatchObject({ name: "Bagno", intervalMs: 3.5 * day, severity: "high" });
    expect(new Date(restored!.cycleAnchorAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(restored?.id).not.toBe(task.id);

    const after = await store.listLog(house.id);
    expect(after[0]).toMatchObject({ kind: "created", detail: "ripristinata", userName: "Anna", restorable: false });
    expect(after.some((entry) => entry.restorable)).toBe(false);
    expect(await store.restoreTask(house.id, deletedEntry.id, anna.id)).toBeNull();
  });

  it("non ripristina voci di un'altra casa o che non sono aggiunte/eliminate", async () => {
    const { store, luca } = await setup();
    const a = await store.getOrCreateHouse(-100, "A", luca.id);
    const b = await store.getOrCreateHouse(-200, "B", luca.id);
    const task = await store.createTask(a.house.id, luca.id, "Bagno", 7 * day, "medium");
    await store.completeTask(a.house.id, task.id, luca.id, new Date());
    await store.deleteTask(a.house.id, task.id, luca.id);

    const log = await store.listLog(a.house.id);
    const done = log.find((entry) => entry.kind === "done")!;
    const deleted = log.find((entry) => entry.kind === "deleted")!;
    expect(await store.restoreTask(a.house.id, done.id, luca.id)).toBeNull();
    expect(await store.restoreTask(b.house.id, deleted.id, luca.id)).toBeNull();
  });
});
