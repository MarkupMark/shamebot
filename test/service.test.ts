import { describe, expect, it } from "vitest";
import { HouseService } from "../src/services/houses.js";
import { formatLogEntry, groupCommands, parseFields, privateCommands } from "../src/bot/handlers.js";
import { createTestStore, day } from "./helpers.js";

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  const messages: string[] = [];
  const service = new HouseService(store, async (_chatId, text) => void messages.push(text));
  return { store, luca, house, messages, service };
}

describe("HouseService", () => {
  it("avvisa il gruppo alla creazione secondo l'impostazione della casa", async () => {
    const { service, luca, house, messages } = await setup();
    const result = await service.createTask(house, luca, { name: "Bagno", intervalMs: 7 * day, severity: "high" });
    expect(result.notified).toBe(true);
    expect(messages[0]).toBe("➕ Luca: Bagno · 1×/sett · importante");
  });

  it("permette di non avvisare per una singola azione", async () => {
    const { service, luca, house, messages } = await setup();
    const result = await service.createTask(house, luca, { name: "Bagno", intervalMs: 7 * day, severity: "high" }, { notify: false });
    expect(result.notified).toBe(false);
    expect(messages).toEqual([]);
  });

  it("rispetta l'impostazione 'notifiche spente' ma consente di forzare l'avviso", async () => {
    const { service, store, luca, house, messages } = await setup();
    await store.setHouseNotifyChanges(house.id, false);
    const silentHouse = (await store.getHouse(house.id))!;

    await service.createTask(silentHouse, luca, { name: "Bagno", intervalMs: 7 * day, severity: "high" });
    expect(messages).toEqual([]);

    await service.createTask(silentHouse, luca, { name: "Cucina", intervalMs: 7 * day, severity: "low" }, { notify: true });
    expect(messages.length).toBe(1);
  });

  it("annuncia la modifica con il cambio di frequenza", async () => {
    const { service, luca, house, messages } = await setup();
    const { task } = await service.createTask(house, luca, { name: "Lavare il bagno", intervalMs: 7 * day, severity: "medium" }, { notify: false });

    const result = await service.updateTask(house, luca, task.id, { intervalMs: 3.5 * day });
    expect(result?.notified).toBe(true);
    expect(messages[0]).toBe("✏️ Luca · Lavare il bagno\nfrequenza 1×/sett → 2×/sett");
  });

  it("non avvisa se la modifica non cambia nulla", async () => {
    const { service, luca, house, messages } = await setup();
    const { task } = await service.createTask(house, luca, { name: "Bagno", intervalMs: 7 * day, severity: "medium" }, { notify: false });
    const result = await service.updateTask(house, luca, task.id, { name: "Bagno" });
    expect(result?.notified).toBe(false);
    expect(messages).toEqual([]);
  });

  it("annuncia il completamento solo se richiesto", async () => {
    const { service, luca, house, messages } = await setup();
    const { task } = await service.createTask(house, luca, { name: "Bagno", intervalMs: 7 * day, severity: "medium" }, { notify: false });
    await service.completeTask(house, luca, task.id, false);
    expect(messages).toEqual([]);
    await service.completeTask(house, luca, task.id, true);
    expect(messages[0]).toBe("✅ Luca: Bagno · prossima tra 7g");
  });
});

describe("parseFields", () => {
  it("divide i campi e riconosce 'silenzioso'", () => {
    expect(parseFields("Bagno | 2 volte a settimana | importante | silenzioso")).toEqual({
      fields: ["Bagno", "2 volte a settimana", "importante"],
      silent: true,
    });
    expect(parseFields("2 | - | 3 giorni")).toEqual({ fields: ["2", "-", "3 giorni"], silent: false });
    expect(parseFields("")).toEqual({ fields: [], silent: false });
  });
});

describe("bot", () => {
  it("formatta le righe del registro in modo compatto", () => {
    const base = { id: 1, houseId: 1, userId: 1, userName: "Luca", taskId: 1, taskName: "Bagno", createdAt: "2026-11-06T13:30:00.000Z", restorable: false };
    expect(formatLogEntry({ ...base, kind: "done", detail: null }, "Europe/Rome")).toBe("06/11 14:30 · Luca ✅ Bagno");
    expect(formatLogEntry({ ...base, kind: "updated", detail: "frequenza 1×/sett → 2×/sett" }, "Europe/Rome")).toBe(
      "06/11 14:30 · Luca ✏️ Bagno (frequenza 1×/sett → 2×/sett)",
    );
    expect(formatLogEntry({ ...base, kind: "created", detail: "ripristinata" }, "Europe/Rome")).toBe("06/11 14:30 · Luca ♻️ Bagno");
  });

  it("espone i comandi suggeriti con descrizioni valide per Telegram", () => {
    for (const { command, description } of [...groupCommands, ...privateCommands]) {
      expect(command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(256);
    }
    expect(groupCommands.map((c) => c.command)).toEqual(expect.arrayContaining(["attivita", "fatto", "nuova", "modifica", "elimina", "log"]));
  });
});
