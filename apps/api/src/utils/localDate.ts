import { env } from "../config/env.js";

export function localDateKey(date = new Date(), timeZone = env.APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year ?? "1970"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

export function localMonthKey(date = new Date(), timeZone = env.APP_TIME_ZONE) {
  return localDateKey(date, timeZone).slice(0, 7);
}

export function currentLocalYear(date = new Date(), timeZone = env.APP_TIME_ZONE) {
  return Number(localDateKey(date, timeZone).slice(0, 4));
}

export function localMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function nextLocalMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01`;
}
