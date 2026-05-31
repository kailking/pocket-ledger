import { useMemo, useState } from "react";
import type { CategorySummary, CategoryType } from "@pocket-ledger/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { queryClient } from "../app/queryClient";
import { BottomSheet } from "../components/BottomSheet";
import { CategoryIcon } from "../components/CategoryIcon";
import { ConfirmDialog, type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { SegmentedControl } from "../components/SegmentedControl";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { fallbackExpenseCategories, fallbackIncomeCategories } from "../lib/ledgerStore";

interface OperationResult {
  id?: string;
  module?: string;
  status?: string;
}

const colorOptions = ["#8FD8F7", "#FFC76F", "#98AAFF", "#74CFC5", "#FF8F98", "#8BE0B2", "#B4A0DF", "#C7847A"];
const iconOptions = ["star", "utensils", "bus-front", "wallet", "briefcase-business", "gift", "home", "circle-dollar-sign"];

function isScaffolded(result: OperationResult): boolean {
  return result.status === "scaffolded";
}

export function CategoryManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = searchParams.get("type") === "income" ? "income" : "expense";
  const [activeType, setActiveType] = useState<CategoryType>(initialType);
  const [editingCategory, setEditingCategory] = useState<CategorySummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(iconOptions[0] ?? "star");
  const [color, setColor] = useState(colorOptions[0] ?? "#8FD8F7");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<CategorySummary[]>("/api/categories")
  });
  const categories = useMemo(() => {
    const fallback = activeType === "income" ? fallbackIncomeCategories : fallbackExpenseCategories;
    const source = data?.length ? data : fallback;
    return source.filter((category) => category.type === activeType);
  }, [activeType, data]);
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), type: activeType, icon, color };
      if (editingCategory) {
        return apiPut<OperationResult>(`/api/categories/${editingCategory.id}`, body);
      }
      return apiPost<OperationResult>("/api/categories", body);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setNotice(isScaffolded(result) ? "分类保存接口暂未接入，当前仅完成前端操作流程。" : "分类已保存。");
      closeSheet();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "分类保存失败");
    }
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiDelete<OperationResult>(`/api/categories/${editingCategory?.id}`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setNotice(isScaffolded(result) ? "分类删除接口暂未接入，当前分类未从后端移除。" : "分类已删除。");
      closeSheet();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "分类删除失败");
    }
  });

  function setType(nextType: CategoryType) {
    setActiveType(nextType);
    setSearchParams({ type: nextType });
    setNotice("");
  }

  function openSheet(category?: CategorySummary) {
    setEditingCategory(category ?? null);
    setName(category?.name ?? "");
    setIcon(category?.icon ?? iconOptions[0] ?? "star");
    setColor(category?.color ?? colorOptions[0] ?? "#8FD8F7");
    setFormError("");
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingCategory(null);
    setFormError("");
  }

  function handleSave() {
    if (!name.trim()) {
      setFormError("请输入分类名称");
      return;
    }
    setFormError("");
    saveMutation.mutate();
  }

  function handleDelete() {
    if (!editingCategory) return;
    setConfirmDialog({
      title: "删除分类",
      message: `确认删除分类“${editingCategory.name}”？已有账单会保留原分类名称。`,
      confirmLabel: "删除",
      tone: "danger",
      onConfirm: () => {
        setConfirmDialog(null);
        deleteMutation.mutate();
      }
    });
  }

  return (
    <main className="category-page">
      <header className="section-header">
        <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft aria-hidden="true" />
        </button>
        <SegmentedControl
          value={activeType}
          options={[
            { label: "支出", value: "expense" },
            { label: "收入", value: "income" }
          ]}
          onChange={setType}
        />
        <button className="icon-button" type="button" onClick={() => openSheet()} aria-label="新增分类">
          <Plus aria-hidden="true" />
        </button>
      </header>

      {notice ? <div className="form-hint">{notice}</div> : null}
      {isLoading ? <p className="empty-state">正在读取分类...</p> : null}
      {isError ? (
        <div className="state-panel">
          <p>分类读取失败，当前展示内置分类。</p>
          <button type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      <div className="category-list">
        {categories.map((category) => (
          <button className="category-row" key={category.id} type="button" onClick={() => openSheet(category)}>
            <CategoryIcon color={category.color} icon={category.icon} label={category.name} size="sm" />
            <div>
              <strong>{category.name}</strong>
              <span>{category.type === "income" ? "收入分类" : "支出分类"}</span>
            </div>
            <span>编辑</span>
          </button>
        ))}
      </div>

      {sheetOpen ? (
        <BottomSheet
          title={editingCategory ? "编辑分类" : "新增分类"}
          confirmLabel={saveMutation.isPending ? "保存中" : "保存"}
          confirmDisabled={saveMutation.isPending}
          onClose={closeSheet}
          onConfirm={handleSave}
        >
          <div className="sheet-form">
            {formError ? <div className="form-error">{formError}</div> : null}
            <label className="sheet-field">
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="分类名称" />
            </label>
            <div className="icon-picker" aria-label="图标">
              {iconOptions.map((option) => (
                <button
                  className={icon === option ? "is-selected" : ""}
                  key={option}
                  type="button"
                  onClick={() => setIcon(option)}
                >
                  <CategoryIcon color={color} icon={option} size="sm" />
                  {icon === option ? <Check aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
            <div className="swatch-row" aria-label="颜色">
              {colorOptions.map((option) => (
                <button
                  className={color === option ? "is-selected" : ""}
                  key={option}
                  style={{ background: option }}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={option}
                />
              ))}
            </div>
            {editingCategory ? (
              <button
                className="danger-outline-action full-width-action"
                disabled={deleteMutation.isPending}
                type="button"
                onClick={handleDelete}
              >
                <Trash2 aria-hidden="true" />
                {deleteMutation.isPending ? "删除中..." : "删除分类"}
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}

      {confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </main>
  );
}
