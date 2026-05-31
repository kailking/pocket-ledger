import { useMemo, useState } from "react";
import type { CategorySummary } from "@pocket-ledger/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Filter, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { apiGet } from "../lib/api";
import { absoluteMoney, formatMoney } from "../lib/format";
import type { LedgerAccount, LedgerTransaction } from "../lib/ledgerStore";

type DatePreset = "month" | "quarter" | "all" | "custom";
type TypeFilter = "all" | "income" | "expense" | "transfer";
type SheetName = "date" | "filter" | null;

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function typeLabel(type: TypeFilter): string {
  if (type === "income") return "收入";
  if (type === "expense") return "支出";
  if (type === "transfer") return "转账";
  return "全部类型";
}

function presetLabel(preset: DatePreset, startDate: string, endDate: string): string {
  if (preset === "month") return "本月";
  if (preset === "quarter") return "近90天";
  if (preset === "all") return "全部日期";
  if (!startDate && !endDate) return "自定义";
  return `${startDate || "开始"} 至 ${endDate || "今天"}`;
}

function buildTransactionSearchUrl(options: {
  keyword: string;
  typeFilter: TypeFilter;
  startDate: string;
  endDate: string;
  accountFilter: string;
  categoryFilter: string;
}) {
  const params = new URLSearchParams();
  params.set("limit", "500");
  const keyword = options.keyword.trim();
  if (keyword) params.set("q", keyword);
  if (options.typeFilter !== "all") params.set("type", options.typeFilter);
  if (options.startDate) params.set("startDate", options.startDate);
  if (options.endDate) params.set("endDate", options.endDate);
  if (options.accountFilter !== "all") params.set("accountId", options.accountFilter);
  if (options.categoryFilter !== "all" && options.typeFilter !== "transfer") params.set("categoryId", options.categoryFilter);
  return `/api/transactions?${params.toString()}`;
}

export function SearchPage() {
  const today = dateInputValue(new Date());
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);

  const [keyword, setKeyword] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [startDate, setStartDate] = useState(() => `${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sheet, setSheet] = useState<SheetName>(null);
  const queryUrl = buildTransactionSearchUrl({ keyword, typeFilter, startDate, endDate, accountFilter, categoryFilter });
  const {
    data: results = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["transactions", "search", queryUrl],
    queryFn: () => apiGet<LedgerTransaction[]>(queryUrl)
  });
  const { data: categoryData = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<CategorySummary[]>("/api/categories")
  });
  const { data: accountData = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<LedgerAccount[]>("/api/accounts")
  });

  const categories = useMemo(() => {
    if (typeFilter === "transfer") return [];
    return categoryData
      .filter((category) => typeFilter === "all" || category.type === typeFilter)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  }, [categoryData, typeFilter]);
  const accounts = useMemo(
    () => accountData.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [accountData]
  );
  const summary = useMemo(
    () =>
      results.reduce(
        (total, item) => {
          const amount = Number(item.amount);
          if (item.type === "income") total.income += amount;
          if (item.type === "expense") total.expense += Math.abs(amount);
          return total;
        },
        { income: 0, expense: 0 }
      ),
    [results]
  );
  const balance = summary.income - summary.expense;

  function applyPreset(nextPreset: DatePreset) {
    setDatePreset(nextPreset);
    if (nextPreset === "month") {
      setStartDate(`${today.slice(0, 8)}01`);
      setEndDate(today);
    }
    if (nextPreset === "quarter") {
      setStartDate(dateInputValue(ninetyDaysAgo));
      setEndDate(today);
    }
    if (nextPreset === "all") {
      setStartDate("");
      setEndDate("");
    }
  }

  function resetFilters() {
    setKeyword("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setAccountFilter("all");
    applyPreset("month");
  }

  function setType(nextType: TypeFilter) {
    setTypeFilter(nextType);
    setCategoryFilter("all");
  }

  return (
    <section className="search-page">
      <header className="search-header">
        <Link className="icon-button" to="/" aria-label="返回">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <label className="search-box">
          <Search aria-hidden="true" />
          <input
            placeholder="搜索备注、分类、账户、成员"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          {keyword ? (
            <button type="button" onClick={() => setKeyword("")} aria-label="清空搜索">
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </header>

      <div className="filter-bar">
        <button className={datePreset !== "month" ? "is-active" : ""} type="button" onClick={() => setSheet("date")}>
          <Calendar aria-hidden="true" />
          {presetLabel(datePreset, startDate, endDate)}
        </button>
        <button
          className={typeFilter !== "all" || categoryFilter !== "all" || accountFilter !== "all" ? "is-active" : ""}
          type="button"
          onClick={() => setSheet("filter")}
        >
          <Filter aria-hidden="true" />
          {typeLabel(typeFilter)}
        </button>
        <button type="button" onClick={resetFilters}>
          重置
        </button>
      </div>

      <div className="search-summary">
        <div>
          <span>收入</span>
          <strong>{formatMoney(summary.income)}</strong>
        </div>
        <div>
          <span>支出</span>
          <strong>{formatMoney(summary.expense)}</strong>
        </div>
        <div>
          <span>净额</span>
          <strong>{formatMoney(balance)}</strong>
        </div>
      </div>

      {isLoading ? <p className="empty-state">正在搜索账单...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>搜索数据读取失败，请稍后重试。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}
      {!isLoading && !isError && results.length === 0 ? <p className="empty-state">没有匹配的账单。</p> : null}

      <div className="search-results">
        {results.map((item) => (
          <Link className="search-result-row" key={item.id} to={`/transactions/${item.id}`}>
            <CategoryIcon color={item.color} icon={item.icon} label={item.category} size="sm" />
            <div>
              <strong>{item.category}</strong>
              <span>{item.note || item.account}</span>
            </div>
            <small>{item.happenedOn}</small>
            {item.type === "transfer" ? (
              <b className="money-transfer">{absoluteMoney(item.displayAmount ?? item.transferAmount ?? item.amount)}</b>
            ) : (
              <b className={item.type === "income" ? "money-income" : ""}>
                {item.type === "expense" ? "-" : ""}
                {absoluteMoney(item.amount)}
              </b>
            )}
          </Link>
        ))}
      </div>

      {sheet === "date" ? (
        <BottomSheet title="日期范围" onClose={() => setSheet(null)}>
          <div className="sheet-form">
            <div className="chip-row">
              {(["month", "quarter", "all"] as DatePreset[]).map((preset) => (
                <button
                  className={datePreset === preset ? "is-selected" : ""}
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                >
                  {presetLabel(preset, startDate, endDate)}
                </button>
              ))}
            </div>
            <div className="date-range-inputs">
              <label>
                <span>开始</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setDatePreset("custom");
                    setStartDate(event.target.value);
                  }}
                />
              </label>
              <label>
                <span>结束</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setDatePreset("custom");
                    setEndDate(event.target.value);
                  }}
                />
              </label>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "filter" ? (
        <BottomSheet title="筛选" onClose={() => setSheet(null)}>
          <div className="sheet-form">
            <label className="sheet-field">
              <span>类型</span>
              <select value={typeFilter} onChange={(event) => setType(event.target.value as TypeFilter)}>
                <option value="all">全部类型</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="transfer">转账</option>
              </select>
            </label>
            {typeFilter !== "transfer" ? (
              <label className="sheet-field">
                <span>分类</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">全部分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="sheet-field">
              <span>账户</span>
              <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="all">全部账户</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
