import { localMonthEnd, localMonthStart } from "../lib/localDate";

export type ReportRangeMode = "custom" | "week" | "month" | "year" | null;

type RangeInput = {
  from?: string | null;
  to?: string | null;
  mode?: ReportRangeMode;
};

export function resolveCategoryDateRange(input: RangeInput, todayKey: string) {
  const currentMonthStart = localMonthStart(todayKey);
  const currentMonthEnd = localMonthEnd(todayKey.slice(0, 7));
  const from = input.from ?? currentMonthStart;
  const to = input.to ?? currentMonthEnd;

  if (input.mode === "custom") {
    return { from, to };
  }

  const looksLikeLegacyCurrentMonth = from === currentMonthStart && to >= currentMonthStart && to < currentMonthEnd;
  if (!input.from || !input.to || looksLikeLegacyCurrentMonth) {
    return {
      from: currentMonthStart,
      to: currentMonthEnd
    };
  }

  return { from, to };
}
