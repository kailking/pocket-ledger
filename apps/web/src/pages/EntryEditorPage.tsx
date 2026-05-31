import { useEffect, useMemo, useState } from "react";
import type { CategorySummary, EntryMode } from "@pocket-ledger/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, PencilLine, UserRoundPlus, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AmountKeyboard } from "../components/AmountKeyboard";
import { BottomSheet } from "../components/BottomSheet";
import { CategoryGrid } from "../components/CategoryGrid";
import { CategoryIcon } from "../components/CategoryIcon";
import { SegmentedControl } from "../components/SegmentedControl";
import { queryClient } from "../app/queryClient";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { type LedgerAccount, type LedgerTransaction, members } from "../lib/ledgerStore";

function evaluateAmount(input: string): number {
  const parts = input.match(/[+-]?(\d+(\.\d*)?|\.\d+)/g);
  if (!parts) return 0;
  return parts.reduce((total, part) => total + Number(part), 0);
}

function nextAmountInput(current: string, key: string): string {
  if (key === "C") return "0";
  if (key === "⌫") return current.length > 1 ? current.slice(0, -1) : "0";
  if (/^\d$/.test(key)) return current === "0" ? key : `${current}${key}`;
  if (key === ".") {
    const tail = current.split(/[+-]/).pop() ?? "";
    return tail.includes(".") ? current : `${current}.`;
  }
  if (key === "+" || key === "-") {
    return /[+\-.]$/.test(current) ? current : `${current}${key}`;
  }
  return current;
}

interface SaveResult {
  id?: string;
  module?: string;
  status?: string;
}

function isScaffolded(result: SaveResult): boolean {
  return result.status === "scaffolded";
}

function amountInputFromTransaction(amount: string): string {
  const value = Math.abs(Number(amount));
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : "0";
}

