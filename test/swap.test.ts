import { describe, expect, it } from "vitest";
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
      sent.push({ text, buttons });
      return { message_id: 7 };
    },
    async (_chatId, _messageId, text) => void edits.push(text),
  );
  const task = await store.createTask(house.id, luca.id, "Bagno", 7 * day, "high", new Date(), null, {
    mode: "alternate",
    userIds: [luca.id, anna.id],
  });
  return { store, house, luca, anna, marco, service, sent, edits, task };
}

describe("Scambio di turno", () => {
  it("chiede nel gruppo con Accetto / Rifiuto; se l'altro accetta il turno passa a lui", async () => {
    const { store, house, luca, anna, service, sent, edits, task } = await setup();
    expect(task.assigneeName).toBe("Luca");

    const swap = await service.requestSwap(house, luca, task.id, anna.id);
    expect(sent[0]?.text).toBe('🔄 Luca chiede ad Anna di scambiarsi il turno di "Bagno"\nSe accetta, questo turno tocca ad Anna.');
    expect(sent[0]?.buttons).toEqual([[
      { text: "✅ Accetto", data: `swap:${swap.id}:yes` },
      { text: "❌ Rifiuto", data: `swap:${swap.id}:no` },
    ]]);
    expect((await store.listPendingSwaps(house.id)).map((w) => w.targetName)).toEqual(["Anna"]);

    // Solo Anna puo' rispondere.
    await expect(service.answerSwap(house, luca, swap.id, true)).rejects.toBeInstanceOf(SwapError);
    const updated = await service.answerSwap(house, anna, swap.id, true);
    expect(updated?.assigneeName).toBe("Anna");
    expect(updated?.assignUserIds).toEqual([anna.id, luca.id]);
    expect(edits[0]).toBe('🔄 Turno scambiato · ok di Anna\n"Bagno": ora tocca ad Anna');
    expect(await store.listPendingSwaps(house.id)).toEqual([]);
    expect((await store.listLog(house.id))[0]?.detail).toBe("turno scambiato: Luca ↔ Anna");

    // Dopo il "Fatto" di Anna si torna a Luca.
    expect((await store.completeTask(house.id, task.id, anna.id, new Date()))?.assigneeName).toBe("Luca");
  });

  it("se rifiuta non cambia nulla; chi l'ha chiesta puo' annullare", async () => {
    const { store, house, luca, anna, service, edits, task } = await setup();
    const swap = await service.requestSwap(house, luca, task.id, anna.id);
    expect(await service.answerSwap(house, anna, swap.id, false)).toBeNull();
    expect(edits[0]).toBe('🔄 Anna non accetta lo scambio di turno di "Bagno"');
    expect((await store.getTask(house.id, task.id))?.assigneeName).toBe("Luca");
    await expect(service.answerSwap(house, anna, swap.id, true)).rejects.toBeInstanceOf(SwapError);

    const again = await service.requestSwap(house, luca, task.id, anna.id);
    await expect(service.cancelSwap(house, anna, again.id)).rejects.toBeInstanceOf(SwapError);
    await service.cancelSwap(house, luca, again.id);
    expect(await store.listPendingSwaps(house.id)).toEqual([]);
  });

  it("rifiuta richieste non valide e annulla lo scambio se la rotazione e' cambiata", async () => {
    const { store, house, luca, anna, marco, service, task } = await setup();
    await expect(service.requestSwap(house, marco, task.id, luca.id)).rejects.toThrow("Non sei nella rotazione");
    await expect(service.requestSwap(house, luca, task.id, marco.id)).rejects.toBeInstanceOf(SwapError);
    await expect(service.requestSwap(house, luca, task.id, luca.id)).rejects.toBeInstanceOf(SwapError);
    const single = await store.createTask(house.id, luca.id, "Umido", day, "low");
    await expect(service.requestSwap(house, luca, single.id, anna.id)).rejects.toThrow("solo nelle attivita' a turno");

    const swap = await service.requestSwap(house, luca, task.id, anna.id);
    await expect(service.requestSwap(house, anna, task.id, luca.id)).rejects.toThrow("gia' una richiesta");
    await store.updateTask(house.id, task.id, luca.id, { assignment: { mode: "alternate", userIds: [luca.id, marco.id] } });
    await expect(service.answerSwap(house, anna, swap.id, true)).rejects.toThrow("rotazione e' cambiata");
    expect(await store.listPendingSwaps(house.id)).toEqual([]);
  });

  it("con tre persone si invertono solo i due coinvolti, senza perdere il turno", async () => {
    const { store, house, luca, anna, marco, service } = await setup();
    const task = await store.createTask(house.id, luca.id, "Cucina", day, "medium", new Date(), null, {
      mode: "alternate",
      userIds: [luca.id, anna.id, marco.id],
    });
    await store.completeTask(house.id, task.id, luca.id, new Date()); // ora tocca ad Anna
    const swap = await service.requestSwap(house, anna, task.id, marco.id);
    const updated = await service.answerSwap(house, marco, swap.id, true);
    expect(updated?.assignUserIds).toEqual([luca.id, marco.id, anna.id]);
    expect(updated?.assigneeName).toBe("Marco");
  });
});
