import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { AppUser, House, LogEntry, WebLoginRequest } from "../types/domain.js";
import type { HouseStore } from "../services/store.js";
import { AbsenceError, HouseService, SwapError, TooEarlyError, type EditInChat } from "../services/houses.js";
import { compactTaskCount, formatTaskList, safeSend, type SendToChat } from "../services/notify.js";
import { formatFrequencyShort, parseDurationInput } from "../utils/duration.js";
import { severityFromItalian, severityToItalian } from "../utils/labels.js";
import { parseTaskNumber, sortTasksByDueDate } from "../utils/tasks.js";

export type BotAppDependencies = {
  store: HouseStore;
  botToken: string;
  siteUrl?: string;
  timezone: string;
  /** false = nessun messaggio parte verso Telegram (bot in pausa). Default true. */
  sendMessages?: boolean;
};

export type BotApp = {
  bot: Bot;
  service: HouseService;
  send: SendToChat;
};

/** Menu comandi mostrato da Telegram digitando "/" nel gruppo della casa. */
export const groupCommands = [
  { command: "attivita", description: "Elenco e scadenze" },
  { command: "fatto", description: "Segna come fatta" },
  { command: "nuova", description: "Nuova: nome | frequenza | gravità" },
  { command: "modifica", description: "Modifica: n | nome | frequenza | gravità" },
  { command: "elimina", description: "Elimina: n" },
  { command: "log", description: "Ultimi eventi" },
  { command: "fuori", description: "Sono fuori casa (serve un ok)" },
  { command: "rientro", description: "Rientro: /rientro [nome]" },
  { command: "notifiche", description: "Avvisi on/off" },
  { command: "membri", description: "Coinquilini" },
  { command: "casa", description: "Info casa" },
  { command: "app", description: "Apri il portale" },
  { command: "help", description: "Comandi" },
  { command: "start", description: "Attiva la casa" },
] as const;

/** Menu comandi nella chat privata con il bot. */
export const privateCommands = [
  { command: "app", description: "Apri il portale" },
  { command: "login", description: "Conferma il login dal sito" },
  { command: "help", description: "Comandi" },
  { command: "start", description: "Come iniziare" },
] as const;

const loginCodePattern = /^\d{6}$/;

const helpText = [
  "/attivita · elenco",
  "/fatto [n] · segna fatta",
  "/nuova nome | frequenza | gravità",
  "/modifica n | nome | frequenza | gravità",
  "/elimina n",
  "/log · /membri · /casa · /app",
  "/fuori · sono fuori casa (un altro conferma)",
  "/rientro [nome] · rientro a casa",
  "/notifiche on|off",
  "",
  "Frequenza: 3 giorni · 1 settimana · 2 volte a settimana · ogni mese",
  "Gravità: poco importante · medio · importante",
  "«-» lascia invariato · «| silenzioso» non avvisa il gruppo",
].join("\n");

export async function registerBotCommands(bot: Bot, { siteUrl }: { siteUrl?: string } = {}): Promise<void> {
  await bot.api.setMyCommands(groupCommands);
  await bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
  await bot.api.setMyCommands(privateCommands, { scope: { type: "all_private_chats" } });
  if (siteUrl) {
    await bot.api.setChatMenuButton({
      menu_button: { type: "web_app", text: "Casa", web_app: { url: siteUrl } },
    });
  }
}

/** Pulsanti rapidi che suggeriscono i comandi principali. */
function quickActions(): InlineKeyboard {
  return new InlineKeyboard().text("📋 Attività", "cmd:tasks").text("✅ Fatto", "cmd:done").text("🧾 Log", "cmd:log");
}

