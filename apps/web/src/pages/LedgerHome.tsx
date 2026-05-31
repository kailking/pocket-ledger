import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Search } from "lucide-react";
import { Link } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { apiGet, apiPut } from "../lib/api";
import { absoluteMoney, formatMoney } from "../lib/format";
import { getMonthSummary, type LedgerTransaction } from "../lib/ledgerStore";

type BudgetInfo = {
  month: string;
  enabled: boolean;
  totalAmount: string;
  usedAmount: string;
  remainingAmount: string;
  displayMode: "remaining" | "used";
};

const PAGE_SIZE = 40;
type DayGroup = {
  date: string;
  month: string;
  income: number;
  expense: number;
  transactions: LedgerTransaction[];
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getDateKey(transaction: LedgerTransaction) {
  return transaction.happenedOn.slice(0, 10);
}

function getMonthKey(date: string) {
  return date.slice(0, 7);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function formatMonthNode(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function formatDayNode(date: string) {
  const todayKey = localDateKey();
  if (date === todayKey) return { label: "今日", special: true };
  if (date === addDaysKey(todayKey, -1)) return { label: "昨日", special: true };

  const day = new Date(`${date}T00:00:00`);
  return { label: String(day.getDate()), special: false };
}

function groupTransactionsByDay(transactions: LedgerTransaction[]) {
  const groups: DayGroup[] = [];
  const groupByDate = new Map<string, DayGroup>();

  for (const transaction of transactions) {
    const date = getDateKey(transaction);
    let group = groupByDate.get(date);
    if (!group) {
      group = { date, month: getMonthKey(date), income: 0, expense: 0, transactions: [] };
      groupByDate.set(date, group);
      groups.push(group);
    }

    if (transaction.type === "income") group.income += Number(transaction.amount);
    if (transaction.type === "expense") group.expense += Math.abs(Number(transaction.amount));
    group.transactions.push(transaction);
  }

  return groups;
}

export function LedgerHome() {
  const [selectedMonth] = useState(currentMonth);
  const [headerSheet, setHeaderSheet] = useState<"book" | "budget" | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["transactions", "home"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiGet<LedgerTransaction[]>(`/api/transactions?limit=${PAGE_SIZE}&offset=${pageParam}`),
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length < PAGE_SIZE ? undefined : Number(lastPageParam) + PAGE_SIZE
  });
  const monthLabel = `${Number(selectedMonth.slice(5, 7))}月`;
  const transactions = useMemo(() => data?.pages.flat() ?? [], [data]);
  const dayGroups = useMemo(() => groupTransactionsByDay(transactions), [transactions]);
  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.happenedOn.startsWith(selectedMonth)),
    [selectedMonth, transactions]
  );
  const summary = useMemo(() => getMonthSummary(monthTransactions), [monthTransactions]);
  const pullRefresh = usePullToRefresh({
    containerRef: scrollRef,
    disabled: isLoading,
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await refetch();
    }
  });
  const { data: budget } = useQuery({
    queryKey: ["budget", selectedMonth],
    queryFn: () => apiGet<BudgetInfo>(`/api/budgets/current?month=${selectedMonth}`)
  });
  const budgetRemaining = budget ? Number(budget.remainingAmount) : 0;
  const budgetTotal = budget ? Number(budget.totalAmount) : 0;
  const saveBudgetMutation = useMutation({
    mutationFn: () =>
      apiPut<BudgetInfo>(`/api/budgets/${selectedMonth}`, {
        enabled: true,
        totalAmount: Number(budgetDraft || 0),
        displayMode: "remaining"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budget"] });
      setHeaderSheet(null);
    }
  });

  function openBudgetSheet() {
    setBudgetDraft(budget?.totalAmount ?? "0.00");
    setHeaderSheet("budget");
  }

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasNextPage || isFetchingNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "220px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, transactions.length]);

  return (
    <section className="ledger-page">
      <div className="ledger-home__fixed">
        <header className="ledger-header ledger-header--centered">
          <span className="ledger-header__spacer" aria-hidden="true" />
          <button className="book-pill" type="button" onClick={() => setHeaderSheet("book")}>
            默认账本
            <ChevronDown aria-hidden="true" />
          </button>
          <div className="header-actions">
            <Link className="icon-button" to="/search" aria-label="搜索账单">
              <Search aria-hidden="true" />
            </Link>
            <Link className="icon-button" to={`/calendar?month=${selectedMonth}`} aria-label="日历账单">
              <CalendarDays aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="month-summary">
          <div className="summary-income">
            <span>{monthLabel}收入</span>
            <strong>{formatMoney(summary.income)}</strong>
          </div>
          <button className="budget-bubble" type="button" onClick={openBudgetSheet}>
            <span>月预算</span>
            <strong>{formatMoney(budgetRemaining)}</strong>
          </button>
          <div className="summary-expense">
            <span>{monthLabel}支出</span>
            <strong>{formatMoney(summary.expense)}</strong>
          </div>
        </div>
      </div>

      <div className="ledger-home__scroll" ref={scrollRef}>
        <div
          className={`pull-refresh pull-refresh--${pullRefresh.status}`}
          style={{ height: pullRefresh.distance }}
          aria-live="polite"
        >
          <span>
            {pullRefresh.status === "refreshing"
              ? "正在刷新..."
              : pullRefresh.status === "ready"
                ? "松开刷新"
                : pullRefresh.status === "pulling"
                  ? "下拉刷新"
                  : ""}
          </span>
        </div>
        <div className="timeline">
          <div className="timeline__line" />
          {isLoading ? <p className="empty-state">正在读取账单...</p> : null}
          {isError ? (
            <div className="state-panel">
              <p>账单读取失败，请检查后端服务。</p>
              <button type="button" onClick={() => void refetch()}>
                重试
              </button>
            </div>
          ) : null}
          {!isLoading && !isError && transactions.length === 0 ? <p className="empty-state">还没有账单。</p> : null}
          {dayGroups.map((group, groupIndex) => {
            const previousGroup = dayGroups[groupIndex - 1];
            const showMonthNode = !previousGroup || previousGroup.month !== group.month;
            const dayNode = formatDayNode(group.date);

            return (
              <div className="timeline-day" key={group.date}>
                {showMonthNode ? <div className="timeline-month-node">{formatMonthNode(group.month)}</div> : null}
                <div className="timeline-day-summary">
                  <div className="timeline-day-summary__amount timeline-day-summary__amount--income">
                    {group.income > 0 ? `¥${formatMoney(group.income)}` : ""}
                  </div>
                  <div className={`timeline-day-node ${dayNode.special ? "timeline-day-node--special" : ""}`}>
                    <strong>{dayNode.label}</strong>
                  </div>
                  <div className="timeline-day-summary__amount timeline-day-summary__amount--expense">
                    {group.expense > 0 ? `¥${formatMoney(group.expense)}` : ""}
                  </div>
                </div>
                {group.transactions.map((item) => {
                  const isIncome = item.type === "income";
                  const isExpense = item.type === "expense";
                  const rowMain = (
                    <div className="timeline-row__main">
                      <div>
                        <strong>{item.category}</strong>
                        {item.note ? <span>{item.note}</span> : null}
                      </div>
                      {item.type === "transfer" ? (
                        <b className="money-transfer">{absoluteMoney(item.displayAmount ?? item.transferAmount ?? item.amount)}</b>
                      ) : (
                        <b className={isIncome ? "money-income" : item.type === "loan" ? "money-transfer" : ""}>
                          {isExpense ? "-" : ""}
                          {absoluteMoney(item.displayAmount ?? item.amount)}
                        </b>
                      )}
                    </div>
                  );
                  return (
                    <Link
                      className={`timeline-row ${isIncome ? "timeline-row--income" : isExpense ? "timeline-row--expense" : "timeline-row--neutral"}`}
                      key={item.id}
                      to={`/transactions/${item.id}`}
                    >
                      <div className="timeline-row__side timeline-row__side--left">{isIncome ? rowMain : null}</div>
                      <CategoryIcon color={item.color} icon={item.icon} label={item.category} size="sm" />
                      <div className="timeline-row__side timeline-row__side--right">{isIncome ? null : rowMain}</div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <div className="infinite-sentinel" ref={loadMoreRef}>
            {isFetchingNextPage ? "正在加载更多..." : hasNextPage ? "" : transactions.length ? "没有更多账单了" : ""}
          </div>
        </div>
      </div>

      {headerSheet === "budget" ? (
        <BottomSheet
          title={`${monthLabel}预算`}
          confirmLabel={saveBudgetMutation.isPending ? "保存中" : "保存"}
          confirmDisabled={saveBudgetMutation.isPending || !Number.isFinite(Number(budgetDraft)) || Number(budgetDraft) < 0}
          onClose={() => setHeaderSheet(null)}
          onConfirm={() => saveBudgetMutation.mutate()}
        >
          {saveBudgetMutation.error ? <div className="form-error">{saveBudgetMutation.error.message}</div> : null}
          <div className="sheet-form">
            <label className="sheet-field">
              月总预算
              <input
                inputMode="decimal"
                value={budgetDraft}
                placeholder="0.00"
                onChange={(event) => setBudgetDraft(event.target.value)}
              />
            </label>
            <div className="budget-preview">
              <span>本月已用 ¥{formatMoney(summary.expense)}</span>
              <strong>剩余 ¥{formatMoney(Math.max(0, Number(budgetDraft || 0) - summary.expense))}</strong>
              <small>当前预算 ¥{formatMoney(budgetTotal)}</small>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {headerSheet === "book" ? (
        <BottomSheet title="账本" onClose={() => setHeaderSheet(null)}>
          <div className="sheet-list">
            <button type="button" onClick={() => setHeaderSheet(null)}>
              默认账本
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
