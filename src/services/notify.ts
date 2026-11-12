import type { MovedTask, NoticeStageKey, Task } from "../types/domain.js";
import { formatFrequencyShort, formatShortDuration } from "../utils/duration.js";
import { severityToItalian } from "../utils/labels.js";
import { getDueAt } from "./policy.js";

/** Pulsanti sotto un messaggio: righe di [testo, dato del callback]. */
export type MessageButtons = Array<Array<{ text: string; data: string }>>;

/** Invia un messaggio di testo a una chat Telegram. Implementato da bot.api, sostituibile nei test. */
export type SendToChat = (chatId: number, text: string, buttons?: MessageButtons) => Promise<unknown>;

export async function safeSend(send: SendToChat, chatId: number, text: string, buttons?: MessageButtons): Promise<boolean> {
  return (await sendAndGetId(send, chatId, text, buttons)) !== false;
}

/** Come safeSend ma restituisce l'id del messaggio inviato (null se sconosciuto), false se l'invio fallisce. */
export async function sendAndGetId(send: SendToChat, chatId: number, text: string, buttons?: MessageButtons): Promise<number | null | false> {
  try {
    const result = await send(chatId, text, buttons);
    const id = (result as { message_id?: unknown } | undefined)?.message_id;
    return typeof id === "number" ? id : null;
  } catch (error) {
    console.error(`Invio Telegram fallito verso ${chatId}:`, error);
    return false;
  }
}

/** Quante attivita' mostra /attivita prima del pulsante "Mostra altre". */
export const compactTaskCount = 5;

/** Riga compatta per /attivita: solo nome ed entro quando va fatta. */
export function formatTaskBullet(task: Task, now: Date, away: Set<number> = new Set()): string {
  if (task.assigneeId !== null && away.has(task.assigneeId)) {
    return `• ${task.name} · ⏸ in pausa, ${task.assigneeName} è fuori casa`;
  }
  const leftMs = getDueAt(task).getTime() - now.getTime();
  const state = leftMs < 0 ? `⚠️ in ritardo di ${formatShortDuration(leftMs)}` : `entro ${formatShortDuration(leftMs)}`;
  return `• ${task.name} · ${state}`;
}

/** Elenco puntato delle attivita' (gia' ordinate per scadenza); `limit` taglia alle prime N. */
export function formatTaskList(tasks: Task[], now: Date, limit?: number, away: Set<number> = new Set()): string {
  const shown = limit === undefined ? tasks : tasks.slice(0, limit);
  return shown.map((task) => formatTaskBullet(task, now, away)).join("\n");
}

export function taskCreatedMessage(actorName: string, task: Task): string {
  const who = task.assigneeName ? ` · 👤 ${task.assigneeName}` : "";
  return `➕ ${actorName}: ${task.name} · ${formatFrequencyShort(task.intervalMs)} · ${severityToItalian(task.severity)}${who}`;
}

export function taskUpdatedMessage(actorName: string, task: Task, changes: string[]): string {
  return [`✏️ ${actorName} · ${task.name}`, ...changes].join("\n");
}

export function taskDeletedMessage(actorName: string, task: Pick<Task, "name">): string {
  return `🗑 ${actorName}: ${task.name}`;
}

export function taskRestoredMessage(actorName: string, task: Task): string {
  return `♻️ ${actorName}: ${task.name} · ${formatFrequencyShort(task.intervalMs)}`;
}

export function taskCompletedMessage(actorName: string, task: Task): string {
  const next = Math.max(0, getDueAt(task).getTime() - Date.now());
  const who = task.assigneeName ? ` · tocca a ${task.assigneeName}` : "";
  return `✅ ${actorName}: ${task.name} · prossima tra ${formatShortDuration(next || task.intervalMs)}${who}`;
}

export function awayRequestedMessage(name: string): string {
  return `🧳 ${name} è fuori casa\nServe l'ok di un coinquilino: poi le sue attività vanno in pausa.`;
}

export function awayApprovedMessage(name: string, approver: string): string {
  return `🧳 ${name} è fuori casa · ok di ${approver}\nLe sue attività sono in pausa fino al rientro.`;
}

/** "a Luca" ma "ad Anna". */
export function toName(name: string): string {
  return `${/^[aA]/.test(name) ? "ad" : "a"} ${name}`;
}

export function swapRequestedMessage(requester: string, target: string, taskName: string, effect: string | null): string {
  return `🔄 ${requester} chiede ${toName(target)} di scambiarsi il turno di "${taskName}"${effect ? `\n${effect}` : ""}`;
}

export function swapAcceptedMessage(target: string, taskName: string, assignee: string | null): string {
  return `🔄 Turno scambiato · ok di ${target}\n"${taskName}": ora tocca ${toName(assignee ?? "?")}`;
}

export function swapRejectedMessage(target: string, taskName: string): string {
  return `🔄 ${target} non accetta lo scambio di turno di "${taskName}"`;
}

export function awayEndedMessage(name: string, endedBy: string | null, moved: MovedTask[], now: Date): string {
  const lines = [`🏠 ${name} è rientrato${endedBy && endedBy !== name ? ` (segnato da ${endedBy})` : ""}`];
  for (const item of moved) {
    lines.push(
      item.overdue
        ? `• ${item.task.name} · da fare oggi`
        : `• ${item.task.name} · tra ${formatShortDuration(item.dueAt.getTime() - now.getTime())} (+${formatShortDuration(item.shiftMs)} regalati)`,
    );
  }
  return lines.join("\n");
}

export function noticeMessage(task: Task, stage: NoticeStageKey, now: Date): string {
  const overdueMs = now.getTime() - getDueAt(task).getTime();
  const last = task.lastCompletedByName ? ` · ultima: ${task.lastCompletedByName}` : "";
  const who = task.assigneeName ? ` · tocca a ${task.assigneeName}` : "";

  switch (stage) {
    case "three_hours":
      return `⏰ ${task.name} · tra 3h${who}`;
    case "thirty_minutes":
      return `⏰ ${task.name} · tra 30m${who}`;
    case "overdue":
      return task.assigneeName
        ? `😬 ${task.name} · scaduta · doveva farla ${task.assigneeName}`
        : `😬 ${task.name} · scaduta${last}`;
    case "nudge":
      return task.assigneeName
        ? `🚨 ${task.name} · ${task.assigneeName} è in ritardo di ${formatShortDuration(overdueMs)}`
        : `🚨 ${task.name} · ritardo ${formatShortDuration(overdueMs)}${last}`;
  }
}
