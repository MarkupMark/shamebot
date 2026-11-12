/**
 * Periodi fissi a calendario. Una scadenza non riparte da quando l'attivita' viene fatta: ogni frequenza
 * corrisponde a finestre fisse nel fuso della casa e la scadenza e' la fine della finestra.
 *
 * - ogni giorno / ogni N giorni: giornate (blocchi di N giorni fissi)
 * - ogni settimana / ogni N settimane: lunedi'-domenica (blocchi di N settimane fissi)
 * - ogni mese (30 giorni) / ogni N mesi: mese di calendario
 * - N volte a settimana: la settimana divisa in N parti (2 = lun-mer e gio-dom, 3 = lun-mar, mer-gio, ven-dom)
 * - 2 o 3 volte al mese (15 o 10 giorni): il mese diviso in 2 o 3 parti
 * - sotto il giorno (ore): finestre dalla mezzanotte locale
 */
import { localMidnight, localParts } from "../utils/timezone.js";

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const weekMs = 7 * dayMs;
const monthMs = 30 * dayMs;

/** 1970-01-05 era un lunedi': i blocchi di piu' settimane partono da li'. */
const mondayZero = 4;

export type Period = { start: Date; end: Date };

/** Numero del giorno locale (giorni dal 1970-01-01 nel fuso della casa). */
function localDay(at: Date, timezone: string): number {
  const [y, m, d] = localParts(at, timezone).date.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / dayMs);
}

/** Mezzanotte locale del giorno numero `day`. */
function dayStart(day: number, timezone: string): Date {
  return localMidnight(new Date(day * dayMs + 12 * hourMs), timezone);
}

function monthStart(monthIndex: number, timezone: string): Date {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  return dayStart(Math.round(Date.UTC(year, month, 1) / dayMs), timezone);
}

/** Quante volte in `total` sta `intervalMs`, se e' (quasi) un numero intero; altrimenti null. */
function timesIn(total: number, intervalMs: number): number | null {
  const times = Math.round(total / intervalMs);
  return times >= 2 && Math.abs(times * intervalMs - total) <= times * minuteMs ? times : null;
}

/** La finestra della frequenza `intervalMs` che contiene l'istante `at`. */
export function periodAround(at: Date, intervalMs: number, timezone: string): Period {
  const day = localDay(at, timezone);

  if (intervalMs < dayMs) {
    if (dayMs % intervalMs === 0) {
      const midnight = localMidnight(at, timezone).getTime();
      const start = midnight + Math.floor((at.getTime() - midnight) / intervalMs) * intervalMs;
      return { start: new Date(start), end: new Date(start + intervalMs) };
    }
    const start = Math.floor(at.getTime() / intervalMs) * intervalMs;
    return { start: new Date(start), end: new Date(start + intervalMs) };
  }

  if (intervalMs % dayMs === 0) {
    const days = intervalMs / dayMs;
    if (days % 30 === 0) {
      const months = days / 30;
      const [y, m] = localParts(at, timezone).date.split("-").map(Number);
      const first = Math.floor((y! * 12 + m! - 1) / months) * months;
      return { start: monthStart(first, timezone), end: monthStart(first + months, timezone) };
    }
    if (days % 7 === 0) {
      const weeks = days / 7;
      const monday = day - ((day + 3) % 7);
      const block = Math.floor((monday - mondayZero) / (7 * weeks));
      const first = mondayZero + block * 7 * weeks;
      return { start: dayStart(first, timezone), end: dayStart(first + 7 * weeks, timezone) };
    }
    const times = timesIn(monthMs, intervalMs);
    if (times !== null && days >= 10) {
      return splitMonth(at, times, timezone);
    }
    const first = Math.floor(day / days) * days;
    return { start: dayStart(first, timezone), end: dayStart(first + days, timezone) };
  }

  const perWeek = timesIn(weekMs, intervalMs);
  if (perWeek !== null && perWeek < 7) {
    const monday = day - ((day + 3) % 7);
    const weekday = day - monday;
    const cuts = Array.from({ length: perWeek + 1 }, (_, i) => Math.floor((i * 7) / perWeek));
    const part = cuts.findIndex((cut, i) => weekday >= cut && weekday < cuts[i + 1]!);
    return { start: dayStart(monday + cuts[part]!, timezone), end: dayStart(monday + cuts[part + 1]!, timezone) };
  }

  const perMonth = timesIn(monthMs, intervalMs);
  if (perMonth !== null && perMonth <= 3) {
    return splitMonth(at, perMonth, timezone);
  }

  const start = Math.floor(at.getTime() / intervalMs) * intervalMs;
  return { start: new Date(start), end: new Date(start + intervalMs) };
}

