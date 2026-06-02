import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, DatabaseBackup, Download, RotateCcw, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { SegmentedControl } from "../components/SegmentedControl";
import { apiGet, apiPost, apiPostForm } from "../lib/api";
import { formatMoney } from "../lib/format";

type DataTab = "import" | "backup";

interface ImportSummary {
  sheets: Array<{ name: string; rows: number }>;
  transactionRows: number;
  loanRows: number;
  dateRange: { from: string | null; to: string | null };
  accounts: string[];
  categories: string[];
  books: string[];
  members: string[];
  transferPairs: number;
  transferUnpairedRows: number;
}

interface ImportPreview {
  fileName: string;
  fileHash: string;
  summary: ImportSummary;
  warnings: Array<{ sheetName: string; rowNumber: number; level: string; message: string }>;
}

interface ImportBatch {
  id: string;
  rowsSuccess: number;
  rowsWarning: number;
  summary: ImportSummary;
}

interface BackupSummary {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  downloadPath: string;
}

interface RestoreResult {
  restoredFrom: string;
  safetyBackup: string;
  databasePath: string;
}

function buildFormData(file: File) {
  const form = new FormData();
  form.append("file", file);
  return form;
}

function formatBackupDateTime(value: string) {
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

function invalidateDataQueries() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["reports"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
    queryClient.invalidateQueries({ queryKey: ["loans"] })
  ]);
}

function SummaryGrid({ summary }: { summary: ImportSummary }) {
  return (
    <div className="data-summary">
      <div>
        <span>收支记录</span>
        <strong>{summary.transactionRows}</strong>
      </div>
      <div>
        <span>借贷记录</span>
        <strong>{summary.loanRows}</strong>
      </div>
      <div>
        <span>账户</span>
        <strong>{summary.accounts.length}</strong>
      </div>
      <div>
        <span>分类</span>
        <strong>{summary.categories.length}</strong>
      </div>
      <div>
        <span>转账配对</span>
        <strong>{summary.transferPairs}</strong>
      </div>
      <div>
        <span>未配对</span>
        <strong>{summary.transferUnpairedRows}</strong>
      </div>
    </div>
  );
}

