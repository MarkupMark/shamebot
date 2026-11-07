import { describe, expect, it } from "vitest";
import { formatFrequency, formatFrequencyShort, formatShortDuration, parseDurationInput } from "../src/utils/duration.js";
import { day } from "./helpers.js";

describe("duration", () => {
  it("accetta durate classiche", () => {
    expect(parseDurationInput("3 giorni")).toBe(3 * day);
    expect(parseDurationInput("1 settimana")).toBe(7 * day);
    expect(parseDurationInput("2h")).toBe(2 * 3_600_000);
  });

  it("accetta frequenze 'N volte a ...'", () => {
    expect(parseDurationInput("1 volta a settimana")).toBe(7 * day);
    expect(parseDurationInput("2 volte a settimana")).toBe(3.5 * day);
    expect(parseDurationInput("2 volte alla settimana")).toBe(3.5 * day);
    expect(parseDurationInput("3 volte a settimana")).toBe(Math.round((7 * day) / 3));
    expect(parseDurationInput("0 volte a settimana")).toBeNull();
  });

  it("descrive la frequenza", () => {
    expect(formatFrequency(7 * day)).toBe("1 volta a settimana");
    expect(formatFrequency(3.5 * day)).toBe("2 volte a settimana");
    expect(formatFrequency(Math.round((7 * day) / 3))).toBe("3 volte a settimana");
    expect(formatFrequency(14 * day)).toBe("ogni 2 settimane");
    expect(formatFrequency(4 * day)).toBe("ogni 4 giorni");
  });

  it("formatta durate e frequenze in modo compatto", () => {
    expect(formatShortDuration(7 * day)).toBe("7g");
    expect(formatShortDuration(day + 3_600_000)).toBe("1g 1h");
    expect(formatShortDuration(5 * 3_600_000)).toBe("5h");
    expect(formatShortDuration(30 * 60_000)).toBe("30m");
    expect(formatFrequencyShort(7 * day)).toBe("1×/sett");
    expect(formatFrequencyShort(3.5 * day)).toBe("2×/sett");
    expect(formatFrequencyShort(14 * day)).toBe("ogni 2 sett");
    expect(formatFrequencyShort(4 * day)).toBe("ogni 4g");
    expect(formatFrequencyShort(day)).toBe("ogni giorno");
  });
});
