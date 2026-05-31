import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { CategoryIcon } from "../components/CategoryIcon";
import { apiGet } from "../lib/api";
import { absoluteMoney, formatMoney } from "../lib/format";
import type { LedgerTransaction } from "../lib/ledgerStore";

type ReportType = "income" | "expense";

type CategorySummary = {
  category: {
    id: string;
    name: string;
    type: ReportType;
    icon: string;
    color: string;
  };
  type: ReportType;
  startDate?: string;
  endDate?: string;
  amount: string;
  count: number;
  average: string;
  firstDate: string | null;
  lastDate: string | null;
};

function validType(value: string | null): ReportType {
  return value === "income" ? "income" : "expense";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(date = today()) {
  return `${date.slice(0, 8)}01`;
}

function groupByDate(items: LedgerTransaction[]) {
  return items.reduce<Record<string, LedgerTransaction[]>>((groups, item) => {
    groups[item.happenedOn] = [...(groups[item.happenedOn] ?? []), item];
    return groups;
  }, {});
}

export function ReportCategoryDetailPage() {
  const navigate = useNavigate();
  const { categoryId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const type = validType(searchParams.get("type"));
  const from = searchParams.get("from") ?? monthStart();
  const to = searchParams.get("to") ?? today();

  const summaryUrl = `/api/reports/category/${categoryId}/summary?${new URLSearchParams({ type, from, to }).toString()}`;
  const transactionsUrl = `/api/transactions?${new URLSearchParams({
    type,
    categoryId,
    startDate: from,
    endDate: to,
    limit: "500"
  }).toString()}`;

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary
  } = useQuery({
    queryKey: ["reports", "category-detail", summaryUrl],
    queryFn: () => apiGet<CategorySummary>(summaryUrl),
    enabled: Boolean(categoryId)
  });
  const {
    data: transactions = [],
    isLoading: isTransactionsLoading,
    isError: isTransactionsError,
    refetch: refetchTransactions
  } = useQuery({
    queryKey: ["transactions", "category-detail", transactionsUrl],
    queryFn: () => apiGet<LedgerTransaction[]>(transactionsUrl),
    enabled: Boolean(categoryId)
  });

  const grouped = useMemo(() => groupByDate(transactions), [transactions]);
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <section className="report-detail-page">
      <header className="section-header">
        <button className="icon-button" type="button" aria-label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong>{summary?.category.name ?? "分类详情"}</strong>
        <span className="section-header__spacer" />
      </header>

      {(isSummaryLoading || isTransactionsLoading) ? <p className="empty-state">正在读取分类明细...</p> : null}
      {(isSummaryError || isTransactionsError) ? (
        <div className="state-panel">
          <p>分类明细读取失败。</p>
          <button
            type="button"
            onClick={() => {
              void refetchSummary();
              void refetchTransactions();
            }}
          >
            重试
          </button>
        </div>
      ) : null}

      {summary ? (
        <>
          <section className="report-detail-hero" style={{ background: summary.category.color }}>
            <CategoryIcon color="rgba(255,255,255,0.24)" icon={summary.category.icon} label={summary.category.name} size="md" />
            <span>{from.slice(0, 7) === to.slice(0, 7) ? `${from.slice(0, 4)}年${Number(from.slice(5, 7))}月` : `${from} 至 ${to}`}</span>
            <strong>¥{formatMoney(summary.amount)}</strong>
            <small>{type === "expense" ? "总支出" : "总收入"} · {summary.count} 笔 · 平均 ¥{formatMoney(summary.average)}</small>
          </section>

          <div className="report-detail-filter">
            <CalendarDays aria-hidden="true" />
            <span>{from} 至 {to}</span>
          </div>

          {dates.length === 0 ? <p className="empty-state">当前范围暂无明细</p> : null}
          <div className="report-detail-list">
            {dates.map((date) => (
              <section className="report-detail-day" key={date}>
                <h3>{date}</h3>
                {grouped[date]?.map((item) => (
                  <Link className="search-result-row" key={item.id} to={`/transactions/${item.id}`}>
                    <CategoryIcon color={item.color} icon={item.icon} label={item.category} size="sm" />
                    <div>
                      <strong>{item.category}</strong>
                      <span>{item.note || item.account}</span>
                    </div>
                    <small>{item.account}</small>
                    <b className={item.type === "income" ? "money-income" : ""}>
                      {item.type === "expense" ? "-" : "+"}
                      {absoluteMoney(item.displayAmount ?? item.amount)}
                    </b>
                  </Link>
                ))}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
