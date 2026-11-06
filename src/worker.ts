import { webhookCallback } from "grammy";
import { assignModeValues, digestKindValues, slotKindValues } from "./types/domain.js";
import type { DigestKind } from "./types/domain.js";
import type { DigestUpdate } from "./services/store.js";
import type { AppUser, AssignMode, House, SlotKind, Task, TaskSeverity, TaskSlot } from "./types/domain.js";
import type { AssignmentInput } from "./services/store.js";
import { createBotApp, registerBotCommands } from "./bot/handlers.js";
import { createD1Db } from "./services/db.js";
import { HouseStore, sessionTtlSeconds } from "./services/store.js";
import { runDueChecks } from "./services/scheduler.js";
import { composeDigest, defaultDigestIntro, runDigests } from "./services/digest.js";
import { defaultInsults, maxInsultLength, maxInsultsPerSeverity } from "./services/insults.js";
import { getDueAt } from "./services/policy.js";
import { verifyTelegramMiniAppInitData } from "./services/web-auth.js";
import { renderAppPage } from "./web/page.js";
import { renderContributePage } from "./web/contribute.js";
import { formatFrequency, parseDurationInput } from "./utils/duration.js";
import { severityFromItalian } from "./utils/labels.js";
import { sortTasksByDueDate } from "./utils/tasks.js";
import { isBotPaused } from "./utils/paused.js";

type WorkerEnv = {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  SHAMEBOT_DB: D1Database;
  BOT_USERNAME?: string;
  SITE_URL?: string;
  DEFAULT_TIMEZONE?: string;
  BOT_PAUSED?: string;
  /** Repository pubblico del progetto, mostrato nella pagina /contribuisci. */
  REPO_URL?: string;
};

const defaultRepoUrl = "https://github.com/MarkupMark/shamebot";

const sessionCookieName = "shamebot_session";
const webLoginRequestTtlMs = 10 * 60 * 1000;
const maxTaskNameLength = 80;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function createRuntime(env: WorkerEnv, siteUrl: string) {
  const store = new HouseStore(createD1Db(env.SHAMEBOT_DB));
  const app = createBotApp({
    store,
    botToken: env.BOT_TOKEN,
    siteUrl,
    timezone: env.DEFAULT_TIMEZONE?.trim() || "Europe/Rome",
    sendMessages: !isBotPaused(env.BOT_PAUSED),
  });
  return { store, ...app };
}

function resolveSiteUrl(env: WorkerEnv, url: URL): string {
  return env.SITE_URL?.trim() || url.origin;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const siteUrl = resolveSiteUrl(env, url);
    const botUsername = env.BOT_USERNAME?.trim() || "vergognati_bot";

    try {
      if (url.pathname === "/health") {
        return new Response(isBotPaused(env.BOT_PAUSED) ? "paused" : "ok");
      }

      if ((url.pathname === "/" || url.pathname === "/login") && request.method === "GET") {
        return htmlResponse(renderAppPage({ botUsername, siteUrl }));
      }

      if (url.pathname === "/contribuisci" && request.method === "GET") {
        return htmlResponse(renderContributePage({ repoUrl: env.REPO_URL?.trim() || defaultRepoUrl }));
      }

      if (url.pathname === "/webhook" && request.method === "POST") {
        if (isBotPaused(env.BOT_PAUSED)) {
          return new Response(null, { status: 204 });
        }

        const { bot } = createRuntime(env, siteUrl);
        return await webhookCallback(bot, "cloudflare-mod", {
          onTimeout: "return",
          timeoutMilliseconds: 9_000,
          secretToken: env.WEBHOOK_SECRET,
        })(request);
      }

      if (url.pathname === "/setup") {
        if (isBotPaused(env.BOT_PAUSED)) {
          return new Response("Bot paused", { status: 503 });
        }

        const { bot } = createRuntime(env, siteUrl);
        await registerBotCommands(bot, { siteUrl });
        return new Response("Commands registered successfully");
      }

      return await routeApi(request, env, url, siteUrl, botUsername);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, { status: error.status });
      }

      console.error("Errore worker:", error);
      return jsonResponse({ error: "Errore interno" }, { status: 500 });
    }
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    if (isBotPaused(env.BOT_PAUSED)) {
      return;
    }

    const { store, send } = createRuntime(env, env.SITE_URL?.trim() || "");
    const now = new Date();
    ctx.waitUntil(runDueChecks(store, send, now));
    ctx.waitUntil(runDigests(store, send, now, timezoneOf(env)));
    ctx.waitUntil(store.pruneExpired());
  },
};

