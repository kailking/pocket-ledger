import type { CategorySummary } from "@pocket-ledger/shared";
import { Edit3, Plus } from "lucide-react";

import { CategoryIcon } from "./CategoryIcon";

interface CategoryGridProps {
  categories: CategorySummary[];
  selectedId?: string | undefined;
  editing?: boolean | undefined;
  onManage?: (() => void) | undefined;
  onSelect?: ((category: CategorySummary) => void) | undefined;
}

export function CategoryGrid({ categories, selectedId, editing = false, onManage, onSelect }: CategoryGridProps) {
  return (
    <div className="category-grid">
      {categories.map((category) => (
        <button
          className={`category-grid__item ${selectedId === category.id ? "is-selected" : ""}`}
          key={category.id}
          onClick={() => onSelect?.(category)}
          type="button"
        >
          {editing ? <span className="category-grid__delete">×</span> : null}
          <CategoryIcon color={category.color} icon={category.icon} label={category.name} />
          <span>{category.name}</span>
        </button>
      ))}
      <button className="category-grid__item" onClick={onManage} type="button">
        <span className="category-icon category-icon--md category-icon--muted">
          {editing ? <Edit3 aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </span>
        <span>{editing ? "完成" : "编辑"}</span>
      </button>
    </div>
  );
}
