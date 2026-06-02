import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { localDateKey, parseDateKey, shiftMonthKey } from "../lib/localDate";

interface EntryDatePickerProps {
  value: string;
  todayKey: string;
  onSelect: (dateKey: string) => void;
}

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

function monthLabel(month: string) {
  return `${month.slice(0, 4)}年${month.slice(5, 7)}月`;
}

function monthGrid(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = localDateKey(date);
    return {
      dateKey,
      day: date.getDate(),
      inMonth: dateKey.startsWith(month)
    };
  });
}

function shiftYear(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date((year ?? 1970) + delta, (monthNumber ?? 1) - 1, 1);
  return localDateKey(next).slice(0, 7);
}

export function EntryDatePicker({ value, todayKey, onSelect }: EntryDatePickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => value.slice(0, 7));
  const days = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);

  useEffect(() => {
    setVisibleMonth(value.slice(0, 7));
  }, [value]);

  return (
    <div className="entry-date-picker">
      <div className="entry-date-picker__weekdays">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="entry-date-picker__grid" aria-label={monthLabel(visibleMonth)}>
        {days.map((day) => {
          const isSelected = day.dateKey === value;
          const isToday = day.dateKey === todayKey;
          return (
            <button
              className={[
                "entry-date-picker__day",
                day.inMonth ? "" : "is-outside",
                isSelected ? "is-selected" : "",
                isToday && !isSelected ? "is-today" : ""
              ].filter(Boolean).join(" ")}
              key={day.dateKey}
              type="button"
              onClick={() => onSelect(day.dateKey)}
            >
              {day.day}
            </button>
          );
        })}
      </div>

      <div className="entry-date-picker__controls">
        <div className="entry-date-picker__stepper">
          <button type="button" aria-label="上一年" onClick={() => setVisibleMonth((month) => shiftYear(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{parseDateKey(`${visibleMonth}-01`).getFullYear()}</strong>
          <button type="button" aria-label="下一年" onClick={() => setVisibleMonth((month) => shiftYear(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="entry-date-picker__stepper">
          <button type="button" aria-label="上个月" onClick={() => setVisibleMonth((month) => shiftMonthKey(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{visibleMonth.slice(5, 7)}月</strong>
          <button type="button" aria-label="下个月" onClick={() => setVisibleMonth((month) => shiftMonthKey(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