async function routeApi(request: Request, env: WorkerEnv, url: URL, siteUrl: string, botUsername: string): Promise<Response> {
  const store = new HouseStore(createD1Db(env.SHAMEBOT_DB));
  const method = request.method;
  const path = url.pathname;

  // ---- Autenticazione ----

  if (path === "/auth/telegram/miniapp" && method === "POST") {
    const body = await readJsonObject(request);
    const initData = typeof body.initData === "string" ? body.initData.trim() : "";
    if (!initData) {
      throw new HttpError(400, "InitData Mini App mancante");
    }

    let verified;
    try {
      verified = await verifyTelegramMiniAppInitData(initData, env.BOT_TOKEN);
    } catch (error) {
      throw new HttpError(401, error instanceof Error ? error.message : "Autenticazione Telegram fallita");
    }

    const user = await store.upsertUser({
      telegramId: verified.telegramId,
      username: verified.username,
      displayName: verified.displayName,
    });
    return await sessionResponse(store, user);
  }

  if (path === "/auth/telegram/request") {
    if (method === "POST") {
      const loginRequest = await store.createWebLoginRequest(new Date(Date.now() + webLoginRequestTtlMs));
      return jsonResponse({
        ok: true,
        request: {
          token: loginRequest.token,
          status: loginRequest.status,
          expiresAt: loginRequest.expiresAt,
          botUrl: `https://t.me/${botUsername}?start=login_${loginRequest.token}`,
        },
      });
    }

    if (method === "GET") {
      const token = url.searchParams.get("token")?.trim() ?? "";
      if (!token) {
        throw new HttpError(400, "Token login mancante.");
      }

      const loginRequest = await store.getWebLoginRequest(token);
      return jsonResponse({ ok: true, request: { token, status: loginRequest?.status ?? "missing" } });
    }

    return methodNotAllowed(["GET", "POST"]);
  }

  if (path === "/auth/telegram/claim" && method === "POST") {
    const body = await readJsonObject(request);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      throw new HttpError(400, "Token login mancante.");
    }

    const loginRequest = await store.getWebLoginRequest(token);
    if (!loginRequest) {
      throw new HttpError(404, "Richiesta di login non valida.");
    }
    if (loginRequest.status === "pending") {
      throw new HttpError(409, "Apri Telegram e conferma il login nel bot.");
    }
    if (loginRequest.status === "expired") {
      throw new HttpError(410, "Richiesta di login scaduta. Generane una nuova.");
    }
    if (loginRequest.status === "claimed") {
      throw new HttpError(409, "Richiesta di login gia' usata.");
    }

    const claimed = await store.claimWebLoginRequest(token, new Date());
    if (!claimed?.telegramId || !claimed.displayName) {
      throw new HttpError(409, "Richiesta di login incompleta.");
    }

    const user = await store.upsertUser({
      telegramId: claimed.telegramId,
      username: claimed.username,
      displayName: claimed.displayName,
    });
    return await sessionResponse(store, user);
  }

  if (path === "/logout" && method === "POST") {
    const sessionId = getSessionId(request);
    if (sessionId) {
      await store.destroyWebSession(sessionId);
    }
    return jsonResponse({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
  }

  // ---- API autenticate ----

  if (!path.startsWith("/api/")) {
    return new Response("Not found", { status: 404 });
  }

  const user = await requireUser(store, request);
  const { service } = createRuntime(env, siteUrl);

  if (path === "/api/me" && method === "GET") {
    const houses = await store.listHousesForUser(user.id);
    return jsonResponse({
      user: { id: user.id, displayName: user.displayName, username: user.username },
      houses: houses.map((house) => ({ id: house.id, name: house.name })),
    });
  }

  const houseMatch = path.match(/^\/api\/houses\/(\d+)(?:\/(.*))?$/);
  if (!houseMatch) {
    return new Response("Not found", { status: 404 });
  }

  const house = await requireHouseMember(store, Number(houseMatch[1]), user);
  const rest = houseMatch[2] ?? "";

  if (rest === "") {
    if (method === "GET") {
      return jsonResponse(await buildHousePayload(store, house, user, timezoneOf(env)));
    }

    if (method === "PATCH") {
      const body = await readJsonObject(request);
      if (typeof body.notifyChanges === "boolean") {
        await store.setHouseNotifyChanges(house.id, body.notifyChanges);
      }
      if (body.insults !== undefined) {
        // Ognuno modifica solo i propri insulti.
        for (const [severity, messages] of parseInsultUpdates(body.insults)) {
          await store.setMyInsults(house.id, user.id, severity, messages);
        }
      }
      if (body.digests !== undefined) {
        for (const [kind, update] of parseDigestUpdates(body.digests)) {
          await store.updateDigest(house.id, kind, update);
        }
      }
      return jsonResponse(await buildHousePayload(store, (await store.getHouse(house.id)) as House, user, timezoneOf(env)));
    }

    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (rest === "tasks" && method === "POST") {
    const body = await readJsonObject(request);
    const parsed = parseTaskPayload(body, { partial: false });
    const assignment = await parseAssignment(store, house.id, body.assignment);
    const { task, notified } = await service.createTask(
      house,
      user,
      {
        name: parsed.name as string,
        intervalMs: parsed.intervalMs as number,
        severity: parsed.severity ?? "medium",
        ...(assignment ? { assignment } : {}),
      },
      notifyOption(body),
    );
    return jsonResponse({ ok: true, task: mapTaskView(task), notified }, { status: 201 });
  }

  const restoreMatch = rest.match(/^log\/(\d+)\/restore$/);
  if (restoreMatch) {
    if (method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    const body = await readOptionalJsonObject(request);
    const result = await service.restoreTask(house, user, Number(restoreMatch[1]), notifyOption(body));
    if (!result) {
      throw new HttpError(409, "Questa voce non e' ripristinabile (gia' ripristinata o attivita' ancora presente).");
    }
    return jsonResponse({ ok: true, task: mapTaskView(result.task), notified: result.notified }, { status: 201 });
  }

  const taskMatch = rest.match(/^tasks\/(\d+)(?:\/(complete))?$/);
  if (taskMatch) {
    const taskId = Number(taskMatch[1]);

    if (taskMatch[2] === "complete") {
      if (method !== "POST") {
        return methodNotAllowed(["POST"]);
      }
      const task = await service.completeTask(house, user, taskId, true);
      if (!task) {
        throw new HttpError(404, "Attivita' non trovata");
      }
      return jsonResponse({ ok: true, task: mapTaskView(task) });
    }

    if (method === "PATCH") {
      const body = await readJsonObject(request);
      const assignment = await parseAssignment(store, house.id, body.assignment);
      const updates = { ...parseTaskPayload(body, { partial: true }), ...(assignment ? { assignment } : {}) };
      const result = await service.updateTask(house, user, taskId, updates, notifyOption(body));
      if (!result) {
        throw new HttpError(404, "Attivita' non trovata");
      }
      return jsonResponse({ ok: true, task: mapTaskView(result.task), changes: result.changes, notified: result.notified });
    }

    if (method === "DELETE") {
      const notify = url.searchParams.get("notify");
      const result = await service.deleteTask(house, user, taskId, notify === null ? {} : { notify: notify === "1" });
      if (!result) {
        throw new HttpError(404, "Attivita' non trovata");
      }
      return jsonResponse({ ok: true, notified: result.notified });
    }

    return methodNotAllowed(["PATCH", "DELETE", "POST"]);
  }

  return new Response("Not found", { status: 404 });
}

function timezoneOf(env: WorkerEnv): string {
  return env.DEFAULT_TIMEZONE?.trim() || "Europe/Rome";
}

async function buildHousePayload(store: HouseStore, house: House, viewer: AppUser, timezone: string) {
  const now = new Date();
  const [tasks, members, log, slots, digests, myInsults, insultCounts] = await Promise.all([
    store.listTasks(house.id),
    store.listMembers(house.id),
    store.listLog(house.id, 50),
    store.listOpenSlots(house.id),
    store.getDigests(house.id),
    store.listMyInsults(house.id, viewer.id),
    store.countInsults(house.id),
  ]);

  const digestViews = await Promise.all(
    digestKindValues.map(async (kind) => {
      const settings = digests[kind];
      const preview = await composeDigest(store, house, kind, settings, now, timezone);
      return {
        kind,
        enabled: settings.enabled,
        time: settings.time,
        intro: settings.intro,
        defaultIntro: defaultDigestIntro[kind],
        skipIfEmpty: settings.skipIfEmpty,
        preview: preview.text,
        previewEmpty: preview.empty,
      };
    }),
  );

  return {
    house: { id: house.id, name: house.name, notifyChanges: house.notifyChanges },
    viewerId: viewer.id,
    now: new Date().toISOString(),
    tasks: sortTasksByDueDate(tasks).map((task) => mapTaskView(task, slots.filter((slot) => slot.taskId === task.id))),
    members: members.map((member) => ({ id: member.userId, displayName: member.displayName, username: member.username })),
    log,
    digests: digestViews,
    // Solo gli insulti scritti da chi guarda: quelli degli altri restano segreti (se ne mostra solo il numero).
    insults: (["low", "medium", "high"] as const).map((severity) => ({
      severity,
      mine: myInsults[severity],
      byOthers: insultCounts[severity] - myInsults[severity].length,
      defaults: defaultInsults[severity],
    })),
    timezone,
  };
}

function mapTaskView(task: Task, slots: TaskSlot[] = []) {
  const dueAt = getDueAt(task);
  // Inizio della finestra corrente: il turno personalizzato o l'ultimo completamento.
  const startAt = task.slotDueAt && task.slotStartsAt ? new Date(task.slotStartsAt) : new Date(task.cycleAnchorAt);
  return {
    id: task.id,
    name: task.name,
    intervalMs: task.intervalMs,
    frequency: formatFrequency(task.intervalMs),
    severity: task.severity,
    dueAt: dueAt.toISOString(),
    startAt: startAt.toISOString(),
    lastCompletedByName: task.lastCompletedByName,
    completedCount: task.completedCount,
    assignMode: task.assignMode,
    assignUserIds: task.assignUserIds,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    slots: slots.map((slot) => ({
      id: slot.id,
      userId: slot.userId,
      userName: slot.userName,
      kind: slot.kind,
      startsAt: slot.startsAt,
      dueAt: slot.dueAt,
    })),
  };
}

function parseTaskPayload(body: Record<string, unknown>, { partial }: { partial: boolean }) {
  const result: { name?: string; intervalMs?: number; severity?: TaskSeverity } = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > maxTaskNameLength) {
      throw new HttpError(400, `Il nome e' obbligatorio (massimo ${maxTaskNameLength} caratteri).`);
    }
    result.name = name;
  }

  if (body.intervalMs !== undefined || body.interval !== undefined || !partial) {
    let intervalMs: number | null = null;
    if (typeof body.intervalMs === "number" && Number.isFinite(body.intervalMs)) {
      intervalMs = Math.round(body.intervalMs);
    } else if (typeof body.interval === "string") {
      intervalMs = parseDurationInput(body.interval);
    }

    if (!intervalMs || intervalMs < 60_000) {
      throw new HttpError(400, "Frequenza non valida (minimo 1 minuto).");
    }
    result.intervalMs = intervalMs;
  }

  if (body.severity !== undefined || !partial) {
    const severity = typeof body.severity === "string" ? severityFromItalian(body.severity) : "medium";
    if (!severity) {
      throw new HttpError(400, "Gravita' non valida.");
    }
    result.severity = severity;
  }

  return result;
}

const maxSlots = 60;

/** Valida l'assegnazione inviata dal portale: tutti gli utenti devono far parte della casa. */
async function parseAssignment(store: HouseStore, houseId: number, raw: unknown): Promise<AssignmentInput | null> {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "Assegnazione non valida.");
  }

  const body = raw as Record<string, unknown>;
  const mode = body.mode as AssignMode;
  if (!assignModeValues.includes(mode)) {
    throw new HttpError(400, "Modalita' di assegnazione non valida.");
  }

  const memberIds = new Set((await store.listMembers(houseId)).map((member) => member.userId));
  const isMember = (id: unknown): id is number => typeof id === "number" && memberIds.has(id);

  if (mode === "anyone") {
    return { mode };
  }

  if (mode === "single" || mode === "alternate") {
    const ids = Array.isArray(body.userIds) ? body.userIds : [];
    if (!ids.every(isMember) || new Set(ids).size !== ids.length) {
      throw new HttpError(400, "Scegli coinquilini della casa.");
    }
    if (mode === "single" && ids.length !== 1) {
      throw new HttpError(400, "Scegli a chi assegnare l'attivita'.");
    }
    if (mode === "alternate" && ids.length < 2) {
      throw new HttpError(400, "Per i turni servono almeno due coinquilini.");
    }
    return { mode, userIds: ids as number[] };
  }

  const rawSlots = Array.isArray(body.slots) ? body.slots : [];
  if (rawSlots.length === 0 || rawSlots.length > maxSlots) {
    throw new HttpError(400, `Aggiungi da 1 a ${maxSlots} turni.`);
  }
  const slots = rawSlots.map((item) => {
    const slot = (item ?? {}) as Record<string, unknown>;
    const kind = slot.kind as SlotKind;
    const startsAt = typeof slot.startsAt === "string" ? new Date(slot.startsAt) : null;
    const dueAt = typeof slot.dueAt === "string" ? new Date(slot.dueAt) : null;
    if (!isMember(slot.userId) || !slotKindValues.includes(kind)) {
      throw new HttpError(400, "Turno non valido: scegli un coinquilino e un periodo.");
    }
    if (!startsAt || !dueAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(dueAt.getTime()) || dueAt <= startsAt) {
      throw new HttpError(400, "Turno non valido: date mancanti o sbagliate.");
    }
    return { userId: slot.userId, kind, startsAt: startsAt.toISOString(), dueAt: dueAt.toISOString() };
  });
  return { mode, slots };
}

