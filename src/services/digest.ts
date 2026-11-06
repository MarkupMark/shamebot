import type { DigestKind, DigestSettings, House, Task } from "../types/domain.js";
import type { HouseStore } from "./store.js";
import { getDueAt } from "./policy.js";
import { safeSend, type SendToChat } from "./notify.js";
import { formatShortDuration } from "../utils/duration.js";
import { sortTasksByDueDate } from "../utils/tasks.js";

export const defaultDigestIntro: Record<DigestKind, string> = {
  morning: "☀️ Buongiorno! Ecco cosa c'è da fare oggi",
  evening: "🌙 Ecco cosa dovrai fare domani",
};

/** Quante attivita' future suggerisce il buongiorno ("se vuoi fare altro oggi"). */
const morningSuggestions = 3;

/** Oltre questo ritardo rispetto all'orario impostato il promemoria del giorno viene saltato (es. dopo uno stop). */
const lateGraceMs = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

// ---- Fuso orario ----

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

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function clock(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(at);
}

// ---- Testo ----

function who(task: Task): string {
  return task.assigneeName ? ` · 👤 ${task.assigneeName}` : "";
}

export type DigestMessage = {
  text: string;
  /** true se non c'e' niente da segnalare (con skipIfEmpty il messaggio non parte). */
  empty: boolean;
};

function dayLabel(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, weekday: "short", day: "numeric" }).format(at);
}

/**
 * Buongiorno: cosa e' in ritardo e cosa scade oggi, poi "se vuoi fare altro oggi" con le prossime 3
 * attivita' in scadenza dopo oggi (in qualunque giorno).
 * Serale: cosa dovrai fare domani (attivita' in scadenza domani).
 */
export function buildDigest(
  kind: DigestKind,
  settings: Pick<DigestSettings, "intro">,
  tasks: Task[],
  now: Date,
  timezone: string,
): DigestMessage {
  const midnight = localMidnight(now, timezone);
  const endOfToday = localMidnight(new Date(midnight.getTime() + dayMs + 2 * 60 * 60 * 1000), timezone);
  const endOfTomorrow = localMidnight(new Date(endOfToday.getTime() + dayMs + 2 * 60 * 60 * 1000), timezone);

  const sorted = sortTasksByDueDate(tasks);
  const sections: string[] = [];
  let empty: boolean;

  if (kind === "morning") {
    const late = sorted.filter((task) => getDueAt(task) < now);
    const today = sorted.filter((task) => getDueAt(task) >= now && getDueAt(task) < endOfToday);
    const later = sorted.filter((task) => getDueAt(task) >= endOfToday).slice(0, morningSuggestions);
    if (late.length) {
      sections.push(["In ritardo", ...late.map((t) => `• ${t.name} · da ${formatShortDuration(now.getTime() - getDueAt(t).getTime())}${who(t)}`)].join("\n"));
    }
    if (today.length) {
      sections.push(["Oggi", ...today.map((t) => `• ${t.name} · entro le ${clock(getDueAt(t), timezone)}${who(t)}`)].join("\n"));
    }
    empty = sections.length === 0;
    if (empty) {
      sections.push("Oggi niente in scadenza 🎉");
    }
    if (later.length) {
      sections.push(
        [
          "Se vuoi fare altro oggi:",
          ...later.map((t) => {
            const due = getDueAt(t);
            const when = due < endOfTomorrow ? `domani entro le ${clock(due, timezone)}` : `entro ${dayLabel(due, timezone)}`;
            return `• ${t.name} · ${when}${who(t)}`;
          }),
        ].join("\n"),
      );
    }
  } else {
    const tomorrow = sorted.filter((task) => getDueAt(task) >= endOfToday && getDueAt(task) < endOfTomorrow);
    empty = tomorrow.length === 0;
    sections.push(
      empty
        ? "Domani niente in scadenza 🎉"
        : ["Domani", ...tomorrow.map((t) => `• ${t.name} · entro le ${clock(getDueAt(t), timezone)}${who(t)}`)].join("\n"),
    );
  }

  const intro = settings.intro?.trim() || defaultDigestIntro[kind];
  return { text: `${intro}\n\n${sections.join("\n\n")}`, empty };
}

/** Testo del promemoria per una casa, come uscirebbe adesso (usato anche per l'anteprima nel portale). */
export async function composeDigest(
  store: HouseStore,
  house: Pick<House, "id">,
  kind: DigestKind,
  settings: Pick<DigestSettings, "intro">,
  now: Date,
  timezone: string,
): Promise<DigestMessage> {
  // Le attivita' di chi e' fuori casa sono in pausa: non compaiono nei promemoria.
  const [tasks, away] = await Promise.all([store.listTasks(house.id), store.awayUserIds(house.id)]);
  return buildDigest(kind, settings, tasks.filter((task) => task.assigneeId === null || !away.has(task.assigneeId)), now, timezone);
}

// ---- Invio pianificato ----

/**
 * Da chiamare ogni minuto: per ogni casa invia buongiorno/serale una volta al giorno, all'orario impostato.
 * Se il bot e' rimasto fermo oltre un'ora dopo l'orario, il promemoria di quel giorno viene saltato.
 */
export async function runDigests(store: HouseStore, send: SendToChat, now: Date, timezone: string): Promise<number> {
  const { date, minutes } = localParts(now, timezone);
  let sent = 0;

  for (const house of await store.listHouses()) {
    const digests = await store.getDigests(house.id);
    for (const settings of Object.values(digests)) {
      if (!settings.enabled || settings.lastSentDate === date) {
        continue;
      }

      const lateBy = (minutes - timeToMinutes(settings.time)) * 60_000;
      if (lateBy < 0) {
        continue;
      }
      if (lateBy > lateGraceMs) {
        await store.markDigestHandled(house.id, settings.kind, date);
        continue;
      }

      const message = await composeDigest(store, house, settings.kind, settings, now, timezone);
      if (message.empty && settings.skipIfEmpty) {
        await store.markDigestHandled(house.id, settings.kind, date);
        continue;
      }

      if (await safeSend(send, house.chatId, message.text)) {
        await store.markDigestHandled(house.id, settings.kind, date);
        sent += 1;
      }
    }
  }

  return sent;
}
