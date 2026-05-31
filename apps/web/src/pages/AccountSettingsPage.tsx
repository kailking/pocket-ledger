import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Save, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { LedgerAccount } from "../lib/ledgerStore";

type AccountDraft = {
  name: string;
  type: string;
  kind: "asset" | "liability";
  balance: string;
  color: string;
  icon: string;
  includeInAssets: boolean;
};

const accountTypes = [
  { label: "现金", value: "cash", icon: "badge-yen-sign" },
  { label: "储蓄卡", value: "debit_card", icon: "credit-card" },
  { label: "信用卡", value: "credit_card", icon: "landmark" },
  { label: "支付宝", value: "alipay", icon: "wallet" },
  { label: "微信", value: "wechat", icon: "wallet" },
  { label: "投资", value: "investment", icon: "line-chart" },
  { label: "应收账", value: "receivable", icon: "hand-coins" },
  { label: "应付账", value: "payable", icon: "receipt-text" },
  { label: "自定义", value: "custom", icon: "wallet" }
];

const swatches = ["#5B7CFA", "#46B98F", "#E45C50", "#D9A441", "#43A3C8", "#A06CD5", "#C86464", "#6C7A89"];

function draftFromAccount(account: LedgerAccount): AccountDraft {
  return {
    name: account.name,
    type: account.type,
    kind: account.kind,
    balance: account.balance,
    color: account.color,
    icon: account.icon,
    includeInAssets: account.includeInAssets
  };
}

function pickIcon(type: string) {
  return accountTypes.find((item) => item.value === type)?.icon ?? "wallet";
}

export function AccountSettingsPage() {
  const navigate = useNavigate();
  const { accountId = "" } = useParams();
  const { data: account, isLoading, isError, refetch } = useQuery({
    queryKey: ["accounts", accountId],
    queryFn: () => apiGet<LedgerAccount>(`/api/accounts/${accountId}`),
    enabled: Boolean(accountId)
  });
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);

  useEffect(() => {
    if (account) setDraft(draftFromAccount(account));
  }, [account]);

  const canSave = useMemo(() => {
    if (!draft) return false;
    return draft.name.trim().length > 0 && Number.isFinite(Number(draft.balance));
  }, [draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account || !draft) throw new Error("账户数据未加载");
      const nextIcon = draft.icon || pickIcon(draft.type);
      const updated = await apiPut<LedgerAccount>(`/api/accounts/${account.id}`, {
        name: draft.name,
        type: draft.type,
        kind: draft.kind,
        color: draft.color,
        icon: nextIcon,
        includeInAssets: draft.includeInAssets
      });

      const targetBalance = Number(draft.balance || 0);
      if (Math.abs(targetBalance - Number(account.balance)) >= 0.005) {
        await apiPost(`/api/accounts/${account.id}/adjust-balance`, {
          targetBalance,
          happenedOn: new Date().toISOString().slice(0, 10),
          note: "账户设置调整余额"
        });
      }
      return updated;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts", accountId] }),
        queryClient.invalidateQueries({ queryKey: ["accounts", accountId, "statement"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
      navigate(`/assets/accounts/${accountId}`);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "保存失败");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete<{ id: string; deleted: boolean }>(`/api/accounts/${accountId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      navigate("/assets");
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "归档失败");
    }
  });

  function updateDraft(patch: Partial<AccountDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (patch.type && !patch.icon) next.icon = pickIcon(patch.type);
      return next;
    });
  }

  function archiveAccount() {
    if (!account) return;
    setConfirmDialog({
      title: "归档账户",
      message: `确认归档账户「${account.name}」？历史账单仍会保留。`,
      confirmLabel: "归档",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        deleteMutation.mutate();
      }
    });
  }

  return (
    <section className="account-settings-page">
      <header className="section-header">
        <button className="icon-button" type="button" aria-label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong>账户设置</strong>
        <button className="icon-button" type="button" aria-label="归档账户" onClick={archiveAccount} disabled={!account || deleteMutation.isPending}>
          <Trash2 aria-hidden="true" />
        </button>
      </header>

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}

      {isLoading ? <p className="empty-state">正在读取账户...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>账户读取失败，请稍后重试。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {draft && account ? (
        <div className="account-settings-form">
          {error ? <div className="form-error">{error}</div> : null}
          <label className="sheet-field">
            账户名称
            <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
          </label>

          <label className="sheet-field">
            账户类型
            <select value={draft.type} onChange={(event) => updateDraft({ type: event.target.value })}>
              {accountTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented account-kind-segment">
            <button type="button" aria-selected={draft.kind === "asset"} onClick={() => updateDraft({ kind: "asset" })}>
              资产
            </button>
            <button type="button" aria-selected={draft.kind === "liability"} onClick={() => updateDraft({ kind: "liability" })}>
              负债
            </button>
          </div>

          <label className="sheet-field">
            金额
            <input inputMode="decimal" value={draft.balance} onChange={(event) => updateDraft({ balance: event.target.value })} />
            <small>当前余额 ¥{formatMoney(account.balance)}；保存后会生成一条余额变更流水。</small>
          </label>

          <div className="account-setting-block">
            <span>选择账户颜色</span>
            <div className="swatch-row">
              {swatches.map((color) => (
                <button
                  key={color}
                  className={draft.color === color ? "is-selected" : ""}
                  style={{ background: color }}
                  type="button"
                  aria-label={color}
                  onClick={() => updateDraft({ color })}
                />
              ))}
            </div>
          </div>

          <button
            className={`state-toggle full-width-action ${draft.includeInAssets ? "is-selected" : ""}`}
            type="button"
            aria-pressed={draft.includeInAssets}
            onClick={() => updateDraft({ includeInAssets: !draft.includeInAssets })}
          >
            <Check aria-hidden="true" />
            <span>{draft.includeInAssets ? "已计入净资产" : "不计入净资产"}</span>
          </button>

          <button
            className="primary-action full-width-action"
            disabled={!canSave || saveMutation.isPending}
            type="button"
            onClick={() => saveMutation.mutate()}
          >
            <Save aria-hidden="true" />
            {saveMutation.isPending ? "保存中" : "保存账户"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