export function EntryEditorPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(editId);
  const queryDate = searchParams.get("date");
  const queryAccountId = searchParams.get("accountId");
  const { data: categoryData, isError: isCategoryError } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<CategorySummary[]>("/api/categories")
  });
  const { data: accountData, isError: isAccountError } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<LedgerAccount[]>("/api/accounts")
  });
  const {
    data: transactionData,
    isLoading: isTransactionLoading,
    isError: isTransactionError
  } = useQuery({
    queryKey: ["transactions", editId],
    queryFn: () => apiGet<LedgerTransaction>(`/api/transactions/${editId}`),
    enabled: isEditing
  });
  const saveMutation = useMutation({
    mutationFn: (body: unknown) => {
      if (isEditing && editId) {
        return apiPut<SaveResult>(`/api/transactions/${editId}`, body);
      }
      return apiPost<SaveResult>("/api/transactions", body);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] })
      ]);
      if (isScaffolded(result)) {
        setError("编辑保存接口暂未接入，当前表单未写入后端。");
        return;
      }
      navigate(isEditing && editId ? `/transactions/${editId}` : "/");
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : "保存失败");
    }
  });
  const [mode, setMode] = useState<EntryMode>("expense");
  const [amountInput, setAmountInput] = useState("0");
  const [date, setDate] = useState(() =>
    queryDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? queryDate : new Date().toISOString().slice(0, 10)
  );
  const [accountId, setAccountId] = useState(queryAccountId || "alipay");
  const [member, setMember] = useState("我");
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<"date" | "account" | "member" | "note" | null>(null);
  const [error, setError] = useState("");
  const [selectedExpenseId, setSelectedExpenseId] = useState("");
  const [selectedIncomeId, setSelectedIncomeId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("cash");
  const [toAccountId, setToAccountId] = useState("alipay");
  const [accountTarget, setAccountTarget] = useState<"single" | "from" | "to">("single");
  const [loadedEditId, setLoadedEditId] = useState<string | null>(null);

  const accounts = useMemo(() => accountData ?? [], [accountData]);
  const selectedAccount = accounts.find((item) => item.id === accountId) ?? accounts[0];
  const fromAccount = accounts.find((item) => item.id === fromAccountId) ?? accounts[0];
  const toAccount = accounts.find((item) => item.id === toAccountId) ?? accounts.find((item) => item.id !== fromAccountId) ?? accounts[0];
  const expenseCategories = useMemo(
    () => (categoryData?.filter((category) => category.type === "expense" && category.id !== "transfer") ?? []) as CategorySummary[],
    [categoryData]
  );
  const incomeCategories = useMemo(
    () => (categoryData?.filter((category) => category.type === "income") ?? []) as CategorySummary[],
    [categoryData]
  );
  const categories = mode === "income" ? incomeCategories : expenseCategories;
  const selectedCategory = useMemo(() => {
    if (mode === "transfer") return undefined;
    const selectedId = mode === "income" ? selectedIncomeId : selectedExpenseId;
    return categories.find((category) => category.id === selectedId) ?? categories[0];
  }, [categories, mode, selectedExpenseId, selectedIncomeId]);

  const title = mode === "transfer" ? "转账" : selectedCategory?.name ?? "一般";
  const amountValue = Math.max(0, evaluateAmount(amountInput));
  const displayAmount = amountInput === "0" ? "0.00" : amountInput;
  const editingTransaction = transactionData;

  useEffect(() => {
    if (!accounts.length) return;
    if (!accounts.some((account) => account.id === accountId)) setAccountId(accounts[0]?.id ?? "");
    if (!accounts.some((account) => account.id === fromAccountId)) setFromAccountId(accounts[0]?.id ?? "");
    if (!accounts.some((account) => account.id === toAccountId)) {
      setToAccountId(accounts.find((account) => account.id !== fromAccountId)?.id ?? accounts[0]?.id ?? "");
    }
  }, [accountId, accounts, fromAccountId, toAccountId]);

  useEffect(() => {
    if (!isEditing || !editId || !editingTransaction || loadedEditId === editId) return;

    setDate(editingTransaction.happenedOn);
    setAmountInput(amountInputFromTransaction(editingTransaction.amount));
    setMember(editingTransaction.member ?? "我");
    setNote(editingTransaction.note ?? "");

    if (editingTransaction.type === "transfer") {
      const [fromName, toName] = editingTransaction.account.split(" -> ");
      const nextFromAccount = accounts.find((account) => account.name === fromName);
      const nextToAccount = accounts.find((account) => account.name === toName);
      setMode("transfer");
      if (editingTransaction.fromAccountId) setFromAccountId(editingTransaction.fromAccountId);
      else if (nextFromAccount) setFromAccountId(nextFromAccount.id);
      if (editingTransaction.toAccountId) setToAccountId(editingTransaction.toAccountId);
      else if (nextToAccount) setToAccountId(nextToAccount.id);
    } else {
      const nextMode = editingTransaction.type === "income" ? "income" : "expense";
      const nextAccount = accounts.find((account) => account.name === editingTransaction.account);
      const nextCategory = (nextMode === "income" ? incomeCategories : expenseCategories).find(
        (category) => category.name === editingTransaction.category
      );
      setMode(nextMode);
      if (editingTransaction.accountId) setAccountId(editingTransaction.accountId);
      else if (nextAccount) setAccountId(nextAccount.id);
      if (nextCategory && nextMode === "income") setSelectedIncomeId(nextCategory.id);
      if (nextCategory && nextMode === "expense") setSelectedExpenseId(nextCategory.id);
      if (editingTransaction.categoryId && nextMode === "income") setSelectedIncomeId(editingTransaction.categoryId);
      if (editingTransaction.categoryId && nextMode === "expense") setSelectedExpenseId(editingTransaction.categoryId);
    }

    setLoadedEditId(editId);
  }, [accounts, editId, editingTransaction, expenseCategories, incomeCategories, isEditing, loadedEditId]);

  function handleCategorySelect(category: CategorySummary) {
    if (category.type === "income") setSelectedIncomeId(category.id);
    if (category.type === "expense") setSelectedExpenseId(category.id);
  }

  function handleConfirm() {
    if (saveMutation.isPending) return;

    if (isAccountError || !accounts.length) {
      setError("账户读取失败，暂时不能保存账单");
      return;
    }

    if (mode !== "transfer" && (isCategoryError || !categories.length)) {
      setError("分类读取失败，暂时不能保存账单");
      return;
    }

    if (amountValue <= 0) {
      setError("请输入金额");
      return;
    }

    setError("");

    if (mode === "transfer") {
      if (fromAccountId === toAccountId) {
        setError("转出账户和转入账户不能相同");
        return;
      }

      saveMutation.mutate({
        type: "transfer",
        happenedOn: date,
        amount: amountValue,
        fromAccountId,
        toAccountId,
        member,
        note
      });
    } else {
      saveMutation.mutate({
        type: mode,
        happenedOn: date,
        amount: amountValue,
        categoryId: selectedCategory?.id,
        accountId,
        member,
        note
      });
    }
  }

  return (
    <main className="entry-page">
      <header className="entry-topbar">
        <SegmentedControl
          value={mode}
          options={[
            { label: "收入", value: "income" },
            { label: "支出", value: "expense" },
            { label: "转账", value: "transfer" }
          ]}
          onChange={(nextMode) => {
            setMode(nextMode);
            setError("");
          }}
        />
        <button className="icon-button" onClick={() => navigate(-1)} type="button" aria-label="关闭">
          <X aria-hidden="true" />
        </button>
      </header>

      <section className="entry-amount">
        <CategoryIcon
          color={mode === "transfer" ? "#8FD8F7" : selectedCategory?.color ?? "#8FD8F7"}
          icon={mode === "transfer" ? "banknote-arrow-down" : selectedCategory?.icon ?? "star"}
          size="lg"
        />
        <h1>{title}</h1>
        <strong>¥{displayAmount}</strong>
      </section>

      <div className="entry-body">
        {error ? <div className="form-error">{error}</div> : null}
        {isEditing && isTransactionLoading ? <p className="form-hint">正在读取账单...</p> : null}
        {isEditing && isTransactionError ? <div className="form-error">账单读取失败，请稍后重试。</div> : null}
        {isEditing && !isTransactionLoading && !editingTransaction ? (
          <div className="form-error">没有找到这笔账单，可能已被删除。</div>
        ) : null}
        {isCategoryError ? <div className="form-hint">分类读取失败，正在使用内置分类。</div> : null}
        {isAccountError ? <div className="form-hint">账户读取失败，正在使用内置账户。</div> : null}
        {saveMutation.isPending ? <p className="form-hint">正在保存...</p> : null}

        {mode === "transfer" ? (
          <div className="transfer-card">
            <button
              type="button"
              onClick={() => {
                setAccountTarget("from");
                setSheet("account");
              }}
            >
              <span>转出账户</span>
              <b>{fromAccount?.name}</b>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountTarget("to");
                setSheet("account");
              }}
            >
              <span>转入账户</span>
              <b>{toAccount?.name}</b>
            </button>
          </div>
        ) : (
          <CategoryGrid
            categories={categories}
            selectedId={selectedCategory?.id}
            onManage={() => navigate(`/categories?type=${mode}`)}
            onSelect={handleCategorySelect}
          />
        )}
      </div>

      <div className="entry-tools">
        <button type="button" onClick={() => setSheet("date")}>
          {date.slice(5).replace("-", "月")}日
        </button>
        <button type="button" onClick={() => {
          setAccountTarget(mode === "transfer" ? "from" : "single");
          setSheet("account");
        }}>
          {mode === "transfer" ? `${fromAccount?.name} -> ${toAccount?.name}` : selectedAccount?.name}
        </button>
        <button type="button" onClick={() => setSheet("member")} aria-label="选择成员">
          <UserRoundPlus aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setSheet("note")} aria-label="备注">
          <PencilLine aria-hidden="true" />
        </button>
      </div>

      <AmountKeyboard
        onKey={(key) => {
          if (key === "确定") {
            handleConfirm();
            return;
          }
          setAmountInput((current) => nextAmountInput(current, key));
        }}
      />

      {sheet === "date" ? (
        <BottomSheet title="选择日期" onClose={() => setSheet(null)}>
          <input className="sheet-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </BottomSheet>
      ) : null}

      {sheet === "account" ? (
        <BottomSheet title="选择账户" onClose={() => setSheet(null)}>
          <div className="sheet-list">
            {accounts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (mode === "transfer") {
                    if (accountTarget === "to") {
                      setToAccountId(item.id);
                    } else {
                      setFromAccountId(item.id);
                    }
                  } else {
                    setAccountId(item.id);
                  }
                  setSheet(null);
                }}
              >
                <span>{item.name}</span>
                {(mode !== "transfer" && accountId === item.id) ||
                (mode === "transfer" && accountTarget === "from" && fromAccountId === item.id) ||
                (mode === "transfer" && accountTarget === "to" && toAccountId === item.id) ? (
                  <Check aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "member" ? (
        <BottomSheet title="成员" onClose={() => setSheet(null)}>
          <div className="sheet-list">
            {members.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMember(item);
                  setSheet(null);
                }}
              >
                <span>{item}</span>
                {member === item ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "note" ? (
        <BottomSheet title="备注" onClose={() => setSheet(null)}>
          <textarea
            autoFocus
            className="sheet-note"
            placeholder="写点备注"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button className="attachment-button" type="button">
            <Camera aria-hidden="true" />
            图片附件后续接入
          </button>
        </BottomSheet>
      ) : null}
    </main>
  );
}
