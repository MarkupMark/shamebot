import { describe, expect, it } from "vitest";
import { getDueAt } from "../src/services/policy.js";
import { runDueChecks } from "../src/services/scheduler.js";
import { AbsenceError, HouseService } from "../src/services/houses.js";
import { createTestStore, day, hour } from "./helpers.js";

const tz = "Europe/Rome";
const first = <T>(items: T[]) => items[0];

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  await store.addMember(house.id, luca.id);
  await store.addMember(house.id, anna.id);
  const sent: Array<{ text: string; buttons?: unknown }> = [];
  const edits: string[] = [];
  const service = new HouseService(
    store,
    async (_chatId, text, buttons) => {
      sent.push({ text, buttons });
      return { message_id: 42 };
    },
    async (_chatId, _messageId, text) => void edits.push(text),
  );
  return { store, house, luca, anna, service, sent, edits };
}

describe("Fuori casa", () => {
  it("serve l'ok di un altro coinquilino, con il pulsante Confermo nel gruppo", async () => {
    const { store, house, luca, anna, service, sent, edits } = await setup();
    const absence = await service.requestAbsence(house, luca);
    expect(absence.status).toBe("pending");
    expect(sent[0]?.text).toContain("🧳 Luca è fuori casa");
    expect(sent[0]?.buttons).toEqual([[{ text: "✅ Confermo", data: `away:${absence.id}` }]]);
    // Una seconda richiesta non ne crea un'altra.
    expect((await service.requestAbsence(house, luca)).id).toBe(absence.id);
    expect(sent.length).toBe(1);

    await expect(service.approveAbsence(house, luca, absence.id)).rejects.toBeInstanceOf(AbsenceError);
    const approved = await service.approveAbsence(house, anna, absence.id);
    expect(approved).toMatchObject({ status: "active", approvedByName: "Anna" });
    expect(edits[0]).toBe("🧳 Luca è fuori casa · ok di Anna\nLe sue attività sono in pausa fino al rientro.");
    expect([...(await store.awayUserIds(house.id))]).toEqual([luca.id]);
  });

  it("solo chi l'ha chiesta puo' annullare una richiesta non confermata", async () => {
    const { store, house, luca, anna, service } = await setup();
    const absence = await service.requestAbsence(house, luca);
    await expect(service.cancelAbsence(house, anna, absence.id)).rejects.toBeInstanceOf(AbsenceError);
    await service.cancelAbsence(house, luca, absence.id);
    expect(await store.listOpenAbsences(house.id)).toEqual([]);
  });

  it("mentre e' fuori non riceve avvisi ne' insulti; le attivita' di altri continuano", async () => {
    const { store, house, luca, anna } = await setup();
    const start = new Date("2026-11-01T10:00:00.000Z");
    await store.createTask(house.id, luca.id, "Bagno", day, "high", start, null, { mode: "single", userIds: [luca.id] });
    await store.createTask(house.id, luca.id, "Umido", day, "high", start, null, { mode: "single", userIds: [anna.id] });
    const { absence } = await store.requestAbsence(house.id, luca.id, start);
    await store.approveAbsence(house.id, absence.id, anna.id, start);

    const sent: string[] = [];
    await runDueChecks(store, async (_c, text) => void sent.push(text), new Date("2026-11-03T10:00:00.000Z"), first);
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("Umido");
  });

  it("al rientro: scadute durante l'assenza -> oggi; le altre slittano dei giorni di assenza", async () => {
    const { store, house, luca, anna } = await setup();
    const created = new Date("2026-11-01T09:00:00.000Z");
    const late = await store.createTask(house.id, luca.id, "Gia' in ritardo", day, "low", new Date("2026-10-30T09:00:00.000Z"), null, { mode: "single", userIds: [luca.id] });
    const during = await store.createTask(house.id, luca.id, "Bagno", 2 * day, "high", created, null, { mode: "single", userIds: [luca.id] });
    const after = await store.createTask(house.id, luca.id, "Vetri", 10 * day, "low", created, null, { mode: "single", userIds: [luca.id] });
    const others = await store.createTask(house.id, luca.id, "Umido", 2 * day, "high", created, null, { mode: "single", userIds: [anna.id] });

    const leave = new Date("2026-11-02T09:00:00.000Z");
    const back = new Date("2026-11-06T15:00:00.000Z"); // 16:00 a Roma, 4 giorni e 6 ore dopo
    const { absence } = await store.requestAbsence(house.id, luca.id, leave);
    await store.approveAbsence(house.id, absence.id, anna.id, leave);
    const result = await store.endAbsence(house.id, absence.id, luca.id, back, tz);

    expect(result?.absence.status).toBe("ended");
    expect(result?.moved.map((m) => [m.task.name, m.overdue])).toEqual([
      ["Bagno", true],
      ["Vetri", false],
    ]);
    // Bagno (scaduta il 3 novembre) va fatta entro la fine del 6 novembre (mezzanotte di Roma).
    expect(getDueAt((await store.getTask(house.id, during.id))!).toISOString()).toBe("2026-11-06T23:00:00.000Z");
    // Vetri (scadenza 11 novembre 09:00) slitta di 4g 6h.
    expect(getDueAt((await store.getTask(house.id, after.id))!).toISOString()).toBe("2026-11-15T15:00:00.000Z");
    // Le altre non cambiano.
    expect(getDueAt((await store.getTask(house.id, late.id))!).toISOString()).toBe("2026-10-31T09:00:00.000Z");
    expect(getDueAt((await store.getTask(house.id, others.id))!).toISOString()).toBe("2026-11-03T09:00:00.000Z");
    expect(await store.awayUserIds(house.id)).toEqual(new Set());
  });

  it("il rientro lo puo' segnare anche un altro coinquilino e lo scrive nel gruppo", async () => {
    const { store, house, luca, anna, service, sent } = await setup();
    await store.createTask(house.id, luca.id, "Vetri", 10 * day, "low", new Date(Date.now() - hour), null, { mode: "single", userIds: [luca.id] });
    const absence = await service.requestAbsence(house, luca);
    await service.approveAbsence(house, anna, absence.id);
    const { moved } = await service.endAbsence(house, anna, absence.id, tz);
    expect(moved.length).toBe(1);
    expect(sent[sent.length - 1]?.text.split("\n")[0]).toBe("🏠 Luca è rientrato (segnato da Anna)");
    await expect(service.endAbsence(house, anna, absence.id, tz)).rejects.toBeInstanceOf(AbsenceError);
  });
});
