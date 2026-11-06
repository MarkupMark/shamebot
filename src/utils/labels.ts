import type { TaskSeverity } from "../types/domain.js";

export function severityFromItalian(input: string): TaskSeverity | null {
  const normalized = input.trim().toLowerCase();

  if (["poco", "poco importante", "low", "bassa", "basso"].includes(normalized)) {
    return "low";
  }

  if (["medio", "media", "medium"].includes(normalized)) {
    return "medium";
  }

  if (["importante", "alta", "alto", "high", "massima", "massimo"].includes(normalized)) {
    return "high";
  }

  return null;
}

export function severityToItalian(severity: TaskSeverity): string {
  if (severity === "low") {
    return "poco importante";
  }
  if (severity === "medium") {
    return "medio";
  }
  return "importante";
}
