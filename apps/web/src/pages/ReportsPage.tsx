import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { SegmentedControl } from "../components/SegmentedControl";
import { useCurrentDateKey } from "../hooks/useCurrentDateKey";
import { apiGet } from "../lib/api";
import { formatMoney } from "../lib/format";
import { addDaysKey, localMonthEnd, localMonthStart, shiftMonthKey } from "../lib/localDate";
import { resolveCategoryDateRange, type ReportRangeMode } from "./reportDateRange";

type ReportTab = "category" | "trend" | "compare";
type ReportType = "expense" | "income";
type TrendMetric = "income" | "expense" | "balance";

type CategoryReportRow = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  percent: number;
  amount: string;
  count: number;
};

type CategoryReport = {
  type: ReportType;
  startDate?: string;
  endDate?: string;
  total: string;
  rows: CategoryReportRow[];
};

type TrendReportRow = { month: string; income: string; expense: string; balance: string };
type TrendReport = {
  year: number;
  rows: TrendReportRow[];
  totals: { income: string; expense: string; balance: string };
};

type CompareCategory = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  count: number;
  total: string;
  average: string;
  months: Array<{ month: string; amount: string; count: number; ratio: number }>;
};
type CompareReport = {
  year: number;
  type: ReportType;
  months: string[];
  categories: CompareCategory[];
};

const tabs: Array<{ label: string; value: ReportTab }> = [
  { label: "分类", value: "category" },
  { label: "趋势", value: "trend" },
  { label: "对比", value: "compare" }
];

function currentYear() {
  return new Date().getFullYear();
}

function validTab(value: string | null): ReportTab {
  return value === "trend" || value === "compare" || value === "category" ? value : "category";
}

function validType(value: string | null): ReportType {
  return value === "income" ? "income" : "expense";
}

function validRangeMode(value: string | null): ReportRangeMode {
  return value === "custom" || value === "week" || value === "month" || value === "year" ? value : null;
}

function buildCategoryUrl(type: ReportType, from: string, to: string) {
  const params = new URLSearchParams({ type, from, to, limit: "100" });
  return `/api/reports/category?${params.toString()}`;
}

function labelMonth(month: string) {
  return `${Number(month.slice(5, 7))}月`;
}

function lineColor(metric: TrendMetric) {
  if (metric === "income") return "#0f9f6e";
  if (metric === "expense") return "#533afd";
  return "#ea2261";
}

