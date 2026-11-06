import type { Task, TaskSeverity } from "../types/domain.js";
import { getDueAt } from "../services/policy.js";
import { formatFrequencyShort } from "./duration.js";
import { severityToItalian } from "./labels.js";

export function sortTasksByDueDate<T extends Pick<Task, "intervalMs" | "cycleAnchorAt" | "slotDueAt">>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => getDueAt(left).getTime() - getDueAt(right).getTime());
}

export function parseTaskNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type TaskShape = { name: string; intervalMs: number; severity: TaskSeverity };

/** Elenca cosa e' cambiato tra due versioni di un'attivita' (vuoto se nulla). */
export function describeTaskChanges(before: TaskShape, after: TaskShape): string[] {
  const changes: string[] = [];

  if (before.name !== after.name) {
    changes.push(`nome "${before.name}" → "${after.name}"`);
  }
  if (before.intervalMs !== after.intervalMs) {
    changes.push(`frequenza ${formatFrequencyShort(before.intervalMs)} → ${formatFrequencyShort(after.intervalMs)}`);
  }
  if (before.severity !== after.severity) {
    changes.push(`gravità ${severityToItalian(before.severity)} → ${severityToItalian(after.severity)}`);
  }

  return changes;
}
