import { describe, expect, it } from "vitest";
import { dayName, deadlineDay, tooEarlyMessage } from "../src/services/notify.js";

const tz = "Europe/Rome";

describe("scadenze relative: oggi, domani, dopodomani", () => {
  const now = new Date("2026-11-12T21:00:00.000Z"); // giovedi' 12, ore 22 a Roma

  it("una scadenza a mezzanotte vale per il giorno che finisce", () => {
    expect(deadlineDay(new Date("2026-11-12T23:00:00.000Z"), tz, now)).toBe("oggi"); // fine di gio 12
    expect(deadlineDay(new Date("2026-11-13T23:00:00.000Z"), tz, now)).toBe("domani");
    expect(deadlineDay(new Date("2026-11-14T23:00:00.000Z"), tz, now)).toBe("dopodomani");
    expect(deadlineDay(new Date("2026-11-15T23:00:00.000Z"), tz, now)).toBe("dom 15");
  });

  it("usa il giorno locale, non quello UTC", () => {
    // 23:30 UTC di gio 12 = 00:30 di ven 13 a Roma: e' gia' domani.
    expect(dayName(new Date("2026-11-12T23:30:00.000Z"), tz, now)).toBe("domani");
  });

  it("senza 'adesso' resta la data", () => {
    expect(deadlineDay(new Date("2026-11-13T23:00:00.000Z"), tz)).toBe("ven 13");
  });

  it("'gia' fatta' dice quando si riapre in modo relativo", () => {
    expect(tooEarlyMessage({ name: "Bagno" }, new Date("2026-11-12T23:00:00.000Z"), tz, now)).toBe(
      "👌 Bagno è già fatta per questo periodo · si riapre domani",
    );
  });
});
