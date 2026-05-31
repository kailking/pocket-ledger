import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, PencilLine, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { apiDelete, apiGet } from "../lib/api";
import { absoluteMoney } from "../lib/format";
import type { LedgerTransaction } from "../lib/ledgerStore";

interface DeleteResult {
  id?: string;
  deleted?: boolean;
}

function typeLabel(type: LedgerTransaction["type"]): string {
  if (type === "income") return "收入";
  if (type === "expense") return "支出";
  if (type === "transfer") return "转账";
  if (type === "loan") return "借贷";
  return "余额调整";
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const {
    data: transaction,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["transactions", id],
    enabled: Boolean(id),
    queryFn: () => apiGet<LedgerTransaction>(`/api/transactions/${id}`)
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiDelete<DeleteResult>(`/api/transactions/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] })
      ]);
      navigate("/");
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "删除失败");
      setConfirmOpen(false);
    }
  });
  const displayAmount = transaction?.displayAmount ?? transaction?.transferAmount ?? transaction?.amount ?? "0.00";

  return (
    <main className="detail-page">
      <header className="section-header">
        <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong>账单详情</strong>
        <button className="icon-button" type="button" onClick={() => setConfirmOpen(true)} aria-label="删除账单" disabled={!transaction}>
          <Trash2 aria-hidden="true" />
        </button>
      </header>

      {isLoading ? <p className="empty-state">正在读取账单...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>账单读取失败，请稍后重试。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}
      {!isLoading && !isError && !transaction ? <p className="empty-state">没有找到这笔账单。</p> : null}

      {transaction ? (
        <>
          <section className="detail-hero">
            <CategoryIcon color={transaction.color} icon={transaction.icon} label={transaction.category} size="lg" />
            <span>{typeLabel(transaction.type)}</span>
            <strong className={transaction.type === "income" ? "money-income" : transaction.type === "transfer" ? "money-transfer" : ""}>
              {transaction.type === "expense" ? "-" : ""}
              {absoluteMoney(displayAmount)}
            </strong>
          </section>

          {notice ? <div className="form-error">{notice}</div> : null}

          <section className="detail-list" aria-label="账单信息">
            <div>
              <span>金额</span>
              <b>{absoluteMoney(displayAmount)}</b>
            </div>
            <div>
              <span>分类</span>
              <b>{transaction.category}</b>
            </div>
            <div>
              <span>日期</span>
              <b>{transaction.happenedOn}</b>
            </div>
            <div>
              <span>账户</span>
              <b>{transaction.account}</b>
            </div>
            <div>
              <span>成员</span>
              <b>{transaction.member ?? "我"}</b>
            </div>
            <div>
              <span>备注</span>
              <b>{transaction.note || "无"}</b>
            </div>
            <div>
              <span>编号</span>
              <b>{transaction.id}</b>
            </div>
          </section>

          <div className="detail-actions">
            <Link className="primary-action" to={`/entry/${transaction.id}`}>
              <PencilLine aria-hidden="true" />
              编辑
            </Link>
            <button className="danger-outline-action" type="button" onClick={() => setConfirmOpen(true)}>
              <Trash2 aria-hidden="true" />
              删除
            </button>
          </div>
        </>
      ) : null}

      {confirmOpen ? (
        <BottomSheet title="删除账单" confirmLabel="关闭" onClose={() => setConfirmOpen(false)}>
          <div className="confirm-panel">
            <p>删除后将无法在前端恢复，请确认这笔账单不再需要。</p>
            <button
              className="danger-action"
              disabled={deleteMutation.isPending}
              type="button"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </main>
  );
}
