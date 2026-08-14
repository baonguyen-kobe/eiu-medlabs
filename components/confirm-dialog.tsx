"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { AlertTriangle } from "@/components/icons";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Quay lại",
  tone = "danger",
  pending = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onCancel, open, pending]);

  if (!open) return null;

  return (
    <div className="confirm-dialog-layer">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Đóng hộp thoại xác nhận"
        onClick={onCancel}
        disabled={pending}
      />
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className={`confirm-dialog-icon confirm-dialog-icon-${tone}`}>
          <AlertTriangle size={26} />
        </div>
        <div className="confirm-dialog-copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        {children}
        <footer className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${tone === "danger" ? "button-danger" : "button-primary"}`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Đang xử lý…" : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
