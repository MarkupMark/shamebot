import { describe, expect, it } from "vitest";
import { runDueChecks } from "../src/services/scheduler.js";

/** Scelta deterministica: sempre il primo insulto. */
const first = <T>(items: T[]) => items[0];
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

    // Settimanale creata domenica mattina: scade alla fine della settimana dopo (domenica 8, mezzanotte).
    expect(await runDueChecks(store, send, new Date("2026-11-03T10:00:00.000Z"), first)).toBe(0);

    // Ultimo giorno alle 9 (ora italiana): promemoria.
    expect(await runDueChecks(store, send, new Date("2026-11-08T08:00:00.000Z"), first)).toBe(1);
    expect(sent[0]?.chatId).toBe(-555);
    expect(sent[0]?.text).toBe("⏰ Pulire il bagno · scade oggi");

    expect(await runDueChecks(store, send, new Date("2026-11-08T08:05:00.000Z"), first)).toBe(0);
    // Mezzanotte e' passata ma di notte non si scrive nel gruppo.
    expect(await runDueChecks(store, send, new Date("2026-11-09T02:00:00.000Z"), first)).toBe(0);

    expect(await runDueChecks(store, send, new Date("2026-11-09T08:30:00.000Z"), first)).toBe(1);
    expect(sent[1]?.text).toBe("😬 Pulire il bagno · scaduta · ultima: Luca\nragazzi, Pulire il bagno è IMPORTANTE. Vergognati 🔔");

    expect(await runDueChecks(store, send, new Date("2026-11-10T08:30:00.000Z"), first)).toBe(1);
    expect(sent[2]?.text).toBe("🚨 Pulire il bagno · ritardo 1g 9h · ultima: Luca\nragazzi, Pulire il bagno è IMPORTANTE. Vergognati 🔔");
    expect(sent.length).toBe(3);
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

  it("sceglie tra gli insulti scritti dagli altri coinquilini, mai da chi li riceve", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
    const created = new Date("2026-11-01T10:00:00.000Z");
    const { house } = await store.getOrCreateHouse(-555, "Casa", luca.id, created);
    await store.createTask(house.id, luca.id, "Umido", day, "low", created, null, { mode: "single", userIds: [luca.id] });
    await store.setMyInsults(house.id, luca.id, "low", ["Insulto scritto da Luca"]);
    await store.setMyInsults(house.id, anna.id, "low", ["{nome}, {attivita}! Puzza tutto."]);

    // Tocca a Luca: il pool contiene solo l'insulto di Anna.
    expect(await store.insultPool(house.id, "low", luca.id)).toEqual(["{nome}, {attivita}! Puzza tutto."]);
    // Se tocca a chiunque valgono tutti.
    expect((await store.insultPool(house.id, "low", null)).length).toBe(2);

    const sent: string[] = [];
    expect(await runDueChecks(store, async (_c, text) => void sent.push(text), new Date("2026-11-02T11:00:00.000Z"), first)).toBe(1);
    expect(sent[0]).toBe("😬 Umido · scaduta · doveva farla Luca\nLuca, Umido! Puzza tutto.");
  });

  it("senza insulti degli altri usa i predefiniti", async () => {
    const { store } = createTestStore();
    const luca = await store.upsertUser({ telegramId: 1, username: null, displayName: "Luca" });
    const created = new Date("2026-11-01T10:00:00.000Z");
    const { house } = await store.getOrCreateHouse(-555, "Casa", luca.id, created);
    await store.createTask(house.id, luca.id, "Umido", day, "medium", created, null, { mode: "single", userIds: [luca.id] });
    await store.setMyInsults(house.id, luca.id, "medium", ["Solo miei, non valgono contro di me"]);

    const sent: string[] = [];
    await runDueChecks(store, async (_c, text) => void sent.push(text), new Date("2026-11-02T11:00:00.000Z"), first);
    expect(sent[0]).toBe("😬 Umido · scaduta · doveva farla Luca\nLuca, Umido è scaduta. La casa ti guarda 👀");
  });
});

describe("fillInsult", () => {
  it("sostituisce i segnaposto e toglie lo spazio prima della punteggiatura", async () => {
    const { fillInsult } = await import("../src/services/insults.js");
    expect(fillInsult("Ehi {nome} , hai lasciato {attivita} !", { name: "Umido", assigneeName: "Luca" })).toBe("Ehi Luca, hai lasciato Umido!");
    expect(fillInsult("{nome} che schifo", { name: "Umido", assigneeName: null })).toBe("ragazzi che schifo");
  });
});
