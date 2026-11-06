const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const weekMs = 7 * dayMs;

export function parseDurationInput(input: string): number | null {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) {
    return null;
  }

  const frequencyMatch = cleaned.match(/^(\d+)\s*volt[ae]\s*(?:a|alla|al|per|ogni)\s*(settimana|giorno|mese)$/);
  if (frequencyMatch) {
    const times = Number(frequencyMatch[1]);
    if (times < 1) {
      return null;
    }
    const periodMs = frequencyMatch[2] === "settimana" ? weekMs : frequencyMatch[2] === "giorno" ? dayMs : 30 * dayMs;
    return Math.round(periodMs / times);
  }

  const compactMatch = cleaned.match(/^(\d+)\s*(m|min|mins|minute|minuti|h|hr|hrs|hour|ore|d|day|days|giorno|giorni|w|week|weeks|settimana|settimane)$/);
  if (compactMatch) {
    const amount = Number(compactMatch[1]);
    const unit = compactMatch[2];
    return amount * resolveUnitMs(unit);
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length === 2 && /^\d+$/.test(parts[0])) {
    return Number(parts[0]) * resolveUnitMs(parts[1]);
  }

  if (/^\d+$/.test(cleaned)) {
    return Number(cleaned) * dayMs;
  }

  return null;
}

function resolveUnitMs(unit: string): number {
  if (["m", "min", "mins", "minute", "minuti"].includes(unit)) {
    return minuteMs;
  }

  if (["h", "hr", "hrs", "hour", "ore"].includes(unit)) {
    return hourMs;
  }

  if (["d", "day", "days", "giorno", "giorni"].includes(unit)) {
    return dayMs;
  }

  if (["w", "week", "weeks", "settimana", "settimane"].includes(unit)) {
    return weekMs;
  }

  throw new Error(`Unita' non supportata: ${unit}`);
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / minuteMs));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} giorn${days === 1 ? "o" : "i"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} or${hours === 1 ? "a" : "e"}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minut${minutes === 1 ? "o" : "i"}`);
  }

  return parts.join(", ");
}

export function formatRelativeTime(ms: number): string {
  if (ms >= 0) {
    return `tra ${formatDuration(ms)}`;
  }

  return `in ritardo di ${formatDuration(Math.abs(ms))}`;
}

export function formatCompactDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / minuteMs));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(", ");
}

export function formatCompactRelativeTime(ms: number): string {
  if (ms >= 0) {
    return formatCompactDuration(ms);
  }

  return `scaduta da ${formatCompactDuration(Math.abs(ms))}`;
}

export const oneDayMs = dayMs;

const weekDaysMs = 7 * dayMs;

/**
 * Descrive un intervallo come frequenza leggibile:
 * 7 giorni -> "1 volta a settimana", 3.5 giorni -> "2 volte a settimana", altrimenti "ogni <durata>".
 */
export function formatFrequency(intervalMs: number): string {
  if (intervalMs >= weekDaysMs && intervalMs % weekDaysMs === 0) {
    const weeks = intervalMs / weekDaysMs;
    return weeks === 1 ? "1 volta a settimana" : `ogni ${weeks} settimane`;
  }

  if (intervalMs < weekDaysMs) {
    const perWeek = weekDaysMs / intervalMs;
    if (Number.isInteger(perWeek)) {
      return `${perWeek} volte a settimana`;
    }
  }

  return `ogni ${formatDuration(intervalMs)}`;
}

/** Durata compatta per i messaggi: "7g", "3g 12h", "5h", "30m". */
export function formatShortDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / minuteMs));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 && days < 3 ? `${days}g ${hours}h` : `${days}g`;
  }
  if (hours > 0) {
    return minutes > 0 && hours < 3 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/** Frequenza compatta per i messaggi: "1×/sett", "2×/sett", "ogni 3g", "ogni giorno". */
export function formatFrequencyShort(intervalMs: number): string {
  if (intervalMs >= weekDaysMs && intervalMs % weekDaysMs === 0) {
    const weeks = intervalMs / weekDaysMs;
    return weeks === 1 ? "1×/sett" : `ogni ${weeks} sett`;
  }

  if (intervalMs < weekDaysMs && intervalMs % dayMs === 0) {
    const days = intervalMs / dayMs;
    return days === 1 ? "ogni giorno" : `ogni ${days}g`;
  }

  if (intervalMs < weekDaysMs) {
    const perWeek = weekDaysMs / intervalMs;
    if (Number.isInteger(perWeek)) {
      return `${perWeek}×/sett`;
    }
  }

  return `ogni ${formatShortDuration(intervalMs)}`;
}
