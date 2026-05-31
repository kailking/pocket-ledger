import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BanknoteArrowDown, Check, HandCoins, Plus, ReceiptText, RotateCcw, Trash2 } from "lucide-react";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { LedgerAccount } from "../lib/ledgerStore";

type LoanStatusFilter = "open" | "closed" | "all";
type LoanDirection = "receivable" | "payable";
type LoanEntryType = "principal" | "repayment" | "additional" | "interest";
type EntryAction = Exclude<LoanEntryType, "principal">;

type LoanEntry = {
  id: string;
  type: LoanEntryType;
  amount: string;
  accountId: string | null;
  accountName: string | null;
  happenedOn: string;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
};

type LoanSummary = {
  id: string;
  direction: LoanDirection;
  counterparty: string;
  principalAmount: string;
  remainingAmount: string;
  interestAmount: string;
  accountId: string | null;
  accountName: string | null;
  happenedOn: string;
  dueOn: string | null;
  status: "open" | "closed";
  note: string | null;
};

type LoanDetail = LoanSummary & {
  entries: LoanEntry[];
};

type LoanDraft = {
  direction: LoanDirection;
  counterparty: string;
  principalAmount: string;
  accountId: string;
  happenedOn: string;
  dueOn: string;
  note: string;
};

type EntryDraft = {
  type: EntryAction;
  amount: string;
  interestAmount: string;
  accountId: string;
  happenedOn: string;
  note: string;
};

const statusLabels: Record<LoanStatusFilter, string> = {
  open: "未完成",
  closed: "已完成",
  all: "全部"
};

