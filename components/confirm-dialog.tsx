"use client";

import { type ReactNode, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "@/components/icons";
import { useOverlayFocus } from "@/components/use-overlay-focus";

function emptySubscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Quay lại",
  tone = "danger",
  pending = false,
  confirmDisabled = false,
  className,
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
  confirmDisabled?: boolean;
  className?: string;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const mounted = useIsClient();
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useOverlayFocus({
    open,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    pending,
    onDismiss: onCancel,
  });

  if (!open || !mounted) return null;

  return createPortal(
    <div className="confirm-dialog-layer">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Đóng hộp thoại xác nhận"
        onClick={onCancel}
        disabled={pending}
      />
      <section
        ref={dialogRef}
        data-overlay-focus-root="true"
        className={`confirm-dialog${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="confirm-dialog-header">
          <div className={`confirm-dialog-icon confirm-dialog-icon-${tone}`}>
            <AlertTriangle size={26} />
          </div>
          <div className="confirm-dialog-copy">
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </div>
        {children ? (
          <div className="confirm-dialog-body">{children}</div>
        ) : null}
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
            disabled={pending || confirmDisabled}
          >
            {pending ? "Đang xử lý…" : confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
