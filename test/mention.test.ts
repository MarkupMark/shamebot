import { describe, expect, it } from "vitest";
import { mention, renderMentions } from "../src/utils/mention.js";
import { HouseService } from "../src/services/houses.js";
import { runDueChecks } from "../src/services/scheduler.js";
import { createTestStore, day } from "./helpers.js";

describe("Tag delle persone", () => {
  it("trasforma i tag in entita' text_mention con offset UTF-16 giusti (anche dopo le emoji)", () => {
    const { text, entities } = renderMentions(`🚨 Bagno · ${mention("Anna", 42)} è in ritardo · ${mention("Luca", 7)}`);
    expect(text).toBe("🚨 Bagno · Anna è in ritardo · Luca");
    expect(entities).toEqual([
      { type: "text_mention", offset: text.indexOf("Anna"), length: 4, user: { id: 42, is_bot: false, first_name: "Anna" } },
      { type: "text_mention", offset: text.indexOf("Luca"), length: 4, user: { id: 7, is_bot: false, first_name: "Luca" } },
    ]);
  });

  it("senza id Telegram resta il nome semplice", () => {
    expect(renderMentions(`ciao ${mention("Anna", null)}`)).toEqual({ text: "ciao Anna", entities: [] });
  });

  it("i promemoria taggano chi tocca", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const anna = await store.upsertUser({ telegramId: 22, username: null, displayName: "Anna" });
    const created = new Date("2026-11-01T10:00:00.000Z");
    const { house } = await store.getOrCreateHouse(-1, "Casa", luca.id, created);
    await store.addMember(house.id, anna.id);
    await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", created, null, { mode: "single", userIds: [anna.id] });

    const sent: string[] = [];
    await runDueChecks(store, async (_c, text) => void sent.push(text), new Date("2026-11-08T08:00:00.000Z"), (items) => items[0]);
    const { text, entities } = renderMentions(sent[0]!);
    expect(text).toBe("⏰ Bagno · scade oggi · tocca a Anna");
    expect(entities).toEqual([expect.objectContaining({ offset: text.indexOf("Anna"), length: 4, user: expect.objectContaining({ id: 22 }) })]);
  });

  it("la richiesta di scambio tagga chi deve rispondere", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const anna = await store.upsertUser({ telegramId: 22, username: null, displayName: "Anna" });
    const { house } = await store.getOrCreateHouse(-1, "Casa", luca.id);
    await store.addMember(house.id, anna.id);
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", new Date(), null, { mode: "alternate", userIds: [luca.id, anna.id] });
    const sent: string[] = [];
    const service = new HouseService(store, async (_c, text) => void sent.push(text));
    await service.requestSwap(house, luca, task.id, anna.id);
    const { entities } = renderMentions(sent[0]!);
    expect(entities.map((e) => e.user.id)).toEqual([22]);
  });
});
