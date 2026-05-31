import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Eraser } from "lucide-react";
import { Link } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { apiPost } from "../lib/api";

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

export function DataClearPage() {
  const [clearChecked, setClearChecked] = useState(false);
  const [clearText, setClearText] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
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
    <section className="data-page data-clear-page">
      <header className="detail-header">
        <Link className="icon-button" to="/more" aria-label="返回更多">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <strong>数据清理</strong>
        <span className="ledger-header__spacer" aria-hidden="true" />
      </header>

      <section className="danger-zone danger-zone--page">
        <div className="danger-zone__title">
          <Eraser aria-hidden="true" />
          <strong>清空当前账本数据</strong>
        </div>
        <p>执行前请先完成一次数据备份。清空后，账单、账户、分类、借贷、导入记录和备份记录会从当前数据库移除。</p>
        <label className="danger-zone__check">
          <input type="checkbox" checked={clearChecked} onChange={(event) => setClearChecked(event.target.checked)} />
          <span>我确认要清空所有数据</span>
        </label>
        <input
          className="danger-zone__input"
          value={clearText}
          placeholder="输入：清空所有数据"
          onChange={(event) => setClearText(event.target.value)}
        />
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

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </section>
  );
}
