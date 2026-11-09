import { describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { createBotApp } from "../src/bot/handlers.js";
import { createTestStore } from "./helpers.js";

/** Bot in chat privata con le chiamate a Telegram intercettate. */
async function setup() {
  const { store } = createTestStore();
  const { bot } = createBotApp({ store, botToken: "1:test", timezone: "Europe/Rome" });
  bot.botInfo = {
    id: 999, is_bot: true, first_name: "ShameBot", username: "vergognati_bot",
    can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
    can_connect_to_business: false, has_main_web_app: false,
  } as typeof bot.botInfo;

  const out: string[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    out.push(String((payload as { text?: string }).text ?? method));
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } } } as never;
  });

  let updateId = 1;
  const dm = (fromId: number, text: string) =>
    bot.handleUpdate({
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: fromId, type: "private", first_name: "Luca" },
        from: { id: fromId, is_bot: false, first_name: "Luca" },
        text,
        entities: text.startsWith("/") ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] : [],
      },
    } as Update);

  return { store, out, dm };
}

const inTenMinutes = () => new Date(Date.now() + 10 * 60_000);

describe("Login web con codice", () => {
  it("ogni richiesta ha un codice di 6 cifre", async () => {
    const { store } = await setup();
    const request = await store.createWebLoginRequest(inTenMinutes());
    expect(request.code).toMatch(/^\d{6}$/);
  });

  it("il codice scritto da solo in privato approva il login", async () => {
    const { store, out, dm } = await setup();
    const request = await store.createWebLoginRequest(inTenMinutes());

    await dm(1, request.code!);

    const approved = await store.getWebLoginRequest(request.token);
    expect(approved?.status).toBe("approved");
    expect(approved?.telegramId).toBe(1);
    expect(out.at(-1)).toContain("Login approvato");
  });

  it("/login con il codice approva, un codice sbagliato no", async () => {
    const { store, out, dm } = await setup();
    const request = await store.createWebLoginRequest(inTenMinutes());
    const wrong = request.code === "000000" ? "111111" : "000000";

    await dm(1, `/login ${wrong}`);
    expect(out.at(-1)).toContain("scaduto o sbagliato");
    expect((await store.getWebLoginRequest(request.token))?.status).toBe("pending");

    await dm(1, `/login ${request.code}`);
    expect((await store.getWebLoginRequest(request.token))?.status).toBe("approved");
  });

  it("un codice scaduto non approva", async () => {
    const { store, out, dm } = await setup();
    const request = await store.createWebLoginRequest(new Date(Date.now() - 1000));

    await dm(1, request.code!);
    expect(out.at(-1)).toContain("scaduto o sbagliato");
  });

  it("/start senza token non approva nulla e spiega il codice", async () => {
    const { store, out, dm } = await setup();
    const request = await store.createWebLoginRequest(inTenMinutes());

    await dm(1, "/start");
    expect((await store.getWebLoginRequest(request.token))?.status).toBe("pending");
    expect(out.at(-1)).toContain("codice di 6 cifre");
  });

  it("il link con il token funziona ancora", async () => {
    const { store, dm } = await setup();
    const request = await store.createWebLoginRequest(inTenMinutes());

    await dm(1, `/start login_${request.token}`);
    expect((await store.getWebLoginRequest(request.token))?.status).toBe("approved");
  });
});
