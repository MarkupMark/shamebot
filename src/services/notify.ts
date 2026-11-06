import type { NoticeStageKey, Task } from "../types/domain.js";
import { formatFrequencyShort, formatShortDuration } from "../utils/duration.js";
import { severityToItalian } from "../utils/labels.js";
import { getDueAt } from "./policy.js";

/** Invia un messaggio di testo a una chat Telegram. Implementato da bot.api, sostituibile nei test. */
export type SendToChat = (chatId: number, text: string) => Promise<unknown>;

export async function safeSend(send: SendToChat, chatId: number, text: string): Promise<boolean> {
  try {
    await send(chatId, text);
    return true;
  } catch (error) {
    console.error(`Invio Telegram fallito verso ${chatId}:`, error);
    return false;
  }
}

/** Quante attivita' mostra /attivita prima del pulsante "Mostra altre". */
export const compactTaskCount = 5;

/** Riga compatta per /attivita: solo nome ed entro quando va fatta. */
export function formatTaskBullet(task: Task, now: Date): string {
  const leftMs = getDueAt(task).getTime() - now.getTime();
  const state = leftMs < 0 ? `⚠️ in ritardo di ${formatShortDuration(leftMs)}` : `entro ${formatShortDuration(leftMs)}`;
  return `• ${task.name} · ${state}`;
}

/** Elenco puntato delle attivita' (gia' ordinate per scadenza); `limit` taglia alle prime N. */
export function formatTaskList(tasks: Task[], now: Date, limit?: number): string {
  const shown = limit === undefined ? tasks : tasks.slice(0, limit);
  return shown.map((task) => formatTaskBullet(task, now)).join("\n");
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
      return `😬 ${task.name} · scaduta${who || last}`;
    case "nudge":
      return `🚨 ${task.name} · ritardo ${formatShortDuration(overdueMs)}${who || last}`;
  }
}
