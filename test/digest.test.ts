import { describe, expect, it } from "vitest";
import { buildDigest, localMidnight, localParts, runDigests } from "../src/services/digest.js";
import { createTestStore, day, hour } from "./helpers.js";

const tz = "Europe/Rome";

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  await store.addMember(house.id, luca.id);
  return { store, house, luca };
}

function collector() {
  const sent: string[] = [];
  return { sent, send: async (_chatId: number, text: string) => void sent.push(text) };
}

describe("Fuso orario", () => {
  it("calcola data locale e mezzanotte anche col cambio d'ora", () => {
    // 6 novembre 2026, 08:30 UTC = 09:30 a Roma (ora solare, UTC+1)
    expect(localParts(new Date("2026-11-06T08:30:00.000Z"), tz)).toEqual({ date: "2026-11-06", minutes: 570 });
    expect(localMidnight(new Date("2026-11-06T08:30:00.000Z"), tz).toISOString()).toBe("2026-11-05T23:00:00.000Z");
    // Ora legale (UTC+2)
    expect(localMidnight(new Date("2026-07-01T10:00:00.000Z"), tz).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    // Giorno del cambio (25 ottobre 2026): mezzanotte era ancora in ora legale
    expect(localMidnight(new Date("2026-10-25T15:00:00.000Z"), tz).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("Testo dei promemoria", () => {
  it("buongiorno: ritardi e scadenze di oggi, con frase personalizzata", async () => {
    const { store, house, luca } = await setup();
    const now = new Date("2026-11-06T08:00:00.000Z"); // 09:00 a Roma
    await store.createTask(house.id, luca.id, "Umido", day, "high", new Date(now.getTime() - day - 5 * hour));
    await store.createTask(house.id, luca.id, "Lavatrice", 9 * hour, "medium", now, null, { mode: "single", userIds: [luca.id] });
    await store.createTask(house.id, luca.id, "Bagno", 7 * day, "medium", now);

    const tasks = await store.listTasks(house.id);
    const message = buildDigest("morning", { intro: "Sveglia!" }, tasks, [], now, tz);
    expect(message.empty).toBe(false);
    expect(message.text).toBe(["Sveglia!", "", "In ritardo", "• Umido · da 5h", "", "Oggi", "• Lavatrice · entro le 18:00 · 👤 Luca"].join("\n"));
  });

  it("serale: fatto oggi e prossime 24 ore; vuoto se non c'e' nulla", async () => {
    const { store, house, luca } = await setup();
    const now = new Date("2026-11-06T20:00:00.000Z"); // 21:00 a Roma
    const task = await store.createTask(house.id, luca.id, "Lavatrice", day, "medium", new Date("2026-11-06T09:00:00.000Z"));
    await store.completeTask(house.id, task.id, luca.id, new Date("2026-11-06T10:00:00.000Z"));

    const tasks = await store.listTasks(house.id);
    const done = await store.listDoneSince(house.id, localMidnight(now, tz));
    const message = buildDigest("evening", { intro: null }, tasks, done, now, tz);
    expect(message.text).toBe(
      ["🌙 Riepilogo della giornata", "", "Fatto oggi", "✅ Lavatrice · Luca", "", "Prossime 24 ore", "• Lavatrice · domani entro le 11:00"].join("\n"),
    );

    expect(buildDigest("morning", { intro: null }, [], [], now, tz)).toMatchObject({ empty: true });
  });
});

describe("runDigests", () => {
  it("invia il buongiorno una sola volta al giorno all'orario impostato", async () => {
    const { store, house, luca } = await setup();
    await store.createTask(house.id, luca.id, "Lavatrice", 9 * hour, "medium", new Date("2026-11-06T07:00:00.000Z"));
    const { sent, send } = collector();

    expect(await runDigests(store, send, new Date("2026-11-06T07:59:00.000Z"), tz)).toBe(0); // 08:59
    expect(await runDigests(store, send, new Date("2026-11-06T08:00:00.000Z"), tz)).toBe(1); // 09:00
    expect(await runDigests(store, send, new Date("2026-11-06T08:01:00.000Z"), tz)).toBe(0);
    expect(sent[0]).toContain("☀️ Buongiorno");
    // Serale spento di default
    expect(await runDigests(store, send, new Date("2026-11-06T20:00:00.000Z"), tz)).toBe(0);
  });

  it("salta i giorni vuoti e quelli in cui l'orario e' passato da oltre un'ora", async () => {
    const { store, house, luca } = await setup();
    const { sent, send } = collector();

    // Nessuna attivita': non parte, ma il giorno e' gestito.
    expect(await runDigests(store, send, new Date("2026-11-06T08:00:00.000Z"), tz)).toBe(0);
    expect((await store.getDigests(house.id)).morning.lastSentDate).toBe("2026-11-06");

    // Con skipIfEmpty disattivato parte anche vuoto.
    await store.updateDigest(house.id, "morning", { skipIfEmpty: false });
    expect(await runDigests(store, send, new Date("2026-11-07T08:00:00.000Z"), tz)).toBe(1);
    expect(sent[0]).toContain("Oggi niente in scadenza");

    // Bot fermo fino alle 11:00 (due ore dopo): il buongiorno di quel giorno viene saltato.
    await store.createTask(house.id, luca.id, "Umido", hour, "high", new Date("2026-11-08T00:00:00.000Z"));
    expect(await runDigests(store, send, new Date("2026-11-08T10:00:00.000Z"), tz)).toBe(0);
    expect(sent.length).toBe(1);
  });

  it("usa orario e attivazione personalizzati", async () => {
    const { store, house } = await setup();
    await store.updateDigest(house.id, "morning", { enabled: false });
    await store.updateDigest(house.id, "evening", { enabled: true, time: "20:30", skipIfEmpty: false, intro: "Buonanotte" });
    const { sent, send } = collector();

    expect(await runDigests(store, send, new Date("2026-11-06T08:00:00.000Z"), tz)).toBe(0);
    expect(await runDigests(store, send, new Date("2026-11-06T19:30:00.000Z"), tz)).toBe(1); // 20:30
    expect(sent[0]?.startsWith("Buonanotte")).toBe(true);
  });
});
