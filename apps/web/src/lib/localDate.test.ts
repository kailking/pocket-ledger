import { describe, expect, it } from "vitest";

import { addDaysKey, localDateKey, localMonthEnd, localMonthKey } from "./localDate";

describe("local date helpers", () => {
  it("formats the browser local calendar day instead of the UTC day", () => {
    expect(localDateKey(new Date(2026, 5, 2, 6, 30))).toBe("2026-06-02");
  });

  it("derives local month keys and month ends without UTC rollover", () => {
    expect(localMonthKey(new Date(2026, 5, 2, 6, 30))).toBe("2026-06");
    expect(localMonthEnd("2026-06")).toBe("2026-06-30");
  });

  it("adds days using local date arithmetic", () => {
    expect(addDaysKey("2026-06-01", 1)).toBe("2026-06-02");
  });
});
