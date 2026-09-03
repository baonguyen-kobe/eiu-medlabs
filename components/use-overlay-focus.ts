"use client";

import { type RefObject, useEffect, useRef } from "react";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let scrollLockDepth = 0;
let previousBodyOverflow = "";

function isTopmostOverlay(element: HTMLElement) {
  const overlays = document.querySelectorAll<HTMLElement>(
    '[data-overlay-focus-root="true"]',
  );
  return overlays[overlays.length - 1] === element;
}

export function useOverlayFocus({
  open,
  containerRef,
  initialFocusRef,
  returnFocusRef,
  pending = false,
  onDismiss,
}: {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  pending?: boolean;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  const pendingRef = useRef(pending);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) return;

    const root = containerRef.current;
    if (!root) return;
    const overlay = root;
    const returnFocusElement = returnFocusRef?.current;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    if (scrollLockDepth++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    requestAnimationFrame(() => initialFocusRef?.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopmostOverlay(overlay)) return;
      if (event.key === "Escape" && !pendingRef.current) {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        overlay.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey
          ? active === first || !overlay.contains(active)
          : active === last || !overlay.contains(active)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (--scrollLockDepth === 0)
        document.body.style.overflow = previousBodyOverflow;
      (returnFocusElement ?? previousActiveElement)?.focus();
    };
  }, [containerRef, initialFocusRef, open, returnFocusRef]);
}