function splitMonth(at: Date, parts: number, timezone: string): Period {
  const [y, m, d] = localParts(at, timezone).date.split("-").map(Number);
  const first = Math.round(Date.UTC(y!, m! - 1, 1) / dayMs);
  const length = Math.round(Date.UTC(y!, m!, 1) / dayMs) - first;
  const cuts = Array.from({ length: parts + 1 }, (_, i) => Math.floor((i * length) / parts));
  const offset = d! - 1;
  const part = cuts.findIndex((cut, i) => offset >= cut && offset < cuts[i + 1]!);
  return { start: dayStart(first + cuts[part]!, timezone), end: dayStart(first + cuts[part + 1]!, timezone) };
}

/** La finestra che viene subito dopo `period`. */
export function nextPeriod(period: Period, intervalMs: number, timezone: string): Period {
  return periodAround(period.end, intervalMs, timezone);
}

/**
 * Scadenza di un'attivita' nuova (o a cui e' appena cambiata la frequenza): la fine della finestra in corso,
 * oppure di quella dopo se della finestra in corso resta meno di un terzo (domenica sera non si crea
 * un'attivita' settimanale che scade a mezzanotte).
 */
export function firstDueAt(now: Date, intervalMs: number, timezone: string): Date {
  const current = periodAround(now, intervalMs, timezone);
  const length = current.end.getTime() - current.start.getTime();
  const left = current.end.getTime() - now.getTime();
  return left * 3 < length ? nextPeriod(current, intervalMs, timezone).end : current.end;
}

/**
 * Nuova scadenza dopo un "Fatto" alle `now`. `dueAt` e' la scadenza attuale.
 * - In ritardo: la finestra mancata e' persa, si deve fare entro la fine della finestra in corso.
 * - In tempo: si chiude la finestra in corso, la prossima scade alla fine della finestra successiva.
 * - In anticipo (la finestra della scadenza non e' ancora iniziata): non cambia niente, restituisce `dueAt`.
 */
export function dueAfterCompletion(dueAt: Date, now: Date, intervalMs: number, timezone: string): Date {
  const current = periodAround(now, intervalMs, timezone);
  if (now.getTime() >= dueAt.getTime()) {
    return current.end;
  }
  const following = nextPeriod(current, intervalMs, timezone).end;
  return following.getTime() > dueAt.getTime() ? following : dueAt;
}

/**
 * Inizio della finestra che finisce a `dueAt` (per la barra di avanzamento e per sapere se si puo' gia' fare).
 * Se la scadenza non cade a fine finestra (attivita' di prima dei periodi fissi, o spostata a mano) vale
 * il vecchio ciclo: scadenza meno la frequenza.
 */
export function windowStart(dueAt: Date, intervalMs: number, timezone: string): Date {
  const period = periodAround(new Date(dueAt.getTime() - 1), intervalMs, timezone);
  if (period.end.getTime() === dueAt.getTime()) {
    return period.start;
  }
  return new Date(dueAt.getTime() - intervalMs);
}

/** true se l'attivita' e' gia' stata fatta per questo periodo e la prossima finestra non e' ancora aperta. */
export function isTooEarly(dueAt: Date, now: Date, intervalMs: number, timezone: string): boolean {
  return now.getTime() < windowStart(dueAt, intervalMs, timezone).getTime();
}
