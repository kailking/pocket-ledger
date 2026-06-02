import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string | undefined;
  confirmDisabled?: boolean | undefined;
  onClose: () => void;
  onConfirm?: (() => void) | undefined;
}

export function BottomSheet({ title, children, confirmLabel = "完成", confirmDisabled = false, onClose, onConfirm }: BottomSheetProps) {
  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <strong>{title}</strong>
          <button type="button" disabled={confirmDisabled} onClick={onConfirm ?? onClose}>
            {confirmLabel}
          </button>
        </header>
        {children}
      </section>
    </div>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}
