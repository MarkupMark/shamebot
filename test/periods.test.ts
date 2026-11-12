import { describe, expect, it } from "vitest";
import { dueAfterCompletion, firstDueAt, isTooEarly, periodAround, windowStart } from "../src/services/periods.js";
import { day } from "./helpers.js";

const tz = "Europe/Rome";
const week = 7 * day;
const month = 30 * day;
/** Ora italiana (novembre = UTC+1). */
const rome = (local: string) => new Date(`${local}+01:00`);
const iso = (d: Date) => d.toISOString();

describe("periodi fissi", () => {
  it("settimana: da lunedi' a domenica nel fuso della casa", () => {
    const p = periodAround(rome("2026-11-12T10:00:00"), week, tz); // giovedi'
    expect(iso(p.start)).toBe(iso(rome("2026-11-09T00:00:00")));
    expect(iso(p.end)).toBe(iso(rome("2026-11-16T00:00:00")));
  });

  it("giorno e mese di calendario", () => {
    expect(iso(periodAround(rome("2026-11-12T23:30:00"), day, tz).end)).toBe(iso(rome("2026-11-13T00:00:00")));
    const m = periodAround(rome("2026-11-12T10:00:00"), month, tz);
    expect(iso(m.start)).toBe(iso(rome("2026-11-01T00:00:00")));
    expect(iso(m.end)).toBe(iso(rome("2026-12-01T00:00:00")));
  });

  it("2 volte a settimana: lun-mer e gio-dom", () => {
    const half = Math.round(week / 2);
    const first = periodAround(rome("2026-11-10T10:00:00"), half, tz);
    expect(iso(first.start)).toBe(iso(rome("2026-11-09T00:00:00")));
    expect(iso(first.end)).toBe(iso(rome("2026-11-12T00:00:00")));
    const second = periodAround(rome("2026-11-14T10:00:00"), half, tz);
    expect(iso(second.start)).toBe(iso(rome("2026-11-12T00:00:00")));
    expect(iso(second.end)).toBe(iso(rome("2026-11-16T00:00:00")));
  });

  it("ogni 2 settimane: blocchi fissi, non dipendono da quando si fa", () => {
    const a = periodAround(rome("2026-11-10T10:00:00"), 2 * week, tz);
    expect(a.end.getTime() - a.start.getTime()).toBe(2 * week);
    expect(new Date(a.start.getTime() + 2 * 60 * 60 * 1000).getUTCDay()).toBe(1); // lunedi'
    expect(iso(periodAround(new Date(a.start.getTime() + 10 * day), 2 * week, tz).start)).toBe(iso(a.start));
  });

  it("cambio dell'ora legale: la settimana finisce comunque a mezzanotte di domenica", () => {
    const p = periodAround(new Date("2026-10-22T10:00:00Z"), week, tz);
    expect(iso(p.end)).toBe("2026-10-25T23:00:00.000Z"); // lun 26 ottobre 00:00 ora solare
  });

  it("Fatto in tempo: la prossima scade a fine della settimana dopo, anche se fatta lunedi'", () => {
    const due = rome("2026-11-16T00:00:00");
    expect(iso(dueAfterCompletion(due, rome("2026-11-09T08:00:00"), week, tz))).toBe(iso(rome("2026-11-23T00:00:00")));
    expect(iso(dueAfterCompletion(due, rome("2026-11-15T23:00:00"), week, tz))).toBe(iso(rome("2026-11-23T00:00:00")));
  });

  it("Fatto in ritardo: la settimana persa e' persa, quella in corso va fatta comunque", () => {
    const due = rome("2026-11-16T00:00:00");
    expect(iso(dueAfterCompletion(due, rome("2026-11-17T10:00:00"), week, tz))).toBe(iso(rome("2026-11-23T00:00:00")));
  });

  it("in anticipo non si chiude la finestra dopo", () => {
    const half = Math.round(week / 2);
    const due = rome("2026-11-16T00:00:00"); // gio-dom, gia' fatta lun-mer
    expect(iso(windowStart(due, half, tz))).toBe(iso(rome("2026-11-12T00:00:00")));
    expect(isTooEarly(due, rome("2026-11-10T10:00:00"), half, tz)).toBe(true);
    expect(isTooEarly(due, rome("2026-11-12T10:00:00"), half, tz)).toBe(false);
  });

  it("attivita' nuova: periodo in corso, o il successivo se ne resta meno di un terzo", () => {
    expect(iso(firstDueAt(rome("2026-11-10T10:00:00"), week, tz))).toBe(iso(rome("2026-11-16T00:00:00")));
    expect(iso(firstDueAt(rome("2026-11-15T20:00:00"), week, tz))).toBe(iso(rome("2026-11-23T00:00:00")));
  });

  it("scadenze di prima dei periodi fissi: la finestra e' il vecchio ciclo", () => {
    const due = rome("2026-11-19T15:42:00");
    expect(iso(windowStart(due, week, tz))).toBe(iso(rome("2026-11-12T15:42:00")));
    expect(isTooEarly(due, rome("2026-11-14T10:00:00"), week, tz)).toBe(false);
  });
});
