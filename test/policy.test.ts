import { describe, expect, it } from "vitest";
import { buildNoticeStages, getDueAt, getDueNotice } from "../src/services/policy.js";
import { day, hour } from "./helpers.js";

// Settimanale che scade a mezzanotte (ora italiana) tra mercoledi' 7 e giovedi' 8 gennaio.
const anchor = new Date("2025-12-31T23:00:00.000Z");
const base = {
  intervalMs: 7 * day,
  cycleAnchorAt: anchor.toISOString(),
  severity: "medium" as const,
  reminderThreeHoursSentAt: null,
  reminderThirtyMinutesSentAt: null,
  overdueNoticeSentAt: null,
  nudgeSentAt: null,
};

describe("policy", () => {
  it("calcola la scadenza dall'ancora del ciclo", () => {
    expect(getDueAt(base).toISOString()).toBe("2026-01-07T23:00:00.000Z");
  });

  it("periodi di giorni: promemoria alle 9 dell'ultimo giorno, scaduta e sollecito alle 9 (mai di notte)", () => {
    expect(buildNoticeStages({ ...base, severity: "low" }).map((s) => s.key)).toEqual(["three_hours", "overdue"]);
    const medium = buildNoticeStages(base);
    expect(medium.map((s) => [s.key, s.at.toISOString()])).toEqual([
      ["three_hours", "2026-01-07T08:00:00.000Z"],
      ["overdue", "2026-01-08T08:00:00.000Z"],
      ["nudge", "2026-01-10T08:00:00.000Z"],
    ]);
    const high = buildNoticeStages({ ...base, severity: "high" });
    expect(high[2]?.at.toISOString()).toBe("2026-01-09T08:00:00.000Z");
  });

  it("sotto il giorno restano i promemoria a 3h e 30m", () => {
    expect(buildNoticeStages({ ...base, intervalMs: 12 * hour }).map((s) => s.key)).toEqual(["three_hours", "thirty_minutes", "overdue", "nudge"]);
    expect(buildNoticeStages({ ...base, intervalMs: hour }).map((s) => s.key)).toEqual(["thirty_minutes", "overdue", "nudge"]);
  });

  it("non invia nulla prima della prima soglia", () => {
    expect(getDueNotice(base, new Date("2026-01-03T00:00:00.000Z"))).toBeNull();
  });

  it("promemoria l'ultimo giorno, poi niente di notte fino alla scaduta delle 9", () => {
    expect(getDueNotice(base, new Date("2026-01-07T10:00:00.000Z"))?.send.key).toBe("three_hours");
    const sent = { ...base, reminderThreeHoursSentAt: "x" };
    expect(getDueNotice(sent, new Date("2026-01-08T05:00:00.000Z"))).toBeNull();
    expect(getDueNotice(sent, new Date("2026-01-08T08:00:00.000Z"))?.send.key).toBe("overdue");
  });

  it("dopo un lungo stop manda solo l'ultima fase e segna tutte come gestite", () => {
    const notice = getDueNotice(base, new Date("2026-03-01T00:00:00.000Z"));
    expect(notice?.send.key).toBe("nudge");
    expect(notice?.markAsHandled).toEqual(["three_hours", "overdue", "nudge"]);
  });

  it("non rinvia fasi gia' inviate", () => {
    const sent = { ...base, reminderThreeHoursSentAt: "x", reminderThirtyMinutesSentAt: "x", overdueNoticeSentAt: "x", nudgeSentAt: "x" };
    expect(getDueNotice(sent, new Date("2026-03-01T00:00:00.000Z"))).toBeNull();
  });
});