function donutGradient(rows: CategoryReportRow[]) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  if (total <= 0) return "#edf3fb";
  let cursor = 0;
  return rows
    .map((row) => {
      const start = cursor;
      cursor += (Number(row.amount) / total) * 360;
      return `${row.color} ${start}deg ${cursor}deg`;
    })
    .join(", ");
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = useCurrentDateKey();
  const activeTab = validTab(searchParams.get("tab"));
  const categoryType = validType(searchParams.get("type"));
  const categoryRange = resolveCategoryDateRange(
    { from: searchParams.get("from"), to: searchParams.get("to"), mode: validRangeMode(searchParams.get("range")) },
    todayKey
  );
  const categoryFrom = categoryRange.from;
  const categoryTo = categoryRange.to;
  const trendYear = Number(searchParams.get("year") ?? currentYear());
  const compareType = validType(searchParams.get("compareType"));
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState({ from: categoryFrom, to: categoryTo });
  const [trendMetrics, setTrendMetrics] = useState<TrendMetric[]>(["income", "expense", "balance"]);

  function updateParams(patch: Record<string, string | number>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => next.set(key, String(value)));
    setSearchParams(next);
  }

  const categoryQueryUrl = buildCategoryUrl(categoryType, categoryFrom, categoryTo);
  const {
    data: categoryReport,
    isLoading: isCategoryLoading,
    isError: isCategoryError,
    refetch: refetchCategory
  } = useQuery({
    queryKey: ["reports", "category", categoryQueryUrl],
    queryFn: () => apiGet<CategoryReport>(categoryQueryUrl),
    enabled: activeTab === "category"
  });

  const {
    data: trendReport,
    isLoading: isTrendLoading,
    isError: isTrendError,
    refetch: refetchTrend
  } = useQuery({
    queryKey: ["reports", "trend", trendYear],
    queryFn: () => apiGet<TrendReport>(`/api/reports/trend?year=${trendYear}`),
    enabled: activeTab === "trend"
  });

  const {
    data: compareReport,
    isLoading: isCompareLoading,
    isError: isCompareError,
    refetch: refetchCompare
  } = useQuery({
    queryKey: ["reports", "compare", trendYear, compareType],
    queryFn: () => apiGet<CompareReport>(`/api/reports/compare?year=${trendYear}&type=${compareType}`),
    enabled: activeTab === "compare"
  });

  const trendData = useMemo(
    () =>
      (trendReport?.rows ?? []).map((row) => ({
        month: labelMonth(row.month),
        income: Number(row.income),
        expense: Number(row.expense),
        balance: Number(row.balance)
      })),
    [trendReport]
  );

  function toggleMetric(metric: TrendMetric) {
    setTrendMetrics((current) => {
      if (current.includes(metric)) return current.filter((item) => item !== metric);
      return [...current, metric];
    });
  }

  function applyPreset(preset: "week" | "month" | "year") {
    if (preset === "month") {
      const start = localMonthStart(todayKey);
      updateParams({ from: start, to: localMonthEnd(start.slice(0, 7)), range: "month" });
    }
    if (preset === "year") {
      const year = todayKey.slice(0, 4);
      updateParams({ from: `${year}-01-01`, to: `${year}-12-31`, range: "year" });
    }
    if (preset === "week") {
      const now = new Date();
      const day = now.getDay() || 7;
      updateParams({ from: addDaysKey(todayKey, -day + 1), to: todayKey, range: "week" });
    }
    setDateSheetOpen(false);
  }

  function shiftMonth(delta: number) {
    const nextMonth = shiftMonthKey(categoryFrom.slice(0, 7), delta);
    updateParams({ from: `${nextMonth}-01`, to: localMonthEnd(nextMonth), range: "month" });
  }

  return (
    <section className="report-page">
      <div className="report-page__fixed">
        <header className="section-header section-header--center">
          <nav className="report-tabs">
            {tabs.map((tab) => (
              <button
                className={activeTab === tab.value ? "is-active" : ""}
                key={tab.value}
                onClick={() => updateParams({ tab: tab.value })}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === "category" ? (
          <section className="report-section category-report report-section--fixed">
            <div className="report-filter-bar">
              <SegmentedControl<ReportType>
                value={categoryType}
                options={[
                  { label: "支出", value: "expense" },
                  { label: "收入", value: "income" }
                ]}
                onChange={(nextType) => updateParams({ type: nextType })}
              />
              <div className="report-date-control">
                <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  className="report-date-control__label"
                  type="button"
                  onClick={() => {
                    setDateDraft({ from: categoryFrom, to: categoryTo });
                    setDateSheetOpen(true);
                  }}
                >
                  <CalendarDays aria-hidden="true" />
                  {categoryFrom.slice(0, 7) === categoryTo.slice(0, 7)
                    ? `${categoryFrom.slice(0, 4)}年${Number(categoryFrom.slice(5, 7))}月`
                    : `${categoryFrom} 至 ${categoryTo}`}
                </button>
                <button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}>
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </div>

            <p className="report-book-label">默认账本</p>
            {isCategoryLoading ? <p className="empty-state">正在读取分类报表...</p> : null}
            {isCategoryError ? (
              <div className="state-panel">
                <p>分类报表读取失败。</p>
                <button type="button" onClick={() => void refetchCategory()}>
                  重试
                </button>
              </div>
            ) : null}
            {categoryReport && categoryReport.rows.length ? (
              <div className="report-chart-panel report-chart-panel--donut">
                <div
                  className="css-donut"
                  style={{ background: `conic-gradient(${donutGradient(categoryReport.rows)})` }}
                  aria-label="分类占比饼图"
                />
                <div className="chart-center">
                  <span>{categoryType === "expense" ? "总支出" : "总收入"}</span>
                  <strong>¥{formatMoney(categoryReport.total)}</strong>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "trend" ? (
          <section className="report-section trend-report report-section--fixed">
            <div className="report-year-bar">
              <button type="button" onClick={() => updateParams({ year: trendYear - 1 })}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <strong>{trendYear} 年</strong>
              <button type="button" onClick={() => updateParams({ year: trendYear + 1 })}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <p className="report-book-label">默认账本</p>
            <div className="trend-metric-toggles">
              {(["income", "expense", "balance"] as TrendMetric[]).map((metric) => (
                <button className={trendMetrics.includes(metric) ? "is-active" : ""} key={metric} type="button" onClick={() => toggleMetric(metric)}>
                  {metric === "income" ? "收入" : metric === "expense" ? "支出" : "结余"}
                </button>
              ))}
            </div>

            {isTrendLoading ? <p className="empty-state">正在读取趋势报表...</p> : null}
            {isTrendError ? (
              <div className="state-panel">
                <p>趋势报表读取失败。</p>
                <button type="button" onClick={() => void refetchTrend()}>
                  重试
                </button>
              </div>
            ) : null}
            {trendReport ? (
              <div className="trend-report__chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                    <XAxis dataKey="month" />
                    <YAxis width={58} />
                    {trendMetrics.map((metric) => (
                      <Line key={metric} type="monotone" dataKey={metric} name={metric} stroke={lineColor(metric)} strokeWidth={3} dot={false} />
                    ))}
                    <Tooltip formatter={(value) => `¥${formatMoney(Number(value))}`} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "compare" ? (
          <section className="report-section compare-report report-section--fixed">
            <div className="report-year-bar">
              <button type="button" onClick={() => updateParams({ year: trendYear - 1 })}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <strong>{trendYear} 年</strong>
              <button type="button" onClick={() => updateParams({ year: trendYear + 1 })}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <SegmentedControl<ReportType>
              value={compareType}
              options={[
                { label: "支出", value: "expense" },
                { label: "收入", value: "income" }
              ]}
              onChange={(nextType) => updateParams({ compareType: nextType })}
            />

            {isCompareLoading ? <p className="empty-state">正在读取对比报表...</p> : null}
            {isCompareError ? (
              <div className="state-panel">
                <p>对比报表读取失败。</p>
                <button type="button" onClick={() => void refetchCompare()}>
                  重试
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="report-page__scroll">
        {activeTab === "category" ? (
          <section className="report-list-section">
            {categoryReport && categoryReport.rows.length === 0 ? <p className="empty-state">当前时间范围暂无分类统计</p> : null}
            {categoryReport && categoryReport.rows.length ? (
              <div className="category-report__list">
                {categoryReport.rows.map((row) => (
                  <button
                    className="category-report__row"
                    key={row.categoryId}
                    type="button"
                    onClick={() =>
                      navigate(`/reports/categories/${row.categoryId}?type=${categoryType}&from=${categoryFrom}&to=${categoryTo}`)
                    }
                  >
                    <CategoryIcon color={row.color} icon={row.icon} label={row.name} size="sm" />
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.percent}% · {row.count} 笔</span>
                    </div>
                    <b>¥{formatMoney(row.amount)}</b>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "trend" && trendReport ? (
          <section className="report-list-section">
            <div className="trend-report__table">
              <div className="trend-report__table-head">
                <span>月份</span>
                <span>收入</span>
                <span>支出</span>
                <span>结余</span>
              </div>
              {trendReport.rows.map((row) => (
                <div className="trend-report__table-row" key={row.month}>
                  <strong>{labelMonth(row.month)}</strong>
                  <span className="money-income">{formatMoney(row.income)}</span>
                  <span>{formatMoney(row.expense)}</span>
                  <span className={Number(row.balance) >= 0 ? "money-income" : "money-danger"}>{formatMoney(row.balance)}</span>
                </div>
              ))}
              <div className="trend-report__table-row is-total">
                <strong>合计</strong>
                <span className="money-income">{formatMoney(trendReport.totals.income)}</span>
                <span>{formatMoney(trendReport.totals.expense)}</span>
                <span className={Number(trendReport.totals.balance) >= 0 ? "money-income" : "money-danger"}>
                  {formatMoney(trendReport.totals.balance)}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "compare" ? (
          <section className="report-list-section">
            {compareReport && compareReport.categories.length === 0 ? <p className="empty-state">当前年份暂无对比数据</p> : null}
            {compareReport ? (
              <div className="compare-grid">
                {compareReport.categories.map((category) => (
                  <article className="compare-card" key={category.categoryId}>
                    <div className="compare-card__header">
                      <CategoryIcon color={category.color} icon={category.icon} label={category.name} size="sm" />
                      <div>
                        <strong>{category.name}</strong>
                        <span>{category.count} 笔 · 月均 ¥{formatMoney(category.average)}</span>
                      </div>
                      <b>¥{formatMoney(category.total)}</b>
                    </div>
                    <div className="compare-card__bars">
                      {category.months.map((month) => (
                        <div key={month.month}>
                          <span>{Number(month.month.slice(5, 7))}</span>
                          <i>
                            <em style={{ width: `${Math.max(3, month.ratio)}%`, background: category.color }} />
                          </i>
                          <b>{formatMoney(month.amount)}</b>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {dateSheetOpen ? (
        <BottomSheet
          title="选择时间"
          confirmLabel="确定"
          onClose={() => setDateSheetOpen(false)}
          onConfirm={() => {
            updateParams({ from: dateDraft.from, to: dateDraft.to, range: "custom" });
            setDateSheetOpen(false);
          }}
        >
          <div className="sheet-form">
            <div className="chip-row">
              <button type="button" onClick={() => applyPreset("week")}>
                本周
              </button>
              <button type="button" onClick={() => applyPreset("month")}>
                本月
              </button>
              <button type="button" onClick={() => applyPreset("year")}>
                本年
              </button>
            </div>
            <div className="date-range-inputs">
              <label>
                <span>开始时间</span>
                <input type="date" value={dateDraft.from} onChange={(event) => setDateDraft((current) => ({ ...current, from: event.target.value }))} />
              </label>
              <label>
                <span>结束时间</span>
                <input type="date" value={dateDraft.to} onChange={(event) => setDateDraft((current) => ({ ...current, to: event.target.value }))} />
              </label>
            </div>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
