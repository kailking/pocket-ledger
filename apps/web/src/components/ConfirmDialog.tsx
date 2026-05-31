import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <section
        className={`confirm-dialog ${tone === "danger" ? "confirm-dialog--danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__icon" aria-hidden="true">
          <AlertTriangle />
        </div>
        <div className="confirm-dialog__copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="confirm-dialog__actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={tone === "danger" ? "danger-action" : "primary-action"} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
