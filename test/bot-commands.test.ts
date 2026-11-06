import { describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { createBotApp } from "../src/bot/handlers.js";
import { createTestStore } from "./helpers.js";

/** Bot con le chiamate a Telegram intercettate: registra cosa invierebbe nel gruppo. */
async function setup() {
  const { store } = createTestStore();
  const { bot } = createBotApp({ store, botToken: "1:test", timezone: "Europe/Rome" });
  bot.botInfo = {
    id: 999, is_bot: true, first_name: "ShameBot", username: "vergognati_bot",
    can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
    can_connect_to_business: false, has_main_web_app: false,
  } as typeof bot.botInfo;

  const out: Array<{ method: string; text?: string; markup?: unknown }> = [];
  let nextMessageId = 100;
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as { text?: string; reply_markup?: unknown };
    out.push({ method, text: p.text, markup: p.reply_markup });
    return { ok: true, result: { message_id: nextMessageId++, date: 0, chat: { id: -100, type: "group" } } } as never;
  });

  let updateId = 1;
  const say = (fromId: number, name: string, text: string) =>
    bot.handleUpdate({
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: -100, type: "group", title: "Casa" },
        from: { id: fromId, is_bot: false, first_name: name },
        text,
        entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
      },
    } as Update);

  const press = (fromId: number, name: string, data: string) =>
    bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: String(updateId),
        from: { id: fromId, is_bot: false, first_name: name },
        chat_instance: "x",
        data,
        message: { message_id: 100, date: 0, chat: { id: -100, type: "group", title: "Casa" }, text: "" },
      },
    } as Update);

  return { store, out, say, press };
}

describe("Comandi /fuori e /rientro", () => {
  it("/fuori chiede conferma, un altro conferma col pulsante, /rientro nome chiude", async () => {
    const { store, out, say, press } = await setup();
    await say(1, "Luca", "/start");
    await say(2, "Anna", "/membri");
    out.length = 0;

    await say(1, "Luca", "/fuori");
    const request = out.find((call) => call.method === "sendMessage");
    expect(request?.text).toContain("🧳 Luca è fuori casa");
    const button = JSON.stringify(request?.markup);
    const data = /away:\d+/.exec(button)?.[0] as string;
    expect(data).toBeTruthy();

    // Di nuovo /fuori: nessuna nuova richiesta.
    out.length = 0;
    await say(1, "Luca", "/fuori");
    expect(out.find((call) => call.method === "sendMessage")?.text).toContain("Hai già chiesto");

    // Luca non puo' confermarsi da solo; Anna si'.
    await press(1, "Luca", data);
    expect((await store.listOpenAbsences(1))[0]?.status).toBe("pending");
    out.length = 0;
    await press(2, "Anna", data);
    expect((await store.listOpenAbsences(1))[0]?.status).toBe("active");
    expect(out.find((call) => call.method === "editMessageText")?.text).toContain("ok di Anna");

    out.length = 0;
    await say(2, "Anna", "/rientro luca");
    expect(out.find((call) => call.method === "sendMessage")?.text).toBe("🏠 Luca è rientrato (segnato da Anna)");
    expect(await store.listOpenAbsences(1)).toEqual([]);

    out.length = 0;
    await say(1, "Luca", "/rientro");
    expect(out.find((call) => call.method === "sendMessage")?.text).toBe("Nessuno è fuori casa.");
  });
});
