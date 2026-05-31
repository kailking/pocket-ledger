export type StatementMonthLike = {
  month: string;
  count: number;
};

export function getVisibleStatementMonths<T extends StatementMonthLike>(months: T[], currentMonth: string): T[] {
  return months.filter((month) => month.count > 0 && month.month <= currentMonth);
}