/** Valida { low?: string[], ... } con i propri insulti (lista vuota = cancellali). */
function parseInsultUpdates(raw: unknown): Array<[TaskSeverity, string[]]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "Insulti non validi.");
  }

  const updates: Array<[TaskSeverity, string[]]> = [];
  for (const [severity, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!["low", "medium", "high"].includes(severity)) {
      throw new HttpError(400, "Gravita' non valida.");
    }
    if (!Array.isArray(value)) {
      throw new HttpError(400, "Insulti non validi.");
    }
    const messages = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    if (messages.length > maxInsultsPerSeverity || messages.some((message) => message.length > maxInsultLength)) {
      throw new HttpError(400, `Massimo ${maxInsultsPerSeverity} messaggi da ${maxInsultLength} caratteri.`);
    }
    updates.push([severity as TaskSeverity, messages]);
  }
  return updates;
}

const maxDigestIntroLength = 200;

/** Valida { morning?: {...}, evening?: {...} } inviato dal portale. */
function parseDigestUpdates(raw: unknown): Array<[DigestKind, DigestUpdate]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "Impostazioni promemoria non valide.");
  }

  const updates: Array<[DigestKind, DigestUpdate]> = [];
  for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!digestKindValues.includes(kind as DigestKind) || !value || typeof value !== "object") {
      throw new HttpError(400, "Impostazioni promemoria non valide.");
    }
    const body = value as Record<string, unknown>;
    const update: DigestUpdate = {};

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw new HttpError(400, "Valore non valido per l'attivazione.");
      update.enabled = body.enabled;
    }
    if (body.skipIfEmpty !== undefined) {
      if (typeof body.skipIfEmpty !== "boolean") throw new HttpError(400, "Valore non valido.");
      update.skipIfEmpty = body.skipIfEmpty;
    }
    if (body.time !== undefined) {
      if (typeof body.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) {
        throw new HttpError(400, "Orario non valido (formato HH:MM).");
      }
      update.time = body.time;
    }
    if (body.intro !== undefined) {
      if (body.intro !== null && typeof body.intro !== "string") throw new HttpError(400, "Testo non valido.");
      const intro = typeof body.intro === "string" ? body.intro.trim() : "";
      if (intro.length > maxDigestIntroLength) {
        throw new HttpError(400, `Il testo puo' avere al massimo ${maxDigestIntroLength} caratteri.`);
      }
      update.intro = intro || null;
    }
    updates.push([kind as DigestKind, update]);
  }
  return updates;
}

