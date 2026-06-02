import {
  Bot,
  CalendarClock,
  DatabaseBackup,
  Settings,
  Shirt,
  Trash2,
  Upload,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { useCurrentDateKey } from "../hooks/useCurrentDateKey";
import { apiGet, apiPut } from "../lib/api";
import { formatMoney } from "../lib/format";
import { localMonthKey, parseDateKey } from "../lib/localDate";

type MenuSheet = "backupSchedule" | "budget" | "settings";
type MenuItem =
  | { label: string; icon: LucideIcon; to: string; sheet?: never }
  | { label: string; icon: LucideIcon; sheet: MenuSheet; to?: never };

const groups: MenuItem[][] = [
  [
    { label: "数据导入", icon: Upload, to: "/data?tab=import" },
    { label: "数据备份", icon: DatabaseBackup, to: "/data?tab=backup" },
    { label: "定时备份", icon: CalendarClock, sheet: "backupSchedule" }
  ],
  [
    { label: "分类管理", icon: Shirt, to: "/categories" },
    { label: "预算设置", icon: WalletCards, sheet: "budget" }
  ],
  [
    { label: "数据清理", icon: Trash2, to: "/data-clear" },
    { label: "设置", icon: Settings, sheet: "settings" }
  ]
];

type BudgetInfo = {
  month: string;
  enabled: boolean;
  totalAmount: string;
  usedAmount: string;
  remainingAmount: string;
  displayMode: "remaining" | "used";
};

type BackupSchedule = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

type TransactionStats = {
  firstTransactionDate: string | null;
  transactionCount: number;
};

function daysInclusive(from: string, to: string) {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = parseDateKey(to).getTime() - parseDateKey(from).getTime();
  return Math.max(1, Math.floor(diff / dayMs) + 1);
}

function formatDateTime(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function MorePage() {
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  const [budgetMonth, setBudgetMonth] = useState(() => localMonthKey());
  const [budgetDraft, setBudgetDraft] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<BackupSchedule>({ enabled: false, frequency: "daily" });
  const todayKey = useCurrentDateKey();

  const { data: stats } = useQuery({
    queryKey: ["transactions", "stats"],
    queryFn: () => apiGet<TransactionStats>("/api/transactions/stats")
  });
  const { data: budget } = useQuery({
    queryKey: ["budget", budgetMonth],
    queryFn: () => apiGet<BudgetInfo>(`/api/budgets/current?month=${budgetMonth}`),
    enabled: sheet === "budget"
  });
  const { data: schedule } = useQuery({
    queryKey: ["backups", "schedule"],
    queryFn: () => apiGet<BackupSchedule>("/api/backups/schedule"),
    enabled: sheet === "backupSchedule"
  });

  const accountingDays = stats?.firstTransactionDate ? daysInclusive(stats.firstTransactionDate, todayKey) : 0;

  const saveBudgetMutation = useMutation({
    mutationFn: () =>
      apiPut<BudgetInfo>(`/api/budgets/${budgetMonth}`, {
        enabled: true,
        totalAmount: Number(budgetDraft || 0),
        displayMode: "remaining"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budget"] });
      setSheet(null);
    }
  });
  const saveScheduleMutation = useMutation({
    mutationFn: () =>
      apiPut<BackupSchedule>("/api/backups/schedule", {
        enabled: scheduleDraft.enabled,
        frequency: scheduleDraft.frequency
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["backups", "schedule"] });
      setSheet(null);
    }
  });

  useEffect(() => {
    if (sheet === "budget" && budget) setBudgetDraft(budget.totalAmount);
  }, [budget, sheet]);

  useEffect(() => {
    if (sheet === "backupSchedule" && schedule) setScheduleDraft(schedule);
  }, [schedule, sheet]);

  return (
    <section className="more-page">
      <header className="profile-strip">
        <div className="profile-avatar profile-avatar--bot">
          <Bot aria-hidden="true" />
        </div>
        <div>
          <strong>个人账本</strong>
          <span>{accountingDays > 0 ? `已坚持记账 ${accountingDays} 天` : "开始记录后自动计算坚持天数"}</span>
        </div>
      </header>

      {groups.map((group, index) => (
        <div className="menu-group" key={index}>
          {group.map((item) =>
            "to" in item ? (
              <Link className="menu-row" key={item.label} to={item.to}>
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ) : (
              <button className="menu-row" key={item.label} type="button" onClick={() => setSheet(item.sheet)}>
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      ))}

      {sheet === "budget" ? (
        <BottomSheet
          title="预算设置"
          confirmLabel={saveBudgetMutation.isPending ? "保存中" : "保存"}
          confirmDisabled={saveBudgetMutation.isPending || !Number.isFinite(Number(budgetDraft)) || Number(budgetDraft) < 0}
          onClose={() => setSheet(null)}
          onConfirm={() => saveBudgetMutation.mutate()}
        >
          {saveBudgetMutation.error ? <div className="form-error">{saveBudgetMutation.error.message}</div> : null}
          <div className="sheet-form">
            <label className="sheet-field">
              月份
              <input type="month" value={budgetMonth} onChange={(event) => setBudgetMonth(event.target.value)} />
            </label>
            <label className="sheet-field">
              月总预算
              <input inputMode="decimal" value={budgetDraft} placeholder="0.00" onChange={(event) => setBudgetDraft(event.target.value)} />
            </label>
            <div className="budget-preview">
              <span>已用 ¥{formatMoney(Number(budget?.usedAmount ?? 0))}</span>
              <strong>剩余 ¥{formatMoney(Number(budget?.remainingAmount ?? 0))}</strong>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "backupSchedule" ? (
        <BottomSheet
          title="定时备份"
          confirmLabel={saveScheduleMutation.isPending ? "保存中" : "保存"}
          confirmDisabled={saveScheduleMutation.isPending}
          onClose={() => setSheet(null)}
          onConfirm={() => saveScheduleMutation.mutate()}
        >
          {saveScheduleMutation.error ? <div className="form-error">{saveScheduleMutation.error.message}</div> : null}
          <div className="sheet-form">
            <button
              className={`state-toggle full-width-action ${scheduleDraft.enabled ? "is-selected" : ""}`}
              type="button"
              aria-pressed={scheduleDraft.enabled}
              onClick={() => setScheduleDraft((current) => ({ ...current, enabled: !current.enabled }))}
            >
              <span>{scheduleDraft.enabled ? "已开启定时备份" : "未开启定时备份"}</span>
            </button>
            <label className="sheet-field">
              频率
              <select
                value={scheduleDraft.frequency}
                onChange={(event) => setScheduleDraft((current) => ({ ...current, frequency: event.target.value as BackupSchedule["frequency"] }))}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </label>
            <div className="backup-schedule-meta">
              <span>上次执行</span>
              <strong>{formatDateTime(scheduleDraft.lastRunAt, "暂无")}</strong>
              <span>下次执行</span>
              <strong>{formatDateTime(scheduleDraft.nextRunAt, "待计算")}</strong>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "settings" ? (
        <BottomSheet title="设置" onClose={() => setSheet(null)}>
          <div className="sheet-form">
            <p className="empty-state">当前版本先保留核心账本、资产、借贷、报表、导入和备份设置。</p>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
