/** Utilita' per lavorare nel fuso orario della casa. */

const dayMs = 24 * 60 * 60 * 1000;

type LocalParts = { date: string; minutes: number };

/** Data locale (YYYY-MM-DD) e minuti dalla mezzanotte locale nel fuso indicato. */
export function localParts(at: Date, timezone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Istante della mezzanotte locale del giorno di `at` (gestisce l'ora legale ricalcolando lo scarto). */
export function localMidnight(at: Date, timezone: string): Date {
  const { minutes } = localParts(at, timezone);
  const guess = new Date(at.getTime() - minutes * 60_000);
  const drift = localParts(guess, timezone).minutes;
  // Se nel frattempo c'e' stato un cambio d'ora la "mezzanotte" stimata cade alle 23 o all'1: correggi.
  const fix = drift === 0 ? 0 : drift > 12 * 60 ? (24 * 60 - drift) * 60_000 : -drift * 60_000;
  return new Date(Math.floor((guess.getTime() + fix) / 60_000) * 60_000);
}

/** Fine della giornata locale di `at` (mezzanotte successiva). */
export function endOfLocalDay(at: Date, timezone: string): Date {
  const midnight = localMidnight(at, timezone);
  return localMidnight(new Date(midnight.getTime() + dayMs + 2 * 60 * 60 * 1000), timezone);
}