function notifyOption(body: Record<string, unknown>): { notify?: boolean } {
  return typeof body.notify === "boolean" ? { notify: body.notify } : {};
}

async function requireUser(store: HouseStore, request: Request): Promise<AppUser> {
  const sessionId = getSessionId(request);
  const user = sessionId ? await store.getUserBySession(sessionId) : null;
  if (!user) {
    throw new HttpError(401, "Sessione non valida");
  }
  return user;
}

async function requireHouseMember(store: HouseStore, houseId: number, user: AppUser): Promise<House> {
  const house = await store.getHouse(houseId);
  if (!house || !(await store.isMember(house.id, user.id))) {
    throw new HttpError(404, "Casa non trovata");
  }
  return house;
}

async function sessionResponse(store: HouseStore, user: AppUser): Promise<Response> {
  const sessionId = await store.createWebSession(user.id);
  return jsonResponse(
    { ok: true, user: { displayName: user.displayName, username: user.username } },
    { headers: { "Set-Cookie": `${sessionCookieName}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${sessionTtlSeconds}` } },
  );
}

function clearedSessionCookie(): string {
  return `${sessionCookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function getSessionId(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === sessionCookieName && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Payload JSON non valido");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Payload JSON non valido");
  }
  return body as Record<string, unknown>;
}

async function readOptionalJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  return text.trim() ? await readJsonObject(new Request(request.url, { method: "POST", body: text })) : {};
}

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const [key, value] of new Headers(init.headers).entries()) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function methodNotAllowed(allowed: string[]): Response {
  return new Response("Method not allowed", { status: 405, headers: { allow: allowed.join(", ") } });
}
