import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { CategoryIcon } from "../components/CategoryIcon";
import { apiGet } from "../lib/api";
import { absoluteMoney, formatMoney } from "../lib/format";
import type { LedgerTransaction } from "../lib/ledgerStore";

type BudgetInfo = {
  month: string;
  enabled: boolean;
  totalAmount: string;
  usedAmount: string;
  remainingAmount: string;
  displayMode: "remaining" | "used";
};

type CalendarDay = {
  date: string;
  day: number;
  income: number;
  expense: number;
  transactions: LedgerTransaction[];
};

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

function isMonth(value: string | null): value is string {
  return Boolean(value?.match(/^\d{4}-\d{2}$/));
}

function isDate(value: string | null): value is string {
  return Boolean(value?.match(/^\d{4}-\d{2}-\d{2}$/));
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).toISOString().slice(0, 10);
}

function daysInMonth(month: string) {
  return Number(monthEnd(month).slice(8, 10));
}

function firstWeekdayOffset(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const weekday = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function monthLabel(month: string) {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1 + delta, 1));
  return next.toISOString().slice(0, 7);
}

function displayAmount(item: LedgerTransaction) {
  if (item.type === "transfer") return absoluteMoney(item.displayAmount ?? item.transferAmount ?? item.amount);
  return `${item.type === "expense" ? "-" : item.type === "income" ? "+" : ""}${absoluteMoney(item.displayAmount ?? item.amount)}`;
}

export function LedgerCalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get("month");
  const dateParam = searchParams.get("date");
  const month = isMonth(monthParam) ? monthParam : currentMonth();
  const firstDate = `${month}-01`;
  const selectedDate = isDate(dateParam) && dateParam.startsWith(month)
    ? dateParam
    : month === currentMonth()
      ? today()
      : firstDate;
  const endDate = monthEnd(month);
  const { data: transactions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions", "calendar", month],
    queryFn: () => apiGet<LedgerTransaction[]>(`/api/transactions?startDate=${firstDate}&endDate=${endDate}&limit=500`)
  });
  const { data: budget } = useQuery({
    queryKey: ["budget", month],
    queryFn: () => apiGet<BudgetInfo>(`/api/budgets/current?month=${month}`)
  });

  const dailyBudget = budget?.enabled && Number(budget.totalAmount) > 0 ? Number(budget.totalAmount) / daysInMonth(month) : 0;
  const days = useMemo(() => {
    const groups = new Map<string, LedgerTransaction[]>();
    transactions.forEach((item) => {
      groups.set(item.happenedOn, [...(groups.get(item.happenedOn) ?? []), item]);
    });

    return Array.from({ length: daysInMonth(month) }, (_, index): CalendarDay => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const items = groups.get(date) ?? [];
      const income = items.reduce((sum, item) => (item.type === "income" ? sum + Number(item.amount) : sum), 0);
      const expense = items.reduce((sum, item) => (item.type === "expense" ? sum + Math.abs(Number(item.amount)) : sum), 0);
      return {
        date,
        day,
        income,
        expense,
        transactions: items
      };
    });
  }, [month, transactions]);

  const selected = days.find((day) => day.date === selectedDate) ?? days[0];
  const leading = Array.from({ length: firstWeekdayOffset(month) }, (_, index) => index);

  function setMonth(nextMonth: string) {
    setSearchParams(new URLSearchParams({ month: nextMonth, date: `${nextMonth}-01` }));
  }

  function selectDate(date: string) {
    setSearchParams(new URLSearchParams({ month, date }));
  }

  return (
    <section className="ledger-calendar-page">
      <header className="calendar-topbar">
        <button className="calendar-topbar__back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
          返回
        </button>
        <div className="calendar-topbar__title">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>
            {monthLabel(month)}
            <ChevronDown aria-hidden="true" />
          </strong>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <button className="calendar-topbar__add" type="button" aria-label="新增账单" onClick={() => navigate(`/entry?date=${selected?.date ?? firstDate}`)}>
          <Plus aria-hidden="true" />
        </button>
      </header>

      <div className="calendar-weekdays">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      {isLoading ? <p className="empty-state">正在读取月历...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>月历读取失败。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      <div className="calendar-grid">
        {leading.map((item) => (
          <span className="calendar-day calendar-day--blank" key={`blank-${item}`} />
        ))}
        {days.map((day) => {
          const hasBudgetState = dailyBudget > 0 && day.expense > 0;
          const overBudget = hasBudgetState && day.expense > dailyBudget;
          const underBudget = hasBudgetState && day.expense <= dailyBudget;
          return (
            <button
              className={[
                "calendar-day",
                day.date === selected?.date ? "calendar-day--selected" : "",
                overBudget ? "calendar-day--over-budget" : "",
                underBudget ? "calendar-day--under-budget" : ""
              ].filter(Boolean).join(" ")}
              key={day.date}
              type="button"
              onClick={() => selectDate(day.date)}
            >
              <span className="calendar-day__number">{day.day}</span>
              <span className="calendar-day__income">{day.income > 0 ? `+${formatMoney(day.income)}` : "0"}</span>
              <span className="calendar-day__expense">{day.expense > 0 ? `-${formatMoney(day.expense)}` : "0"}</span>
            </button>
          );
        })}
      </div>

      <section className="calendar-detail">
        <div className="calendar-detail__summary">
          <strong>{selected ? `${Number(selected.date.slice(5, 7))}月${Number(selected.date.slice(8, 10))}日` : ""}</strong>
          <span><i /> 超出日预算</span>
          <span><i /> 未超出日预算</span>
        </div>
        {selected && selected.transactions.length === 0 ? <p className="calendar-detail__empty">这一天没有账单</p> : null}
        <div className="calendar-detail__list">
          {selected?.transactions.map((item) => (
            <Link className="calendar-entry-row" key={item.id} to={`/transactions/${item.id}`}>
              <CategoryIcon color={item.color} icon={item.icon} label={item.category} size="sm" />
              <div>
                <strong>{item.category}</strong>
                <span>{item.note || item.account}</span>
              </div>
              <b className={item.type === "income" ? "money-income" : item.type === "transfer" ? "money-transfer" : ""}>
                {displayAmount(item)}
              </b>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