export function createBotApp({ store, botToken, siteUrl, timezone, sendMessages = true }: BotAppDependencies): BotApp {
  const bot = new Bot(botToken);
  const send: SendToChat = sendMessages
    ? (chatId, text, buttons) =>
        bot.api.sendMessage(chatId, text, buttons ? { reply_markup: InlineKeyboard.from(buttons.map((row) => row.map((b) => InlineKeyboard.text(b.text, b.data)))) } : undefined)
    : async () => undefined;
  const edit: EditInChat = sendMessages ? (chatId, messageId, text) => bot.api.editMessageText(chatId, messageId, text) : async () => undefined;
  const service = new HouseService(store, send, edit);

  type Resolved = { house: House; user: AppUser };

  async function identify(ctx: Context): Promise<AppUser | null> {
    const from = ctx.from;
    if (!from) {
      return null;
    }

    return await store.upsertUser({
      telegramId: from.id,
      username: from.username?.toLowerCase() ?? null,
      displayName: buildDisplayName(from.first_name, from.last_name),
    });
  }

  /** Risolve casa e utente per un comando dato nel gruppo; registra l'utente come membro. */
  async function resolveHouse(ctx: Context): Promise<Resolved | null> {
    if (!ctx.chat || ctx.chat.type === "private") {
      await ctx.reply("Usa questo comando nel gruppo della casa.");
      return null;
    }

    const user = await identify(ctx);
    if (!user) {
      return null;
    }

    const house = await store.getHouseByChatId(ctx.chat.id);
    if (!house) {
      await ctx.reply("Casa non attiva. Scrivi /start.");
      return null;
    }

    await store.addMember(house.id, user.id);
    return { house, user };
  }

  async function sortedTasks(houseId: number) {
    return sortTasksByDueDate(await store.listTasks(houseId));
  }

  async function showTasks(ctx: Context, { house }: Resolved): Promise<void> {
    const tasks = await sortedTasks(house.id);
    if (tasks.length === 0) {
      await ctx.reply("Nessuna attività. /nuova nome | frequenza | gravità");
      return;
    }

    const now = new Date();
    const hidden = tasks.length - compactTaskCount;
    const away = await store.awayUserIds(house.id);
    await ctx.reply(formatTaskList(tasks, now, compactTaskCount, away, timezone), {
      ...(hidden > 0 ? { reply_markup: new InlineKeyboard().text(`Mostra altre ${hidden}`, "tasks:all") } : {}),
    });
  }

  async function showDonePicker(ctx: Context, { house }: Resolved): Promise<void> {
    const tasks = await sortedTasks(house.id);
    if (tasks.length === 0) {
      await ctx.reply("Nessuna attività. /nuova nome | frequenza | gravità");
      return;
    }

    const keyboard = new InlineKeyboard();
    tasks.forEach((task, index) => keyboard.text(`${index + 1}. ${task.name}`, `done:${task.id}`).row());
    await ctx.reply("Fatto cosa?", { reply_markup: keyboard });
  }

  async function showLog(ctx: Context, { house }: Resolved, limit: number): Promise<void> {
    const entries = await store.listLog(house.id, Math.min(limit, 30));
    if (entries.length === 0) {
      await ctx.reply("Registro vuoto.");
      return;
    }

    await ctx.reply(entries.map((entry) => formatLogEntry(entry, timezone)).join("\n"));
  }

  // ---- Avvio e aiuto ----

  bot.command("start", async (ctx) => {
    const user = await identify(ctx);
    if (!user || !ctx.chat) {
      return;
    }

    if (ctx.chat.type === "private") {
      await handlePrivateStart(ctx, user);
      return;
    }

    const title = "title" in ctx.chat && ctx.chat.title ? ctx.chat.title : "Casa";
    const { house, created, adoptedTasks } = await store.getOrCreateHouse(ctx.chat.id, title, user.id);
    await store.addMember(house.id, user.id);

    const lines = [created ? `🏠 ${house.name} · attiva` : `🏠 ${house.name} · già attiva`];
    if (adoptedTasks > 0) {
      lines.push(`${adoptedTasks} attività importate, ripartono da ora`);
    }
    lines.push("", helpText);
    await ctx.reply(lines.join("\n"), { reply_markup: quickActions() });
  });

  async function handlePrivateStart(ctx: Context, user: AppUser): Promise<void> {
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (payload.startsWith("login_")) {
      const request = await store.approveWebLoginRequest(payload.replace("login_", ""), identityOf(user), new Date());
      await replyLoginResult(ctx, request);
      return;
    }
    if (loginCodePattern.test(payload)) {
      await approveLoginCode(ctx, user, payload);
      return;
    }

    await ctx.reply(
      [
        "1. Aggiungimi al gruppo della casa",
        "2. Scrivi /start nel gruppo",
        "3. Gestisci le attività da lì o dal portale",
        "",
        "🔑 Login dal sito: scrivimi qui il codice di 6 cifre che vedi",
      ].join("\n"),
      { reply_markup: buildMiniAppKeyboard(siteUrl) },
    );
  }

  function identityOf(user: AppUser) {
    return { telegramId: user.telegramId, username: user.username, displayName: user.displayName };
  }

  async function replyLoginResult(ctx: Context, request: WebLoginRequest | null): Promise<void> {
    if (!request || request.status === "expired") {
      await ctx.reply("⌛ Codice scaduto o sbagliato. Riprova dal portale.");
    } else if (request.status === "claimed") {
      await ctx.reply("⚠️ Login già usato. Riprova dal portale.");
    } else {
      await ctx.reply("✓ Login approvato. Torna al browser.");
    }
  }

  async function approveLoginCode(ctx: Context, user: AppUser, code: string): Promise<void> {
    const request = await store.approveWebLoginRequestByCode(code, identityOf(user), new Date());
    await replyLoginResult(ctx, request);
  }

  // Login dal portale: "/login 123456" oppure il codice da solo, solo in chat privata.
  bot.command("login", async (ctx) => {
    const user = await identify(ctx);
    if (!user || ctx.chat?.type !== "private") {
      return;
    }
    const code = ctx.match.trim();
    if (!loginCodePattern.test(code)) {
      await ctx.reply("🔑 Scrivi il codice di 6 cifre che vedi sul sito, es. /login 123456");
      return;
    }
    await approveLoginCode(ctx, user, code);
  });

  bot.chatType("private").hears(/^\s*(\d{6})\s*$/, async (ctx) => {
    const user = await identify(ctx);
    if (user) {
      await approveLoginCode(ctx, user, ctx.match[1]!);
    }
  });

  bot.command("help", async (ctx) => {
    const inGroup = ctx.chat && ctx.chat.type !== "private";
    await ctx.reply(helpText, inGroup ? { reply_markup: quickActions() } : undefined);
  });

  bot.command("app", async (ctx) => {
    if (!siteUrl) {
      await ctx.reply("Portale non configurato.");
      return;
    }

    if (ctx.chat?.type === "private") {
      await ctx.reply("Portale:", { reply_markup: buildMiniAppKeyboard(siteUrl) });
      return;
    }

    await ctx.reply(siteUrl);
  });

  // ---- Lettura ----

  // "attivit" intercetta anche "/attività": Telegram non considera la "à" parte del comando.
  bot.command(["attivita", "attivit", "stats", "lista"], async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (resolved) {
      await showTasks(ctx, resolved);
    }
  });

  bot.command("log", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (resolved) {
      await showLog(ctx, resolved, parseTaskNumber(ctx.match) ?? 10);
    }
  });

  bot.command("membri", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const members = await store.listMembers(resolved.house.id);
    await ctx.reply(members.map((member) => member.displayName).join(", "));
  });

  bot.command("casa", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const [members, tasks] = await Promise.all([store.listMembers(resolved.house.id), store.listTasks(resolved.house.id)]);
    await ctx.reply(
      `🏠 ${resolved.house.name} · ${members.length} persone · ${tasks.length} attività · avvisi ${resolved.house.notifyChanges ? "on" : "off"}`,
    );
  });

  // ---- Azioni ----

  bot.command("fatto", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const argument = ctx.match.trim();
    if (!argument) {
      await showDonePicker(ctx, resolved);
      return;
    }

    const number = parseTaskNumber(argument);
    const task = number ? (await sortedTasks(resolved.house.id))[number - 1] : undefined;
    if (!task) {
      await ctx.reply("Numero non valido. /attivita");
      return;
    }

    try {
      await service.completeTask(resolved.house, resolved.user, task.id, true);
    } catch (error) {
      if (!(error instanceof TooEarlyError)) throw error;
      await ctx.reply(error.message);
    }
  });

  bot.callbackQuery(/^done:(\d+)$/, async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      await ctx.answerCallbackQuery();
      return;
    }

    let task;
    try {
      task = await service.completeTask(resolved.house, resolved.user, Number(ctx.match[1]), true);
    } catch (error) {
      if (!(error instanceof TooEarlyError)) throw error;
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: task ? "✓" : "Attività non trovata" });
    if (task) {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    }
  });

  /** "Mostra altre" / "Mostra meno": riscrive lo stesso messaggio con l'elenco completo o compatto. */
  bot.callbackQuery(/^tasks:(all|short)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const tasks = await sortedTasks(resolved.house.id);
    const all = ctx.match[1] === "all";
    const hidden = tasks.length - compactTaskCount;
    const keyboard =
      hidden <= 0
        ? undefined
        : all
          ? new InlineKeyboard().text("Mostra meno", "tasks:short")
          : new InlineKeyboard().text(`Mostra altre ${hidden}`, "tasks:all");
    const away = await store.awayUserIds(resolved.house.id);
    const text = tasks.length ? formatTaskList(tasks, new Date(), all ? undefined : compactTaskCount, away, timezone) : "Nessuna attività.";
    await ctx.editMessageText(text, keyboard ? { reply_markup: keyboard } : {}).catch(() => undefined);
  });

  /** "✅ Confermo" sotto la richiesta "sono fuori casa". */
  bot.callbackQuery(/^away:(\d+)$/, async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      await service.approveAbsence(resolved.house, resolved.user, Number(ctx.match[1]));
      await ctx.answerCallbackQuery({ text: "✓ Confermato" });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error instanceof AbsenceError ? error.message : "Errore", show_alert: error instanceof AbsenceError });
    }
  });

  /** "✅ Accetto" / "❌ Rifiuto" sotto una richiesta di scambio di turno: risponde solo chi l'ha ricevuta. */
  bot.callbackQuery(/^swap:(\d+):(yes|no)$/, async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      await ctx.answerCallbackQuery();
      return;
    }
    const accept = ctx.match[2] === "yes";
    try {
      await service.answerSwap(resolved.house, resolved.user, Number(ctx.match[1]), accept);
      await ctx.answerCallbackQuery({ text: accept ? "✓ Scambiato" : "Rifiutato" });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error instanceof SwapError ? error.message : "Errore", show_alert: error instanceof SwapError });
    }
  });

  bot.callbackQuery(/^cmd:(tasks|done|log)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const action = ctx.match[1];
    if (action === "tasks") {
      await showTasks(ctx, resolved);
    } else if (action === "done") {
      await showDonePicker(ctx, resolved);
    } else {
      await showLog(ctx, resolved, 10);
    }
  });

  bot.command("nuova", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const { fields, silent } = parseFields(ctx.match);
    const [name, frequencyText, severityText] = fields;
    if (!name || !frequencyText) {
      await ctx.reply("/nuova nome | frequenza | gravità\nEs: /nuova Bagno | 2 volte a settimana | importante");
      return;
    }

    const intervalMs = parseDurationInput(frequencyText);
    if (!intervalMs) {
      await ctx.reply("Frequenza non valida. Es: 3 giorni, 2 volte a settimana");
      return;
    }

    const severity = severityText ? severityFromItalian(severityText) : "medium";
    if (!severity) {
      await ctx.reply("Gravità: poco importante, medio, importante");
      return;
    }

    const { task, notified } = await service.createTask(resolved.house, resolved.user, { name, intervalMs, severity }, silent ? { notify: false } : {});
    if (!notified) {
      await ctx.reply(`✓ ${task.name} · ${formatFrequencyShort(task.intervalMs)} · ${severityToItalian(task.severity)}`);
    }
  });

  bot.command("modifica", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const { fields, silent } = parseFields(ctx.match);
    const [numberText, name, frequencyText, severityText] = fields;
    const number = numberText ? parseTaskNumber(numberText) : null;
    if (!number) {
      await ctx.reply("/modifica n | nome | frequenza | gravità\n«-» lascia invariato");
      return;
    }

    const target = (await sortedTasks(resolved.house.id))[number - 1];
    if (!target) {
      await ctx.reply("Numero non valido. /attivita");
      return;
    }

    const updates: { name?: string; intervalMs?: number; severity?: "low" | "medium" | "high" } = {};
    if (name && name !== "-") {
      updates.name = name;
    }
    if (frequencyText && frequencyText !== "-") {
      const intervalMs = parseDurationInput(frequencyText);
      if (!intervalMs) {
        await ctx.reply("Frequenza non valida. Es: 3 giorni, 2 volte a settimana");
        return;
      }
      updates.intervalMs = intervalMs;
    }
    if (severityText && severityText !== "-") {
      const severity = severityFromItalian(severityText);
      if (!severity) {
        await ctx.reply("Gravità: poco importante, medio, importante");
        return;
      }
      updates.severity = severity;
    }

    const result = await service.updateTask(resolved.house, resolved.user, target.id, updates, silent ? { notify: false } : {});
    if (!result) {
      await ctx.reply("Attività non trovata.");
    } else if (result.changes.length === 0) {
      await ctx.reply("Nessuna modifica.");
    } else if (!result.notified) {
      await ctx.reply(`✓ ${result.task.name} · ${result.changes.join(" · ")}`);
    }
  });

  bot.command("elimina", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const { fields, silent } = parseFields(ctx.match);
    const number = fields[0] ? parseTaskNumber(fields[0]) : null;
    if (!number) {
      await ctx.reply("/elimina n");
      return;
    }

    const target = (await sortedTasks(resolved.house.id))[number - 1];
    if (!target) {
      await ctx.reply("Numero non valido. /attivita");
      return;
    }

    const result = await service.deleteTask(resolved.house, resolved.user, target.id, silent ? { notify: false } : {});
    if (result && !result.notified) {
      await ctx.reply(`✓ Eliminata: ${result.task.name}`);
    }
  });

  // ---- Fuori casa ----

  bot.command("fuori", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const open = (await store.listOpenAbsences(resolved.house.id)).find((absence) => absence.userId === resolved.user.id);
    if (open) {
      await ctx.reply(
        open.status === "pending"
          ? "🧳 Hai già chiesto: serve l'ok di un coinquilino (pulsante ✅ Confermo)."
          : "🧳 Sei già fuori casa. Quando torni: /rientro",
      );
      return;
    }
    // Il messaggio con il pulsante "Confermo" lo scrive il servizio nel gruppo.
    await service.requestAbsence(resolved.house, resolved.user);
  });

  bot.command("rientro", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const query = ctx.match.trim().replace(/^@/, "").toLowerCase();
    const active = (await store.listOpenAbsences(resolved.house.id)).filter((absence) => absence.status === "active");
    let target = active.find((absence) => absence.userId === resolved.user.id);
    if (query) {
      const members = await store.listMembers(resolved.house.id);
      const matches = members.filter(
        (member) => member.displayName.toLowerCase().startsWith(query) || member.username?.toLowerCase() === query,
      );
      target = active.find((absence) => matches.some((member) => member.userId === absence.userId));
      if (!target) {
        await ctx.reply(matches.length ? `${matches[0]!.displayName} non risulta fuori casa.` : "Nessun coinquilino con quel nome.");
        return;
      }
    }
    if (!target) {
      const away = active.map((absence) => absence.userName);
      await ctx.reply(away.length ? `Non risulti fuori casa. Fuori ora: ${away.join(", ")} · /rientro nome` : "Nessuno è fuori casa.");
      return;
    }
    // Il riepilogo delle scadenze spostate lo scrive il servizio nel gruppo.
    await service.endAbsence(resolved.house, resolved.user, target.id, timezone);
  });

  bot.command("notifiche", async (ctx) => {
    const resolved = await resolveHouse(ctx);
    if (!resolved) {
      return;
    }

    const argument = ctx.match.trim().toLowerCase();
    if (["on", "si", "sì"].includes(argument)) {
      await store.setHouseNotifyChanges(resolved.house.id, true);
      await ctx.reply("Avvisi on");
    } else if (["off", "no"].includes(argument)) {
      await store.setHouseNotifyChanges(resolved.house.id, false);
      await ctx.reply("Avvisi off");
    } else {
      await ctx.reply(`Avvisi ${resolved.house.notifyChanges ? "on" : "off"} · /notifiche on|off`);
    }
  });

  // Comando sconosciuto: risponde solo in privato o se il comando è indirizzato a questo bot (/x@bot),
  // per non disturbare gli altri bot presenti nel gruppo.
  bot.on("message:text", async (ctx) => {
    const match = ctx.message.text.match(/^\/(\w+)(?:@(\w+))?/);
    if (!match) {
      return;
    }

    const addressedToMe = match[2]?.toLowerCase() === ctx.me.username.toLowerCase();
    if (ctx.chat.type === "private" || addressedToMe) {
      await ctx.reply("Comando sconosciuto. /help");
    }
  });

  bot.catch((error) => {
    console.error("Errore bot:", error.error);
    const chatId = error.ctx.chat?.id;
    if (chatId) {
      void safeSend(send, chatId, "Errore, riprova.");
    }
  });

  return { bot, service, send };
}

