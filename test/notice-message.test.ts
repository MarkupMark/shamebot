import { describe, expect, it } from "vitest";
import { noticeMessage } from "../src/services/notify.js";
import type { Task } from "../src/types/domain.js";
import { day } from "./helpers.js";

const now = new Date("2026-11-12T10:00:00.000Z");
const task = (extra: Partial<Task>) =>
  ({
    name: "Robottino",
    intervalMs: day,
    cycleAnchorAt: new Date(now.getTime() - 3 * day).toISOString(),
    slotDueAt: null,
    assigneeName: null,
    lastCompletedByName: null,
    ...extra,
  }) as Task;

describe("noticeMessage", () => {
  it("dice chiaramente chi e' in ritardo", () => {
    const t = task({ assigneeName: "Giacomo" });
    expect(noticeMessage(t, "overdue", now)).toBe("😬 Robottino · scaduta · doveva farla Giacomo");
    expect(noticeMessage(t, "nudge", now)).toBe("🚨 Robottino · Giacomo è in ritardo di 2g");
  });

  it("senza assegnatario mostra chi l'ha fatta l'ultima volta", () => {
    const t = task({ lastCompletedByName: "Luca" });
    expect(noticeMessage(t, "overdue", now)).toBe("😬 Robottino · scaduta · ultima: Luca");
    expect(noticeMessage(t, "nudge", now)).toBe("🚨 Robottino · ritardo 2g · ultima: Luca");
  });
});
