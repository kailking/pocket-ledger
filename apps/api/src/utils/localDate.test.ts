import { describe, expect, it } from "vitest";

import { localDateKey, localMonthEnd, localMonthKey } from "./localDate.js";

describe("server local date helpers", () => {
  it("formats APP_TIME_ZONE calendar dates instead of UTC dates", () => {
    const date = new Date("2026-06-01T22:40:00.000Z");

    expect(localDateKey(date, "Asia/Shanghai")).toBe("2026-06-02");
    expect(localMonthKey(date, "Asia/Shanghai")).toBe("2026-06");
  });

  it("calculates month ends without relying on process timezone", () => {
    expect(localMonthEnd("2026-02")).toBe("2026-02-28");
    expect(localMonthEnd("2024-02")).toBe("2024-02-29");
  });
});
