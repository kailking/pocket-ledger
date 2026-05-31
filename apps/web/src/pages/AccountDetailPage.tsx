import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Settings } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CategoryIcon } from "../components/CategoryIcon";
import { apiGet } from "../lib/api";
import { absoluteMoney, formatMoney } from "../lib/format";
import type { LedgerAccount } from "../lib/ledgerStore";
import { getVisibleStatementMonths } from "./accountDetailMonths";

type AccountStatementItem = {
  id: string;
  type: string;
  rawType?: string;
  happenedOn: string;
  dateLabel: string;
  category: string;
  categoryId?: string | null;
  note: string;
  amount: string;
  displayAmount: string;
  signedAmount: string;
  runningBalance: string;
  account: string;
  accountId: string;
  member?: string;
  icon: string;
  color: string;
  transferId?: string;
  loanId?: string;
  createdAt: string;
};

type AccountStatementMonth = {
  month: string;
  label: string;
  startDate: string;
  endDate: string;
  inflow: string;
  outflow: string;
  net: string;
  count: number;
  transactions: AccountStatementItem[];
};

type AccountStatement = {
  account: LedgerAccount;
  year: number;
  availableYears: number[];
  totals: {
    inflow: string;
    outflow: string;
    net: string;
  };
  months: AccountStatementMonth[];
};

function currentYear() {
  return new Date().getFullYear();
}

function currentMonthKey(year: number) {
  const now = new Date();
  if (year !== now.getFullYear()) return "";
  return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function displaySignedAmount(item: AccountStatementItem) {
  const amount = Number(item.signedAmount);
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}${absoluteMoney(amount)}`;
}

export function AccountDetailPage() {
  const navigate = useNavigate();
  const { accountId = "" } = useParams();
  const [year, setYear] = useState(currentYear);
  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["accounts", accountId, "statement", year],
    queryFn: () => apiGet<AccountStatement>(`/api/accounts/${accountId}/statement?year=${year}`),
    enabled: Boolean(accountId)
  });
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const visibleMonths = useMemo(() => getVisibleStatementMonths(data?.months ?? [], currentMonth()), [data?.months]);

  useEffect(() => {
    if (!data) return;
    const preferred = currentMonthKey(data.year);
    const firstWithRows = visibleMonths[0]?.month;
    const next = preferred && visibleMonths.some((month) => month.month === preferred) ? preferred : firstWithRows;
    setOpenMonths(next ? new Set([next]) : new Set());
  }, [data?.year, data, visibleMonths]);

  const yearOptions = data?.availableYears.length ? data.availableYears : [year];
  const account = data?.account;

  const monthStats = useMemo(() => visibleMonths.slice(0, 6), [visibleMonths]);

  function toggleMonth(month: string) {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  return (
    <section className="account-detail-page">
      <header className="section-header account-detail-topbar">
        <button className="icon-button" type="button" aria-label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong>{account?.name ?? "账户详情"}</strong>
        <Link className="icon-button" to={`/assets/accounts/${accountId}/settings`} aria-label="账户设置">
          <Settings aria-hidden="true" />
        </Link>
      </header>

      {isLoading ? <p className="empty-state">正在读取账户详情...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>账户详情读取失败，请稍后重试。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {account && data ? (
        <>
          <section className="account-detail-hero" style={{ background: account.color }}>
            <div className="account-detail-hero__title">
              <CategoryIcon color="rgba(255,255,255,0.22)" icon={account.icon} size="md" />
              <div>
                <span>{account.kind === "asset" ? "资产账户" : "负债账户"}</span>
                <strong>{account.name}</strong>
              </div>
            </div>
            <div className="account-detail-balance">
              <strong>¥{formatMoney(account.balance)}</strong>
              <Link to={`/assets/accounts/${accountId}/settings`} aria-label="调整余额">
                <Pencil aria-hidden="true" />
              </Link>
              <span>账户余额</span>
            </div>
            <div className="account-year-switch">
              <button type="button" aria-label="上一年" onClick={() => setYear((current) => current - 1)}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <label>
                <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                  {Array.from(new Set([...yearOptions, year, year - 1, year + 1]))
                    .sort((a, b) => b - a)
                    .map((item) => (
                      <option key={item} value={item}>
                        {item} 年
                      </option>
                    ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
              <button type="button" aria-label="下一年" onClick={() => setYear((current) => current + 1)}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className="account-stat-grid">
              <div>
                <span>流出</span>
                <strong>¥{formatMoney(data.totals.outflow)}</strong>
              </div>
              <div>
                <span>流入</span>
                <strong>¥{formatMoney(data.totals.inflow)}</strong>
              </div>
              <div>
                <span>净变动</span>
                <strong className={Number(data.totals.net) >= 0 ? "money-income" : "money-danger"}>¥{formatMoney(data.totals.net)}</strong>
              </div>
            </div>
          </section>

          <section className="account-month-strip" aria-label="月度概览">
            {monthStats.length ? (
              monthStats.map((month) => (
                <button
                  className={openMonths.has(month.month) ? "is-active" : ""}
                  key={month.month}
                  type="button"
                  onClick={() => toggleMonth(month.month)}
                >
                  <span>{month.label}</span>
                  <strong>{formatMoney(month.net)}</strong>
                </button>
              ))
            ) : (
              <p>本年暂无流水</p>
            )}
          </section>

          <div className="account-month-list">
            {visibleMonths.length === 0 ? <p className="empty-state">本年暂无已发生流水</p> : null}
            {visibleMonths.map((month) => {
              const isOpen = openMonths.has(month.month);
              return (
                <article className={`account-month-panel ${isOpen ? "is-open" : ""}`} key={month.month}>
                  <button className="account-month-trigger" type="button" onClick={() => toggleMonth(month.month)}>
                    <ChevronDown aria-hidden="true" />
                    <div>
                      <strong>{month.label}</strong>
                      <span>{month.startDate.slice(5).replace("-", ".")} - {month.endDate.slice(5).replace("-", ".")}</span>
                    </div>
                    <div className="account-month-summary">
                      <span>流入 ¥{formatMoney(month.inflow)}</span>
                      <span>流出 ¥{formatMoney(month.outflow)}</span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="account-flow-list">
                      {month.transactions.length ? (
                        month.transactions.map((item) => {
                          const signed = Number(item.signedAmount);
                          return (
                            <Link className="account-flow-row" key={item.id} to={`/transactions/${item.id}`}>
                              <span className="account-flow-row__date">{Number(item.happenedOn.slice(8, 10))}日</span>
                              <CategoryIcon color={item.color} icon={item.icon} label={item.category} size="sm" />
                              <div className="account-flow-row__meta">
                                <strong>{item.category}</strong>
                                <span>{item.note || item.member || item.account}</span>
                              </div>
                              <b className={signed > 0 ? "money-income" : signed < 0 ? "money-danger" : ""}>
                                {displaySignedAmount(item)}
                              </b>
                            </Link>
                          );
                        })
                      ) : (
                        <p className="account-flow-empty">无流水记录</p>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="account-detail-footer">
            <button className="primary-action" type="button" onClick={() => navigate(`/entry?accountId=${accountId}`)}>
              <Plus aria-hidden="true" />
              记一笔
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
