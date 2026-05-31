import { describe, expect, it } from "vitest";

import { getVisibleStatementMonths, type StatementMonthLike } from "./accountDetailMonths";

describe("getVisibleStatementMonths", () => {
  it("keeps only months with rows that are not later than the current month", () => {
    const months: StatementMonthLike[] = [
      { month: "2026-07", count: 3 },
      { month: "2026-06", count: 0 },
      { month: "2026-05", count: 2 },
      { month: "2025-12", count: 1 }
    ];

    expect(getVisibleStatementMonths(months, "2026-06")).toEqual([
      { month: "2026-05", count: 2 },
      { month: "2025-12", count: 1 }
    ]);
  });
});
