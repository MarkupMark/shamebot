import type { NoticeStage, NoticeStageKey, Task, TaskSeverity } from "../types/domain.js";
import { oneDayMs } from "../utils/duration.js";

const threeHoursMs = 3 * 60 * 60 * 1000;
const thirtyMinutesMs = 30 * 60 * 1000;

type TimingTask = Pick<Task, "intervalMs" | "cycleAnchorAt"> & { slotDueAt?: string | null };
type NoticeTask = TimingTask & Pick<Task, "severity" | "reminderThreeHoursSentAt" | "reminderThirtyMinutesSentAt" | "overdueNoticeSentAt" | "nudgeSentAt">;

export function getDueAt(task: TimingTask): Date {
  if (task.slotDueAt) {
    return new Date(task.slotDueAt);
  }
  return new Date(new Date(task.cycleAnchorAt).getTime() + task.intervalMs);
}

/** Dopo quanto tempo dalla scadenza parte il secondo sollecito nel gruppo (null = mai). */
function nudgeDelayMs(severity: TaskSeverity): number | null {
  if (severity === "high") {
    return oneDayMs;
  }
  if (severity === "medium") {
    return 2 * oneDayMs;
  }
  return null;
}

/** Tutte le notifiche previste per il ciclo corrente dell'attivita', in ordine cronologico. */
export function buildNoticeStages(task: TimingTask & Pick<Task, "severity">): NoticeStage[] {
  const dueAt = getDueAt(task);
  const stages: NoticeStage[] = [];

  if (task.intervalMs > threeHoursMs) {
    stages.push({ key: "three_hours", at: new Date(dueAt.getTime() - threeHoursMs) });
  }
  if (task.intervalMs > thirtyMinutesMs) {
    stages.push({ key: "thirty_minutes", at: new Date(dueAt.getTime() - thirtyMinutesMs) });
  }

  stages.push({ key: "overdue", at: dueAt });

  const delay = nudgeDelayMs(task.severity);
  if (delay !== null) {
    stages.push({ key: "nudge", at: new Date(dueAt.getTime() + delay) });
  }

  return stages;
}

function isStageSent(task: NoticeTask, key: NoticeStageKey): boolean {
  switch (key) {
    case "three_hours":
      return Boolean(task.reminderThreeHoursSentAt);
    case "thirty_minutes":
      return Boolean(task.reminderThirtyMinutesSentAt);
    case "overdue":
      return Boolean(task.overdueNoticeSentAt);
    case "nudge":
      return Boolean(task.nudgeSentAt);
  }
}

export type DueNotice = {
  /** La notifica da inviare ora: l'ultima tra quelle scadute e non ancora inviate. */
  send: NoticeStage;
  /** Tutte le fasi da segnare come gestite (include quelle saltate per non fare spam dopo uno stop). */
  markAsHandled: NoticeStageKey[];
};

export function getDueNotice(task: NoticeTask, now: Date): DueNotice | null {
  const pending = buildNoticeStages(task).filter((stage) => !isStageSent(task, stage.key) && now >= stage.at);
  const last = pending[pending.length - 1];
  if (!last) {
    return null;
  }

  return { send: last, markAsHandled: pending.map((stage) => stage.key) };
}
