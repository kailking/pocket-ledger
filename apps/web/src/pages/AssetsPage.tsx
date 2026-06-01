import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Eye, LineChart, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { LedgerAccount } from "../lib/ledgerStore";

type AccountDraft = {
  name: string;
  type: string;
  kind: "asset" | "liability";
  initialBalance: string;
  color: string;
  icon: string;
  includeInAssets: boolean;
};

const emptyDraft: AccountDraft = {
  name: "",
  type: "custom",
  kind: "asset",
  initialBalance: "0.00",
  color: "#5B7CFA",
  icon: "wallet",
  includeInAssets: true
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
    initialBalance: account.initialBalance ?? account.balance,
    color: account.color,
    icon: account.icon,
    includeInAssets: account.includeInAssets
  };
}

function pickIcon(type: string) {
  return accountTypes.find((item) => item.value === type)?.icon ?? "wallet";
}

function isVirtualAccount(account: LedgerAccount) {
  return Boolean(account.virtual);
}

export function AssetsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["accounts", "withVirtual"],
    queryFn: () => apiGet<LedgerAccount[]>("/api/accounts?includeVirtual=true")
  });
  const accounts = useMemo(() => data ?? [], [data]);
  const [assetMode, setAssetMode] = useState<"asset" | "liability">("asset");
  const [trendOpen, setTrendOpen] = useState(false);
  const [includePanelOpen, setIncludePanelOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [included, setIncluded] = useState(() => new Set<string>());
  const [orderedAccountIds, setOrderedAccountIds] = useState<string[]>([]);
  const [editingAccount, setEditingAccount] = useState<LedgerAccount | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const saveIncludedMutation = useMutation({
    mutationFn: (accountIds: string[]) => apiPut<{ accountIds: string[] }>("/api/accounts/include-in-assets", { accountIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setIncludePanelOpen(false);
    }
  });
  const reorderAccountsMutation = useMutation({
    mutationFn: (accountIds: string[]) => apiPut<{ accountIds: string[] }>("/api/accounts/reorder", { accountIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setSortPanelOpen(false);
    }
  });
  const saveAccountMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...draft,
        initialBalance: Number(draft.initialBalance || 0),
        icon: draft.icon || pickIcon(draft.type)
      };
      if (editingAccount) return apiPut<LedgerAccount>(`/api/accounts/${editingAccount.id}`, body);
      return apiPost<LedgerAccount>("/api/accounts", body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditorOpen(false);
      setEditingAccount(null);
      setDraft(emptyDraft);
    }
  });
  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string; deleted: boolean }>(`/api/accounts/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditorOpen(false);
      setEditingAccount(null);
      setDraft(emptyDraft);
    }
  });

  useEffect(() => {
    if (data) {
      setIncluded(new Set(data.filter((account) => account.includeInAssets).map((account) => account.id)));
      setOrderedAccountIds(data.filter((account) => !isVirtualAccount(account)).map((account) => account.id));
    }
  }, [data]);

  const assetTotal = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => (included.has(account.id) && account.kind === "asset" ? sum + Number(account.balance) : sum),
        0
      ),
    [accounts, included]
  );
  const liabilityTotal = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => (included.has(account.id) && account.kind === "liability" ? sum + Math.abs(Number(account.balance)) : sum),
        0
      ),
    [accounts, included]
  );
  const netTotal = assetTotal - liabilityTotal;
  const visibleAccounts = accounts.filter((account) => account.kind === assetMode && account.includeInAssets);
  const sortableAccounts = useMemo(() => {
    const accountById = new Map(accounts.filter((account) => !isVirtualAccount(account)).map((account) => [account.id, account]));
    return orderedAccountIds.map((id) => accountById.get(id)).filter((account): account is LedgerAccount => Boolean(account));
  }, [accounts, orderedAccountIds]);

  function toggleAccount(id: string) {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closeIncludePanel() {
    setIncluded(new Set(accounts.filter((account) => account.includeInAssets).map((account) => account.id)));
    setIncludePanelOpen(false);
  }

  function openSortPanel() {
    setOrderedAccountIds(accounts.filter((account) => !isVirtualAccount(account)).map((account) => account.id));
    setSortPanelOpen(true);
  }

  function moveAccount(id: string, direction: -1 | 1) {
    setOrderedAccountIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const currentId = next[index];
      const targetId = next[nextIndex];
      if (!currentId || !targetId) return current;
      next[index] = targetId;
      next[nextIndex] = currentId;
      return next;
    });
  }

  function openEditor(account?: LedgerAccount) {
    setEditingAccount(account ?? null);
    setDraft(account ? draftFromAccount(account) : emptyDraft);
    setEditorOpen(true);
  }

  function openAccountDetail(account: LedgerAccount) {
    if (!account.virtual) {
      navigate(`/assets/accounts/${account.id}`);
      return;
    }
    const groupQuery = account.loanGroupId ? `?groupId=${encodeURIComponent(account.loanGroupId)}` : "";
    navigate(`/loans${groupQuery}`);
  }

  function archiveAccount() {
    if (!editingAccount) return;
    setConfirmDialog({
      title: "归档账户",
      message: `确认归档账户“${editingAccount.name}”？历史账单仍会保留。`,
      confirmLabel: "归档",
      tone: "danger",
      onConfirm: () => {
        const accountId = editingAccount.id;
        setConfirmDialog(null);
        deleteAccountMutation.mutate(accountId);
      }
    });
  }

  function updateDraft(patch: Partial<AccountDraft>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.type && !patch.icon) next.icon = pickIcon(patch.type);
      return next;
    });
  }

  const canSave = draft.name.trim() && Number.isFinite(Number(draft.initialBalance));

  return (
    <section className="asset-page">
      <div className="asset-page__fixed">
        <header className="section-header">
          <div className="asset-switch">
            <button className={assetMode === "asset" ? "is-active" : ""} type="button" onClick={() => setAssetMode("asset")}>
              资产
            </button>
            <button className={assetMode === "liability" ? "is-active" : ""} type="button" onClick={() => setAssetMode("liability")}>
              负债
            </button>
          </div>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="选择计入资产的账户" onClick={() => setIncludePanelOpen(true)}>
              <Settings aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" aria-label="账户排序" onClick={openSortPanel}>
              <ArrowUpDown aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" aria-label="新增账户" onClick={() => openEditor()}>
              <Plus aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" aria-label="资产趋势" onClick={() => setTrendOpen(true)}>
              <LineChart aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="asset-total">
          <span>{assetMode === "asset" ? "资产" : "负债"}</span>
          <strong>¥{formatMoney(assetMode === "asset" ? assetTotal : liabilityTotal)}</strong>
          <Eye aria-hidden="true" />
          <small>净资产 ¥{formatMoney(netTotal)}</small>
        </div>
      </div>

      <div className="asset-page__scroll">
        {isLoading ? <p className="empty-state">正在读取账户...</p> : null}
        {isError ? (
          <div className="state-panel">
            <p>账户读取失败，请检查后端服务。</p>
            <button type="button" onClick={() => void refetch()}>
              重试
            </button>
          </div>
        ) : null}

        <div className="account-list">
          {!isLoading && !isError && visibleAccounts.length === 0 ? <p className="empty-state">暂无{assetMode === "asset" ? "资产" : "负债"}账户</p> : null}
          {visibleAccounts.map((account) => (
            <button
              className={`account-card ${account.virtual ? "account-card--virtual" : ""}`}
              key={account.id}
              style={{ background: account.color }}
              type="button"
              onClick={() => openAccountDetail(account)}
            >
              <CategoryIcon color="rgba(255,255,255,0.24)" icon={account.icon} size="sm" />
              <div>
                <strong>{account.name}</strong>
                <span>{account.virtual ? "借贷应收汇总" : account.kind === "asset" ? "资产账户余额" : "负债账户余额"}</span>
              </div>
              <b>{formatMoney(Number(account.balance))}</b>
            </button>
          ))}
        </div>
      </div>

      {includePanelOpen ? (
        <div className="sheet-backdrop" onClick={closeIncludePanel}>
          <section className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <header>
              <button type="button" onClick={closeIncludePanel}>
                取消
              </button>
              <strong>计入资产</strong>
              <button type="button" disabled={saveIncludedMutation.isPending} onClick={() => saveIncludedMutation.mutate(Array.from(included))}>
                {saveIncludedMutation.isPending ? "保存中" : "完成"}
              </button>
            </header>
            {saveIncludedMutation.error ? <p className="form-error">{saveIncludedMutation.error.message}</p> : null}
            <div className="sheet-list">
              {accounts.map((account) => (
                <button key={account.id} type="button" onClick={() => toggleAccount(account.id)}>
                  <span>{account.name}</span>
                  {included.has(account.id) ? <Check aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {sortPanelOpen ? (
        <div className="sheet-backdrop" onClick={() => setSortPanelOpen(false)}>
          <section className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <header>
              <button type="button" onClick={() => setSortPanelOpen(false)}>
                取消
              </button>
              <strong>账户排序</strong>
              <button
                type="button"
                disabled={reorderAccountsMutation.isPending}
                onClick={() => reorderAccountsMutation.mutate(orderedAccountIds)}
              >
                {reorderAccountsMutation.isPending ? "保存中" : "完成"}
              </button>
            </header>
            {reorderAccountsMutation.error ? <p className="form-error">{reorderAccountsMutation.error.message}</p> : null}
            <div className="account-sort-list">
              {sortableAccounts.map((account, index) => (
                <div className="account-sort-row" key={account.id}>
                  <span className="account-sort-row__handle">{index + 1}</span>
                  <CategoryIcon color={account.color} icon={account.icon} size="sm" />
                  <div>
                    <strong>{account.name}</strong>
                    <small>{account.kind === "asset" ? "资产账户" : "负债账户"}</small>
                  </div>
                  <div className="account-sort-row__actions">
                    <button type="button" disabled={index === 0} aria-label={`${account.name} 上移`} onClick={() => moveAccount(account.id, -1)}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sortableAccounts.length - 1}
                      aria-label={`${account.name} 下移`}
                      onClick={() => moveAccount(account.id, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
              {!sortableAccounts.length ? <p className="empty-state">暂无可排序账户</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {editorOpen ? (
        <BottomSheet title={editingAccount ? "编辑账户" : "新增账户"} onClose={() => setEditorOpen(false)}>
          {saveAccountMutation.error ? <div className="form-error">{saveAccountMutation.error.message}</div> : null}
          {deleteAccountMutation.error ? <div className="form-error">{deleteAccountMutation.error.message}</div> : null}
          <div className="sheet-form">
            <label className="sheet-field">
              名称
              <input value={draft.name} placeholder="账户名称" onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>

            <label className="sheet-field">
              类型
              <select value={draft.type} onChange={(event) => updateDraft({ type: event.target.value })}>
                {accountTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="segmented">
              <button type="button" aria-selected={draft.kind === "asset"} onClick={() => updateDraft({ kind: "asset" })}>
                资产
              </button>
              <button type="button" aria-selected={draft.kind === "liability"} onClick={() => updateDraft({ kind: "liability" })}>
                负债
              </button>
            </div>

            <label className="sheet-field">
              初始余额
              <input
                inputMode="decimal"
                value={draft.initialBalance}
                placeholder="0.00"
                onChange={(event) => updateDraft({ initialBalance: event.target.value })}
              />
            </label>

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
              disabled={!canSave || saveAccountMutation.isPending}
              type="button"
              onClick={() => saveAccountMutation.mutate()}
            >
              <Pencil aria-hidden="true" />
              {saveAccountMutation.isPending ? "保存中" : "保存账户"}
            </button>

            {editingAccount ? (
              <button
                className="danger-outline-action full-width-action"
                disabled={deleteAccountMutation.isPending}
                type="button"
                onClick={archiveAccount}
              >
                <Trash2 aria-hidden="true" />
                {deleteAccountMutation.isPending ? "归档中" : "归档账户"}
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}

      {trendOpen ? (
        <BottomSheet title="资产趋势" onClose={() => setTrendOpen(false)}>
          <div className="sheet-form">
            <div className="report-row">
              <strong>资产合计</strong>
              <b>¥{formatMoney(assetTotal)}</b>
            </div>
            <div className="report-row">
              <strong>负债合计</strong>
              <b>¥{formatMoney(liabilityTotal)}</b>
            </div>
            <div className="report-row">
              <strong>净资产</strong>
              <b>¥{formatMoney(netTotal)}</b>
            </div>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
