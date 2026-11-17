import { describe, expect, it } from "vitest";
import { plainText } from "../src/utils/mention.js";
import { HouseService, SwapError } from "../src/services/houses.js";
import { createTestStore, day } from "./helpers.js";

async function setup() {
  const { store } = createTestStore();
  const luca = await store.upsertUser({ telegramId: 1, username: "luca", displayName: "Luca" });
  const anna = await store.upsertUser({ telegramId: 2, username: null, displayName: "Anna" });
  const marco = await store.upsertUser({ telegramId: 3, username: null, displayName: "Marco" });
  const { house } = await store.getOrCreateHouse(-100, "Casa", luca.id);
  for (const user of [luca, anna, marco]) await store.addMember(house.id, user.id);
  const sent: Array<{ text: string; buttons?: unknown }> = [];
  const edits: string[] = [];
  const service = new HouseService(
    store,
    async (_chatId, text, buttons) => {
      sent.push({ text: plainText(text), buttons });
      return { message_id: 7 };
    },
    async (_chatId, _messageId, text) => void edits.push(plainText(text)),
  );
  return { store, house, luca, anna, marco, service, sent, edits };
}

describe("Passa a...", () => {
  it("chiede nel gruppo; se l'altro accetta tocca a lui solo fino al Fatto", async () => {
    const { store, house, luca, anna, service, sent, edits } = await setup();
    const task = await store.createTask(house.id, luca.id, "Umido", 7 * day, "low", new Date(), null, { mode: "single", userIds: [luca.id] });

    const request = await service.requestHandoff(house, luca, task.id, anna.id);
    expect(request.kind).toBe("handoff");
    expect(sent[0]?.text).toBe('🤝 Luca chiede ad Anna di fare "Umido" al posto suo, solo per questa volta');
    expect(sent[0]?.buttons).toEqual([[
      { text: "✅ Accetto", data: `swap:${request.id}:yes` },
      { text: "❌ Rifiuto", data: `swap:${request.id}:no` },
    ]]);
    // Finche' Anna non accetta resta di Luca.
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Luca");

    await expect(service.answerSwap(house, luca, request.id, true)).rejects.toBeInstanceOf(SwapError);
    const updated = await service.answerSwap(house, anna, request.id, true);
    expect(updated?.assigneeName).toBe("Anna");
    expect(updated?.assignUserIds).toEqual([luca.id]); // l'assegnazione non cambia
    expect(edits[0]).toBe('🤝 "Umido": questa volta la fa Anna al posto di Luca');
    expect((await store.listLog(house.id))[0]?.detail).toBe("passata: Luca → Anna (solo questa volta)");

    // Dopo il Fatto torna a Luca.
    expect((await store.completeTask(house.id, task.id, anna.id, new Date()))?.assigneeName).toBe("Luca");
  });

  it("a turno: dopo il Fatto il turno avanza come se l'avesse fatta chi l'ha passata", async () => {
    const { store, house, luca, anna, marco, service } = await setup();
    const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", new Date(), null, {
      mode: "alternate",
      userIds: [luca.id, anna.id],
    });
    const request = await service.requestHandoff(house, luca, task.id, marco.id);
    expect((await service.answerSwap(house, marco, request.id, true))?.assigneeName).toBe("Marco");
    expect((await store.completeTask(house.id, task.id, marco.id, new Date()))?.assigneeName).toBe("Anna");
  });

  it("se rifiuta non cambia nulla; chi l'ha chiesta puo' annullare", async () => {
    const { store, house, luca, anna, service, edits } = await setup();
    const task = await store.createTask(house.id, luca.id, "Umido", day, "low", new Date(), null, { mode: "single", userIds: [luca.id] });
    const request = await service.requestHandoff(house, luca, task.id, anna.id);
    expect(await service.answerSwap(house, anna, request.id, false)).toBeNull();
    expect(edits[0]).toBe('🤝 Luca, Anna non accetta di fare "Umido" al posto tuo');
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Luca");

    const again = await service.requestHandoff(house, luca, task.id, anna.id);
    await service.cancelSwap(house, luca, again.id);
    expect(edits[1]).toBe("🤝 Luca: richiesta annullata");
    expect(await store.listPendingSwaps(house.id)).toEqual([]);
  });

  it("rifiuta richieste non valide", async () => {
    const { store, house, luca, anna, marco, service } = await setup();
    const anyone = await store.createTask(house.id, luca.id, "Spesa", day, "low");
    await expect(service.requestHandoff(house, luca, anyone.id, anna.id)).rejects.toThrow("che toccano a te");
    const task = await store.createTask(house.id, luca.id, "Umido", day, "low", new Date(), null, { mode: "single", userIds: [luca.id] });
    await expect(service.requestHandoff(house, anna, task.id, marco.id)).rejects.toThrow("che toccano a te");
    await expect(service.requestHandoff(house, luca, task.id, luca.id)).rejects.toBeInstanceOf(SwapError);
    const stranger = await store.upsertUser({ telegramId: 9, username: null, displayName: "Ospite" });
    await expect(service.requestHandoff(house, luca, task.id, stranger.id)).rejects.toThrow("altro coinquilino");

    const absence = await service.requestAbsence(house, marco);
    await service.approveAbsence(house, anna, absence.id);
    await expect(service.requestHandoff(house, luca, task.id, marco.id)).rejects.toThrow("fuori casa");

    await service.requestHandoff(house, luca, task.id, anna.id);
    await expect(service.requestHandoff(house, luca, task.id, anna.id)).rejects.toThrow("gia' una richiesta");
  });

  it("si annulla se nel frattempo l'attivita' non tocca piu' a chi l'ha passata", async () => {
    const { store, house, luca, anna, marco, service } = await setup();
    const task = await store.createTask(house.id, luca.id, "Umido", day, "low", new Date(), null, { mode: "single", userIds: [luca.id] });
    const request = await service.requestHandoff(house, luca, task.id, anna.id);
    await store.updateTask(house.id, task.id, luca.id, { assignment: { mode: "single", userIds: [marco.id] } });
    await expect(service.answerSwap(house, anna, request.id, true)).rejects.toThrow("Non tocca piu' a Luca");
    expect(await store.listPendingSwaps(house.id)).toEqual([]);
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Marco");
  });

  it("se si cambia l'assegnazione il passaggio decade", async () => {
    const { store, house, luca, anna, marco, service } = await setup();
    const task = await store.createTask(house.id, luca.id, "Umido", day, "low", new Date(), null, { mode: "single", userIds: [luca.id] });
    const request = await service.requestHandoff(house, luca, task.id, anna.id);
    await service.answerSwap(house, anna, request.id, true);
    // Modifica solo del nome: resta ad Anna.
    await store.updateTask(house.id, task.id, luca.id, { name: "Umido!", assignment: { mode: "single", userIds: [luca.id] } });
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Anna");
    await store.updateTask(house.id, task.id, luca.id, { assignment: { mode: "single", userIds: [marco.id] } });
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Marco");
  });
});