/** Divide "a | b | c | silenzioso" in campi, estraendo l'eventuale flag finale "silenzioso". */
export function parseFields(input: string): { fields: string[]; silent: boolean } {
  const fields = input.split("|").map((field) => field.trim()).filter((field, index, all) => field.length > 0 || index < all.length - 1);
  let silent = false;
  const last = fields[fields.length - 1]?.toLowerCase();
  if (last === "silenzioso" || last === "muto") {
    silent = true;
    fields.pop();
  }
  return { fields, silent };
}

export function formatLogEntry(entry: LogEntry, timezone: string): string {
  const when = new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(entry.createdAt)).replace(",", "");

  const icon = {
    done: "✅",
    created: entry.detail === "ripristinata" ? "♻️" : "➕",
    updated: "✏️",
    deleted: "🗑",
  }[entry.kind];
  const detail = entry.kind === "updated" && entry.detail ? ` (${entry.detail})` : "";

  return `${when} · ${entry.userName} ${icon} ${entry.taskName}${detail}`;
}

function buildMiniAppKeyboard(siteUrl: string | undefined): InlineKeyboard | undefined {
  return siteUrl ? new InlineKeyboard().webApp("Apri la casa", siteUrl) : undefined;
}

function buildDisplayName(firstName: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;
}
