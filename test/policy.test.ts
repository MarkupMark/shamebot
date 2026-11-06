import { describe, expect, it } from "vitest";
import { buildNoticeStages, getDueAt, getDueNotice } from "../src/services/policy.js";
import { day, hour } from "./helpers.js";

const anchor = new Date("2026-01-01T00:00:00.000Z");
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
    expect(getDueAt(base).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("pianifica promemoria, scaduta e sollecito in base alla gravita'", () => {
    expect(buildNoticeStages({ ...base, severity: "low" }).map((s) => s.key)).toEqual(["three_hours", "thirty_minutes", "overdue"]);
    const medium = buildNoticeStages(base);
    expect(medium.map((s) => s.key)).toEqual(["three_hours", "thirty_minutes", "overdue", "nudge"]);
    expect(medium[3]?.at.getTime()).toBe(getDueAt(base).getTime() + 2 * day);
    const high = buildNoticeStages({ ...base, severity: "high" });
    expect(high[3]?.at.getTime()).toBe(getDueAt(base).getTime() + day);
  });

  it("salta i promemoria impossibili su intervalli molto corti", () => {
    const stages = buildNoticeStages({ ...base, intervalMs: hour });
    expect(stages.map((s) => s.key)).toEqual(["thirty_minutes", "overdue", "nudge"]);
  });

  it("non invia nulla prima della prima soglia", () => {
    expect(getDueNotice(base, new Date("2026-01-03T00:00:00.000Z"))).toBeNull();
  });

  it("invia il promemoria delle 3 ore e poi quello dei 30 minuti", () => {
    const first = getDueNotice(base, new Date("2026-01-07T21:30:00.000Z"));
    expect(first?.send.key).toBe("three_hours");
    const second = getDueNotice({ ...base, reminderThreeHoursSentAt: "x" }, new Date("2026-01-07T23:40:00.000Z"));
    expect(second?.send.key).toBe("thirty_minutes");
  });

  it("dopo un lungo stop manda solo l'ultima fase e segna tutte come gestite", () => {
    const notice = getDueNotice(base, new Date("2026-03-01T00:00:00.000Z"));
    expect(notice?.send.key).toBe("nudge");
    expect(notice?.markAsHandled).toEqual(["three_hours", "thirty_minutes", "overdue", "nudge"]);
  });

  it("non rinvia fasi gia' inviate", () => {
    const sent = { ...base, reminderThreeHoursSentAt: "x", reminderThirtyMinutesSentAt: "x", overdueNoticeSentAt: "x", nudgeSentAt: "x" };
    expect(getDueNotice(sent, new Date("2026-03-01T00:00:00.000Z"))).toBeNull();
  });
});