const directionLabels: Record<LoanDirection, string> = {
  receivable: "应收账",
  payable: "应付账"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function directionLabel(direction: LoanDirection) {
  return direction === "receivable" ? "借出" : "借入";
}

function entryLabel(direction: LoanDirection, type: LoanEntryType) {
  if (type === "principal") return direction === "receivable" ? "借出" : "借入";
  if (type === "additional") return direction === "receivable" ? "追加借出" : "追加借入";
  if (type === "interest") return direction === "receivable" ? "利息收入" : "利息支出";
  return direction === "receivable" ? "收款" : "还款";
}

function entryTitle(direction: LoanDirection, type: EntryAction) {
  if (type === "additional") return direction === "receivable" ? "追加借出" : "追加借入";
  if (type === "interest") return direction === "receivable" ? "记录利息收入" : "记录利息支出";
  return direction === "receivable" ? "收款" : "还款";
}

function makeLoanDraft(direction: LoanDirection, accountId: string): LoanDraft {
  return {
    direction,
    counterparty: "",
    principalAmount: "",
    accountId,
    happenedOn: today(),
    dueOn: "",
    note: ""
  };
}

function makeEntryDraft(type: EntryAction, accountId: string): EntryDraft {
  return {
    type,
    amount: "",
    interestAmount: "",
    accountId,
    happenedOn: today(),
    note: ""
  };
}

export function LoansPage() {
  const [direction, setDirection] = useState<LoanDirection>("receivable");
  const [status, setStatus] = useState<LoanStatusFilter>("open");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [draft, setDraft] = useState<LoanDraft>(() => makeLoanDraft("receivable", ""));
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", "withVirtual"],
    queryFn: () => apiGet<LedgerAccount[]>("/api/accounts?includeVirtual=true")
  });
  const realAccounts = accounts.filter((account) => !account.virtual);
  const defaultAccountId = realAccounts[0]?.id ?? "";
  const hasVirtualReceivable = accounts.some((account) => account.id === "virtual_receivable" && account.includeInAssets);

  const { data: summaryLoans = [] } = useQuery({
    queryKey: ["loans", "summary"],
    queryFn: () => apiGet<LoanSummary[]>("/api/loans?status=open&direction=all")
  });
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans", status, direction],
    queryFn: () => apiGet<LoanSummary[]>(`/api/loans?status=${status}&direction=${direction}`)
  });
  const { data: selectedLoan } = useQuery({
    queryKey: ["loans", selectedLoanId],
    queryFn: () => apiGet<LoanDetail>(`/api/loans/${selectedLoanId}`),
    enabled: Boolean(selectedLoanId)
  });

  const summary = useMemo(() => {
    return summaryLoans.reduce(
      (totals, loan) => {
        const amount = Number(loan.remainingAmount);
        if (loan.direction === "receivable") totals.receivable += amount;
        else totals.payable += amount;
        return totals;
      },
      { receivable: 0, payable: 0 }
    );
  }, [summaryLoans]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<LoanDetail>("/api/loans", {
        ...draft,
        accountId: draft.accountId || defaultAccountId,
        principalAmount: Number(draft.principalAmount),
        dueOn: draft.dueOn || undefined
      }),
    onSuccess: async (loan) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
      setDirection(loan.direction);
      setSelectedLoanId(loan.id);
      setEditorOpen(false);
      setDraft(makeLoanDraft(loan.direction, defaultAccountId));
    }
  });

  const entryMutation = useMutation({
    mutationFn: async (payload: EntryDraft) => {
      if (!selectedLoanId) throw new Error("请先选择借贷记录");
      const accountId = payload.accountId || defaultAccountId;
      const amount = Number(payload.amount || 0);
      const interestAmount = Number(payload.interestAmount || 0);

      if (payload.type === "repayment" && amount <= 0 && interestAmount <= 0) {
        throw new Error("请填写收款/还款金额");
      }
      if (payload.type !== "repayment" && amount <= 0) {
        throw new Error("请填写金额");
      }

      let nextDetail: LoanDetail | undefined;
      if (amount > 0) {
        nextDetail = await apiPost<LoanDetail>(`/api/loans/${selectedLoanId}/entries`, {
          type: payload.type,
          amount,
          accountId,
          happenedOn: payload.happenedOn,
          note: payload.note || undefined
        });
      }
      if (payload.type === "repayment" && interestAmount > 0) {
        nextDetail = await apiPost<LoanDetail>(`/api/loans/${selectedLoanId}/entries`, {
          type: "interest",
          amount: interestAmount,
          accountId,
          happenedOn: payload.happenedOn,
          note: payload.note || undefined
        });
      }
      return nextDetail ?? apiGet<LoanDetail>(`/api/loans/${selectedLoanId}`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
      setEntryDraft(null);
    }
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => apiPost<LoanSummary>(`/api/loans/${id}/close`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
    }
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => apiPost<LoanSummary>(`/api/loans/${id}/reopen`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
    }
  });

  const deleteLoanMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ id: string; deleted: boolean }>(`/api/loans/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
      setSelectedLoanId(null);
    }
  });

  const deleteEntryMutation = useMutation({
    mutationFn: ({ loanId, entryId }: { loanId: string; entryId: string }) =>
      apiDelete<{ id: string; deleted: boolean }>(`/api/loans/${loanId}/entries/${entryId}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    }
  });

  function openCreate(nextDirection: LoanDirection) {
    setDraft(makeLoanDraft(nextDirection, defaultAccountId));
    setEditorOpen(true);
  }

  function openEntry(type: EntryAction) {
    setEntryDraft(makeEntryDraft(type, selectedLoan?.accountId ?? defaultAccountId));
  }

  function confirmDeleteLoan(loan: LoanDetail) {
    setConfirmDialog({
      title: "删除借贷记录",
      message: `确认删除与 ${loan.counterparty} 的${directionLabel(loan.direction)}记录？关联账户流水会同步删除。`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        deleteLoanMutation.mutate(loan.id);
      }
    });
  }

  function confirmDeleteEntry(loan: LoanDetail, entry: LoanEntry) {
    if (entry.type === "principal") return;
    setConfirmDialog({
      title: "删除明细记录",
      message: `确认删除这条${entryLabel(loan.direction, entry.type)}记录？账户余额会同步回退。`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        deleteEntryMutation.mutate({ loanId: loan.id, entryId: entry.id });
      }
    });
  }

  const canSubmit =
    draft.counterparty.trim() &&
    Number(draft.principalAmount) > 0 &&
    draft.happenedOn &&
    (draft.accountId || defaultAccountId);
  const entryCanSubmit =
    entryDraft &&
    (entryDraft.accountId || defaultAccountId) &&
    (Number(entryDraft.amount || 0) > 0 || (entryDraft.type === "repayment" && Number(entryDraft.interestAmount || 0) > 0));

  return (
    <section className="loan-page">
      <div className="loan-page__fixed">
        <header className="loan-hero">
          <div className="loan-topline">
            <div className="loan-direction-tabs">
              {(Object.keys(directionLabels) as LoanDirection[]).map((item) => (
                <button key={item} className={direction === item ? "is-active" : ""} type="button" onClick={() => setDirection(item)}>
                  {directionLabels[item]}
                </button>
              ))}
            </div>
            <div className="loan-status-tabs">
              {(Object.keys(statusLabels) as LoanStatusFilter[]).map((item) => (
                <button key={item} className={status === item ? "is-active" : ""} type="button" onClick={() => setStatus(item)}>
                  {statusLabels[item]}
                </button>
              ))}
            </div>
          </div>
          <span>{direction === "receivable" ? "应收总额" : "应付总额"}</span>
          <strong className={direction === "receivable" && !hasVirtualReceivable ? "loan-hero__amount--muted" : undefined}>
            {direction === "receivable" && !hasVirtualReceivable ? "未启用" : `¥${formatMoney(direction === "receivable" ? summary.receivable : summary.payable)}`}
          </strong>
          <small>
            {direction === "receivable" && !hasVirtualReceivable
              ? "后端未返回应收账虚拟账户，暂不突出应收总额，借贷列表仍可正常查看"
              : direction === "receivable"
                ? "借出后账户扣款，收款后账户增加"
                : "借入后账户增加，还款后账户扣款"}
          </small>
        </header>
      </div>

      <div className="loan-page__scroll">
        <div className="loan-list">
          {isLoading ? <p className="empty-state">正在读取借贷记录...</p> : null}
          {!isLoading && !loans.length ? <p className="empty-state">暂无{directionLabels[direction]}记录</p> : null}
          {loans.map((loan) => (
            <button
              className={`loan-row ${status === "all" && loan.status === "closed" ? "loan-row--closed" : ""}`}
              key={loan.id}
              type="button"
              onClick={() => setSelectedLoanId(loan.id)}
            >
              <span className="loan-row__date">{formatDate(loan.happenedOn)}</span>
              <span className={`loan-row__badge loan-row__badge--${loan.direction}`}>
                {loan.direction === "receivable" ? <HandCoins aria-hidden="true" /> : <ReceiptText aria-hidden="true" />}
                {directionLabel(loan.direction)}
              </span>
              <span className="loan-row__content">
                <strong>{loan.counterparty}</strong>
                <small>
                  {loan.accountName ? `${loan.accountName} · ` : ""}
                  {loan.dueOn ? `${loan.dueOn} 到期 · ` : ""}
                  {loan.note || "无备注"}
                </small>
              </span>
              <b className={loan.direction === "receivable" ? "money-income" : "money-danger"}>¥{formatMoney(Number(loan.remainingAmount))}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="loan-footer-actions">
        <button className="secondary-action loan-payable-action" type="button" onClick={() => openCreate("payable")}>
          <BanknoteArrowDown aria-hidden="true" />
          新增借入
        </button>
        <button className="primary-action" type="button" onClick={() => openCreate("receivable")}>
          <Plus aria-hidden="true" />
          新增借出
        </button>
      </div>

      {editorOpen ? (
        <BottomSheet
          title={draft.direction === "receivable" ? "新增借出" : "新增借入"}
          confirmLabel={createMutation.isPending ? "保存中" : "完成"}
          confirmDisabled={!canSubmit || createMutation.isPending}
          onClose={() => setEditorOpen(false)}
          onConfirm={() => createMutation.mutate()}
        >
          {createMutation.error ? <p className="form-error">{createMutation.error.message}</p> : null}
          <div className="sheet-form">
            <div className="segmented">
              <button
                type="button"
                aria-selected={draft.direction === "receivable"}
                onClick={() => setDraft((current) => ({ ...current, direction: "receivable" }))}
              >
                借出
              </button>
              <button
                type="button"
                aria-selected={draft.direction === "payable"}
                onClick={() => setDraft((current) => ({ ...current, direction: "payable" }))}
              >
                借入
              </button>
            </div>

            <label className="sheet-field">
              对方名称
              <input
                value={draft.counterparty}
                placeholder="姓名或机构"
                onChange={(event) => setDraft((current) => ({ ...current, counterparty: event.target.value }))}
              />
            </label>

            <label className="sheet-field">
              金额
              <input
                inputMode="decimal"
                value={draft.principalAmount}
                placeholder="0.00"
                onChange={(event) => setDraft((current) => ({ ...current, principalAmount: event.target.value }))}
              />
            </label>

            <label className="sheet-field">
              使用账户
              <select value={draft.accountId || defaultAccountId} onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}>
                {realAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="sheet-field">
              日期
              <input
                type="date"
                value={draft.happenedOn}
                onChange={(event) => setDraft((current) => ({ ...current, happenedOn: event.target.value }))}
              />
            </label>

            <label className="sheet-field">
              {draft.direction === "receivable" ? "收款日" : "还款日"}
              <input type="date" value={draft.dueOn} onChange={(event) => setDraft((current) => ({ ...current, dueOn: event.target.value }))} />
            </label>

            <label className="sheet-field">
              备注
              <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </label>
          </div>
        </BottomSheet>
      ) : null}

      {selectedLoan ? (
        <BottomSheet title={`${directionLabel(selectedLoan.direction)}详情`} confirmLabel="关闭" onClose={() => setSelectedLoanId(null)}>
          <div className="loan-detail">
            <section className={`loan-detail__hero loan-detail__hero--${selectedLoan.direction}`}>
              <span>{selectedLoan.direction === "receivable" ? "剩余欠款" : "剩余应还"}</span>
              <strong>¥{formatMoney(Number(selectedLoan.remainingAmount))}</strong>
              <div>
                <span>利息 {formatMoney(Number(selectedLoan.interestAmount))}</span>
                <span>本金 {formatMoney(Number(selectedLoan.principalAmount))}</span>
              </div>
            </section>

            <div className="detail-list">
              <div>
                <span>对方名称</span>
                <b>{selectedLoan.counterparty}</b>
              </div>
              <div>
                <span>使用账户</span>
                <b>{selectedLoan.accountName ?? "未关联"}</b>
              </div>
              <div>
                <span>时间</span>
                <b>{selectedLoan.happenedOn}</b>
              </div>
              <div>
                <span>{selectedLoan.direction === "receivable" ? "收款日" : "还款日"}</span>
                <b>{selectedLoan.dueOn ?? "未设置"}</b>
              </div>
              <div>
                <span>备注</span>
                <b>{selectedLoan.note ?? "无"}</b>
              </div>
            </div>

            <div className="loan-detail__actions">
              <button className="primary-action" type="button" onClick={() => openEntry("repayment")}>
                <Check aria-hidden="true" />
                {selectedLoan.direction === "receivable" ? "收款" : "还款"}
              </button>
              <button className="secondary-action" type="button" onClick={() => openEntry("additional")}>
                <Plus aria-hidden="true" />
                追加
              </button>
              <button className="secondary-action" type="button" onClick={() => openEntry("interest")}>
                <ReceiptText aria-hidden="true" />
                利息
              </button>
              {selectedLoan.status === "open" ? (
                <button
                  className="secondary-action"
                  type="button"
                  disabled={Number(selectedLoan.remainingAmount) > 0 || closeMutation.isPending}
                  onClick={() => closeMutation.mutate(selectedLoan.id)}
                >
                  <Check aria-hidden="true" />
                  结清
                </button>
              ) : (
                <button className="secondary-action" type="button" onClick={() => reopenMutation.mutate(selectedLoan.id)}>
                  <RotateCcw aria-hidden="true" />
                  重开
                </button>
              )}
            </div>

            <section className="loan-entry-list">
              <h3>{selectedLoan.direction === "receivable" ? "收款记录" : "还款记录"}</h3>
              {selectedLoan.entries.map((entry) => (
                <button
                  className="loan-entry-row"
                  key={entry.id}
                  type="button"
                  disabled={entry.type === "principal" || deleteEntryMutation.isPending}
                  onClick={() => confirmDeleteEntry(selectedLoan, entry)}
                >
                  <span>
                    <strong>{entryLabel(selectedLoan.direction, entry.type)}</strong>
                    <small>
                      {entry.happenedOn}
                      {entry.accountName ? ` · ${entry.accountName}` : ""}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </small>
                  </span>
                  <b>{formatMoney(Number(entry.amount))}</b>
                </button>
              ))}
            </section>

            <button className="danger-outline-action full-width-action" type="button" onClick={() => confirmDeleteLoan(selectedLoan)}>
              <Trash2 aria-hidden="true" />
              删除借贷记录
            </button>
          </div>
        </BottomSheet>
      ) : null}

      {selectedLoan && entryDraft ? (
        <BottomSheet
          title={entryTitle(selectedLoan.direction, entryDraft.type)}
          confirmLabel={entryMutation.isPending ? "保存中" : "完成"}
          confirmDisabled={!entryCanSubmit || entryMutation.isPending}
          onClose={() => setEntryDraft(null)}
          onConfirm={() => entryMutation.mutate(entryDraft)}
        >
          {entryMutation.error ? <p className="form-error">{entryMutation.error.message}</p> : null}
          <div className="sheet-form">
            <label className="sheet-field">
              {entryDraft.type === "repayment" ? (selectedLoan.direction === "receivable" ? "收款金额" : "还款金额") : "金额"}
              <input
                autoFocus
                inputMode="decimal"
                value={entryDraft.amount}
                placeholder="0.00"
                onChange={(event) => setEntryDraft((current) => (current ? { ...current, amount: event.target.value } : current))}
              />
            </label>
            {entryDraft.type === "repayment" ? (
              <label className="sheet-field">
                {selectedLoan.direction === "receivable" ? "利息收入" : "利息支出"}
                <input
                  inputMode="decimal"
                  value={entryDraft.interestAmount}
                  placeholder="0.00"
                  onChange={(event) => setEntryDraft((current) => (current ? { ...current, interestAmount: event.target.value } : current))}
                />
              </label>
            ) : null}
            <label className="sheet-field">
              使用账户
              <select
                value={entryDraft.accountId || defaultAccountId}
                onChange={(event) => setEntryDraft((current) => (current ? { ...current, accountId: event.target.value } : current))}
              >
                {realAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sheet-field">
              时间
              <input
                type="date"
                value={entryDraft.happenedOn}
                onChange={(event) => setEntryDraft((current) => (current ? { ...current, happenedOn: event.target.value } : current))}
              />
            </label>
            <label className="sheet-field">
              备注
              <input value={entryDraft.note} onChange={(event) => setEntryDraft((current) => (current ? { ...current, note: event.target.value } : current))} />
            </label>
          </div>
        </BottomSheet>
      ) : null}

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </section>
  );
}
