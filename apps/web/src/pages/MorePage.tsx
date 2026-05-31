import { Bell, CalendarClock, DatabaseBackup, Eraser, Palette, Settings, Shirt, Upload, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { formatMoney } from "../lib/format";

const groups = [
  [
    { label: "数据导入", icon: Upload, to: "/data?tab=import" },
    { label: "数据备份", icon: DatabaseBackup, to: "/data?tab=backup" },
    { label: "定时备份", icon: CalendarClock, sheet: "backupSchedule" }
  ],
  [
    { label: "分类管理", icon: Shirt, to: "/categories" },
    { label: "预算设置", icon: WalletCards, sheet: "budget" },
    { label: "提醒", icon: Bell, sheet: "提醒" }
  ],
  [
    { label: "主题外观", icon: Palette, sheet: "主题外观" },
    { label: "设置", icon: Settings, sheet: "设置" }
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

const clearConfirmationText = "清空所有数据";

function invalidateAllDataQueries() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["reports"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
    queryClient.invalidateQueries({ queryKey: ["loans"] }),
    queryClient.invalidateQueries({ queryKey: ["backups"] }),
    queryClient.invalidateQueries({ queryKey: ["imports"] })
  ]);
}

export function MorePage() {
  const [sheet, setSheet] = useState<string | null>(null);
  const [budgetMonth, setBudgetMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [budgetDraft, setBudgetDraft] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<BackupSchedule>({ enabled: false, frequency: "daily" });
  const [clearChecked, setClearChecked] = useState(false);
  const [clearText, setClearText] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
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
  const clearAllMutation = useMutation({
    mutationFn: () =>
      apiPost<{ cleared: boolean }>("/api/backups/clear-all", {
        confirmation: clearConfirmationText,
        secondConfirmation: true
      }),
    onSuccess: async () => {
      setClearChecked(false);
      setClearText("");
      await invalidateAllDataQueries();
    }
  });

  useEffect(() => {
    if (sheet === "budget" && budget) setBudgetDraft(budget.totalAmount);
  }, [budget, sheet]);

  useEffect(() => {
    if (sheet === "backupSchedule" && schedule) setScheduleDraft(schedule);
  }, [schedule, sheet]);

  function clearAllData() {
    if (!clearChecked || clearText !== clearConfirmationText || clearAllMutation.isPending) return;
    setConfirmDialog({
      title: "清空所有数据",
      message: "确认清空所有数据？此操作会删除账单、账户、分类、借贷、导入和备份相关数据，且不可撤销。",
      confirmLabel: "确认清空",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        clearAllMutation.mutate();
      }
    });
  }

  return (
    <section className="more-page">
      <header className="profile-strip">
        <div className="profile-avatar">131</div>
        <div>
          <strong>个人账本</strong>
          <span>已坚持记账 2789 天</span>
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

      <section className="danger-zone">
        <div className="danger-zone__title">
          <Eraser aria-hidden="true" />
          <strong>数据清空危险区</strong>
        </div>
        <p>此操作会清空当前账本数据。执行前请先确认已经完成备份。</p>
        <label className="danger-zone__check">
          <input type="checkbox" checked={clearChecked} onChange={(event) => setClearChecked(event.target.checked)} />
          <span>我确认要清空所有数据</span>
        </label>
        <input className="danger-zone__input" value={clearText} placeholder="输入：清空所有数据" onChange={(event) => setClearText(event.target.value)} />
        {clearAllMutation.error ? <p className="form-error">{clearAllMutation.error.message}</p> : null}
        {clearAllMutation.isSuccess ? <p className="form-hint">数据已清空。</p> : null}
        <button
          className="danger-action"
          type="button"
          disabled={!clearChecked || clearText !== clearConfirmationText || clearAllMutation.isPending}
          onClick={clearAllData}
        >
          {clearAllMutation.isPending ? "清空中" : "清空所有数据"}
        </button>
      </section>

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
      ) : sheet === "backupSchedule" ? (
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
              <strong>{scheduleDraft.lastRunAt ?? "暂无"}</strong>
              <span>下次执行</span>
              <strong>{scheduleDraft.nextRunAt ?? "待计算"}</strong>
            </div>
          </div>
        </BottomSheet>
      ) : sheet ? (
        <BottomSheet title={sheet} onClose={() => setSheet(null)}>
          <div className="sheet-form">
            <p className="empty-state">此入口已保留，当前版本先交付记账、账户、借贷、统计、导入和备份主链路。</p>
          </div>
        </BottomSheet>
      ) : null}

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </section>
  );
}
