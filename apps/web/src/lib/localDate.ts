const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthKeyPattern = /^\d{4}-\d{2}$/;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function localMonthStart(dateKey = localDateKey()) {
  return `${dateKey.slice(0, 8)}01`;
}

export function localMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(year ?? 1970, monthNumber ?? 1, 0).getDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDaysKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function shiftMonthKey(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (monthNumber ?? 1) - 1 + delta, 1);
  return localMonthKey(date);
}

export function isDateKey(value: string | null): value is string {
  return Boolean(value?.match(dateKeyPattern));
}

export function isMonthKey(value: string | null): value is string {
  return Boolean(value?.match(monthKeyPattern));
}
