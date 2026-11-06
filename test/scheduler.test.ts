import { describe, expect, it } from "vitest";
import { runDueChecks } from "../src/services/scheduler.js";
import { createTestStore, day } from "./helpers.js";

describe("runDueChecks", () => {
  it("scrive nel gruppo della casa e non ripete gli avvisi", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const created = new Date("2026-11-01T10:00:00.000Z");
    const { house } = await store.getOrCreateHouse(-555, "Casa", luca.id, created);
    const task = await store.createTask(house.id, luca.id, "Pulire il bagno", 7 * day, "high", created);
    await store.completeTask(house.id, task.id, luca.id, created);

    const sent: Array<{ chatId: number; text: string }> = [];
    const send = async (chatId: number, text: string) => {
      sent.push({ chatId, text });
    };

    expect(await runDueChecks(store, send, new Date("2026-11-03T10:00:00.000Z"))).toBe(0);

    expect(await runDueChecks(store, send, new Date("2026-11-08T08:00:00.000Z"))).toBe(1);
    expect(sent[0]?.chatId).toBe(-555);
    expect(sent[0]?.text).toBe("⏰ Pulire il bagno · tra 3h");

    expect(await runDueChecks(store, send, new Date("2026-11-08T08:05:00.000Z"))).toBe(0);

    expect(await runDueChecks(store, send, new Date("2026-11-08T09:40:00.000Z"))).toBe(1);
    expect(sent[1]?.text).toBe("⏰ Pulire il bagno · tra 30m");

    expect(await runDueChecks(store, send, new Date("2026-11-08T10:30:00.000Z"))).toBe(1);
    expect(sent[2]?.text).toBe("😬 Pulire il bagno · scaduta · ultima: Luca");

    expect(await runDueChecks(store, send, new Date("2026-11-09T11:00:00.000Z"))).toBe(1);
    expect(sent[3]?.text).toBe("🚨 Pulire il bagno · ritardo 1g 1h · ultima: Luca");
    expect(sent.length).toBe(4);
  });

  it("riprova l'invio se Telegram fallisce", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const created = new Date("2026-11-01T10:00:00.000Z");
    const { house } = await store.getOrCreateHouse(-555, "Casa", luca.id, created);
    await store.createTask(house.id, luca.id, "Umido", day, "medium", created);

    const now = new Date("2026-11-02T10:01:00.000Z");
    const failing = async () => {
      throw new Error("telegram down");
    };
    expect(await runDueChecks(store, failing, now)).toBe(0);

    const sent: string[] = [];
    expect(await runDueChecks(store, async (_chatId, text) => void sent.push(text), now)).toBe(1);
    expect(sent.length).toBe(1);
  });
});