export function DataToolsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "backup" ? "backup" : "import";
  const [activeTab, setActiveTab] = useState<DataTab>(initialTab);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const importsQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiGet<ImportBatch[]>("/api/imports")
  });
  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: () => apiGet<BackupSummary[]>("/api/backups")
  });
  const previewMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("请先选择口袋记账导出的 .xls 文件");
      return apiPostForm<ImportPreview>("/api/imports/pocket/preview", buildFormData(file));
    },
    onSuccess: (result) => {
      setPreview(result);
      setImportMessage("预览完成。确认数据范围无误后，可以执行清空并导入。");
    },
    onError: (error) => {
      setPreview(null);
      setImportMessage(error instanceof Error ? error.message : "导入预览失败");
    }
  });
  const commitMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("请先选择口袋记账导出的 .xls 文件");
      return apiPostForm<ImportBatch>("/api/imports/pocket/commit?mode=clear", buildFormData(file));
    },
    onSuccess: async (result) => {
      setImportMessage(`导入完成：成功 ${result.rowsSuccess} 行，警告 ${result.rowsWarning} 条。`);
      setPreview(null);
      await Promise.all([importsQuery.refetch(), invalidateDataQueries()]);
    },
    onError: (error) => {
      setImportMessage(error instanceof Error ? error.message : "导入提交失败");
    }
  });
  const createBackupMutation = useMutation({
    mutationFn: () => apiPost<BackupSummary>("/api/backups/create", {}),
    onSuccess: async (result) => {
      setBackupMessage(`备份已创建：${result.fileName}`);
      await backupsQuery.refetch();
    },
    onError: (error) => {
      setBackupMessage(error instanceof Error ? error.message : "创建备份失败");
    }
  });
  const restoreMutation = useMutation({
    mutationFn: (fileName: string) => apiPost<RestoreResult>("/api/backups/restore", { fileName }),
    onSuccess: async (result) => {
      setBackupMessage(`已从 ${result.restoredFrom} 恢复；恢复前留档为 ${result.safetyBackup}`);
      await Promise.all([backupsQuery.refetch(), importsQuery.refetch(), invalidateDataQueries()]);
    },
    onError: (error) => {
      setBackupMessage(error instanceof Error ? error.message : "恢复失败");
    }
  });

  function setTab(nextTab: DataTab) {
    setActiveTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

  function restoreBackup(fileName: string) {
    setConfirmDialog({
      title: "恢复备份",
      message: `确认恢复备份 ${fileName}？当前数据库会先自动备份一份。`,
      confirmLabel: "恢复",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        restoreMutation.mutate(fileName);
      }
    });
  }

  function commitImport() {
    setConfirmDialog({
      title: "清空并导入",
      message: "确认清空当前账务数据并导入该文件？建议先创建备份。",
      confirmLabel: "清空并导入",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        commitMutation.mutate();
      }
    });
  }

  return (
    <main className="data-page">
      <header className="section-header">
        <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft aria-hidden="true" />
        </button>
        <SegmentedControl
          value={activeTab}
          options={[
            { label: "导入", value: "import" },
            { label: "备份", value: "backup" }
          ]}
          onChange={setTab}
        />
        <span className="header-spacer" />
      </header>

      {activeTab === "import" ? (
        <section className="data-panel">
          <label className="file-picker">
            <Upload aria-hidden="true" />
            <span>{file ? file.name : "选择口袋记账导出的 .xls 文件"}</span>
            <input
              accept=".xls,.xlsx,.csv"
              type="file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setImportMessage("");
              }}
            />
          </label>
          <button
            className="primary-action full-width-action"
            disabled={previewMutation.isPending || !file}
            type="button"
            onClick={() => previewMutation.mutate()}
          >
            <Upload aria-hidden="true" />
            {previewMutation.isPending ? "预览中..." : "预览导入"}
          </button>
          {preview ? (
            <>
              <div className="form-hint">
                数据范围：{preview.summary.dateRange.from ?? "-"} 至 {preview.summary.dateRange.to ?? "-"}
              </div>
              <SummaryGrid summary={preview.summary} />
              <button
                className="danger-action"
                disabled={commitMutation.isPending}
                type="button"
                onClick={commitImport}
              >
                {commitMutation.isPending ? "导入中..." : "清空当前数据并导入"}
              </button>
            </>
          ) : null}
          {importMessage ? <div className="form-hint">{importMessage}</div> : null}
          {importsQuery.data?.length ? (
            <div className="data-list">
              {importsQuery.data.map((item) => (
                <article key={item.id}>
                  <strong>{item.id}</strong>
                  <span>
                    {item.summary.dateRange.from ?? "-"} 至 {item.summary.dateRange.to ?? "-"}
                  </span>
                  <b>{item.rowsSuccess} 行</b>
                </article>
              ))}
            </div>
          ) : null}
          {importsQuery.isLoading ? <p className="empty-state">正在读取导入记录...</p> : null}
          {importsQuery.isError ? <div className="form-error">导入记录读取失败。</div> : null}
        </section>
      ) : null}

      {activeTab === "backup" ? (
        <section className="data-panel">
          <button
            className="primary-action full-width-action"
            disabled={createBackupMutation.isPending}
            type="button"
            onClick={() => createBackupMutation.mutate()}
          >
            <DatabaseBackup aria-hidden="true" />
            {createBackupMutation.isPending ? "创建中..." : "创建备份"}
          </button>
          {backupMessage ? <div className="form-hint">{backupMessage}</div> : null}
          {backupsQuery.data?.length ? (
            <div className="data-list">
              {backupsQuery.data.map((item) => (
                <article key={item.id}>
                  <strong>{item.fileName}</strong>
                  <span>{formatBackupDateTime(item.createdAt)}</span>
                  <b>{formatMoney(item.sizeBytes / 1024)} KB</b>
                  <div className="data-actions">
                    <a className="secondary-action" href={item.downloadPath}>
                      <Download aria-hidden="true" />
                      下载
                    </a>
                    <button
                      className="danger-outline-action"
                      disabled={restoreMutation.isPending}
                      type="button"
                      onClick={() => restoreBackup(item.fileName)}
                    >
                      <RotateCcw aria-hidden="true" />
                      恢复
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {backupsQuery.isLoading ? <p className="empty-state">正在读取备份记录...</p> : null}
          {backupsQuery.isError ? <div className="form-error">备份记录读取失败。</div> : null}
        </section>
      ) : null}

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </main>
  );
}
