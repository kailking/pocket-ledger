import { describe, expect, it } from "vitest";

import { resolveCategoryDateRange } from "./reportDateRange";

describe("resolveCategoryDateRange", () => {
  it("defaults category reports to the current local month", () => {
    expect(resolveCategoryDateRange({}, "2026-06-02")).toEqual({
      from: "2026-06-01",
      to: "2026-06-30"
    });
  });

  it("expands legacy current-month ranges that stopped at yesterday", () => {
    expect(resolveCategoryDateRange({ from: "2026-06-01", to: "2026-06-01" }, "2026-06-02")).toEqual({
      from: "2026-06-01",
      to: "2026-06-30"
    });
  });

  it("keeps historical month selections unchanged", () => {
    expect(resolveCategoryDateRange({ from: "2026-05-01", to: "2026-05-31" }, "2026-06-02")).toEqual({
      from: "2026-05-01",
      to: "2026-05-31"
    });
  });

  it("keeps explicit custom ranges unchanged", () => {
    expect(resolveCategoryDateRange({ from: "2026-06-01", to: "2026-06-01", mode: "custom" }, "2026-06-02")).toEqual({
      from: "2026-06-01",
      to: "2026-06-01"
    });
  });
});
